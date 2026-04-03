import { useState, useEffect } from 'react'
import {
  compareTodos,
  getNextDueDate,
  groupTodosByMatrix,
  isOverdue,
  isToday,
  loadTodos,
  STORAGE_KEYS,
  todayKey,
} from '../lib/analytics'
import { writeJson } from '../lib/storage'

const STORAGE_KEY = STORAGE_KEYS.todos
const PRIORITY_STYLES = {
  high: 'bg-rose-100 text-rose-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-emerald-100 text-emerald-700',
}

export default function TodoList() {
  const [todos, setTodos] = useState(() => loadTodos())
  const [draft, setDraft] = useState({
    text: '',
    dueDate: '',
    priority: 'medium',
    tag: '',
    recurrence: 'none',
    reminderTime: '',
    estimatedMinutes: 30,
  })
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [view, setView] = useState('list')
  const [subtaskParentId, setSubtaskParentId] = useState(null)
  const [calendarDate, setCalendarDate] = useState(() => new Date())
  const [selectedCalDay, setSelectedCalDay] = useState(null)

  useEffect(() => {
    writeJson(STORAGE_KEY, todos)
  }, [todos])

  useEffect(() => {
    const now = new Date()
    const currentDate = todayKey(now)
    const currentMinute = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    const dueReminders = todos.filter(todo =>
      !todo.done
      && todo.dueDate === currentDate
      && todo.reminderTime
      && todo.reminderTime === currentMinute
      && todo.lastReminderAt !== `${currentDate}T${currentMinute}`,
    )

    if (dueReminders.length === 0) {
      return
    }

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => undefined)
    }

    dueReminders.forEach(todo => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`Reminder: ${todo.text}`, {
          body: todo.tag ? `Project: ${todo.tag}` : 'Task reminder',
        })
      }
    })

    setTodos(prev => prev.map(todo => (
      dueReminders.some(item => item.id === todo.id)
        ? { ...todo, lastReminderAt: `${currentDate}T${currentMinute}` }
        : todo
    )))
  }, [todos])

  function addTodo(e) {
    e.preventDefault()
    const text = draft.text.trim()
    if (!text) return
    setTodos(prev => [
      ...prev,
      {
        id: Date.now(),
        text,
        done: false,
        createdAt: new Date().toISOString(),
        dueDate: draft.dueDate,
        priority: draft.priority,
        tag: draft.tag.trim(),
        recurrence: draft.recurrence,
        reminderTime: draft.reminderTime,
        estimatedMinutes: Number(draft.estimatedMinutes) || 0,
        parentId: subtaskParentId,
      },
    ])
    setDraft(prev => ({
      ...prev,
      text: '',
      dueDate: '',
      tag: '',
      reminderTime: '',
      estimatedMinutes: 30,
    }))
    setSubtaskParentId(null)
  }

  function toggle(id) {
    setTodos(prev => {
      const target = prev.find(todo => todo.id === id)
      if (!target) {
        return prev
      }

      const nextState = prev.map(todo => (todo.id === id ? { ...todo, done: !todo.done } : todo))

      if (!target.done && target.recurrence !== 'none' && target.dueDate) {
        return [
          ...nextState,
          {
            ...target,
            id: Date.now(),
            done: false,
            createdAt: new Date().toISOString(),
            dueDate: getNextDueDate(target.dueDate, target.recurrence),
            lastReminderAt: '',
          },
        ]
      }

      return nextState
    })
  }

  function remove(id) {
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  const normalizedSearch = search.trim().toLowerCase()
  const filtered = todos
    .filter(todo => {
      if (filter === 'active') return !todo.done
      if (filter === 'completed') return todo.done
      if (filter === 'today') return !todo.done && isToday(todo.dueDate)
      if (filter === 'upcoming') return !todo.done && todo.dueDate > new Date().toISOString().slice(0, 10)
      if (filter === 'overdue') return isOverdue(todo)
      return true
    })
    .filter(todo => {
      if (!normalizedSearch) return true
      return [todo.text, todo.tag, todo.priority, todo.dueDate]
        .filter(Boolean)
        .some(value => value.toLowerCase().includes(normalizedSearch))
    })
    .sort(compareTodos)

  const matrix = groupTodosByMatrix(filtered)

  const completedCount = todos.filter(t => t.done).length
  const progress = todos.length === 0 ? 0 : Math.round((completedCount / todos.length) * 100)
  const overdueCount = todos.filter(isOverdue).length
  const focusCount = todos.filter(todo => !todo.done && todo.priority === 'high').length
  const todayCount = todos.filter(todo => !todo.done && isToday(todo.dueDate)).length
  const workloadMinutes = filtered.filter(todo => !todo.done).reduce((sum, todo) => sum + (Number(todo.estimatedMinutes) || 0), 0)

  // Subtask grouping
  const topLevel = filtered.filter(t => !t.parentId)
  const childrenByParent = {}
  filtered.filter(t => t.parentId).forEach(t => {
    if (!childrenByParent[t.parentId]) childrenByParent[t.parentId] = []
    childrenByParent[t.parentId].push(t)
  })
  const orderedList = []
  topLevel.forEach(t => {
    orderedList.push(t)
    ;(childrenByParent[t.id] || []).forEach(sub => orderedList.push(sub))
  })

  // Kanban columns (group active tasks by tag)
  const kanbanColumns = {}
  filtered.filter(t => !t.done && !t.parentId).forEach(t => {
    const col = t.tag?.trim() || 'Inbox'
    if (!kanbanColumns[col]) kanbanColumns[col] = []
    kanbanColumns[col].push(t)
  })

  // Calendar helpers
  function getCalendarDays() {
    const year = calendarDate.getFullYear()
    const month = calendarDate.getMonth()
    const firstDayOfWeek = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days = []
    for (let i = 0; i < firstDayOfWeek; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      days.push({ day: d, key, tasks: todos.filter(t => t.dueDate === key && !t.parentId) })
    }
    return days
  }
  const calDays = view === 'calendar' ? getCalendarDays() : []
  const calDayTasks = selectedCalDay ? todos.filter(t => t.dueDate === selectedCalDay).sort(compareTodos) : []

  return (
    <div className="space-y-6">
      <div className="grid gap-3 lg:grid-cols-[1.45fr_1fr]">
        <div className="flex flex-col gap-4 rounded-[28px] bg-slate-950 px-5 py-6 text-white sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Planner</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">To-Do List</h2>
            <p className="mt-2 text-sm text-slate-300">
              {completedCount}/{todos.length} completed
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-400">
              <span>Daily progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800">
              <div
                className="h-2 rounded-full bg-sky-400 transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <div className="rounded-[28px] border border-rose-100 bg-rose-50 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">Overdue</p>
            <p className="mt-2 text-3xl font-semibold text-rose-950">{overdueCount}</p>
            <p className="mt-1 text-sm text-rose-800">Needs immediate attention.</p>
          </div>
          <div className="rounded-[28px] border border-amber-100 bg-amber-50 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Focus</p>
            <p className="mt-2 text-3xl font-semibold text-amber-950">{focusCount}</p>
            <p className="mt-1 text-sm text-amber-800">High-priority tasks queued.</p>
          </div>
          <div className="rounded-[28px] border border-sky-100 bg-sky-50 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Today</p>
            <p className="mt-2 text-3xl font-semibold text-sky-950">{todayCount}</p>
            <p className="mt-1 text-sm text-sky-800">Tasks scheduled for today.</p>
          </div>
          <div className="rounded-[28px] border border-violet-100 bg-violet-50 px-5 py-5 sm:col-span-3 lg:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Load</p>
            <p className="mt-2 text-3xl font-semibold text-violet-950">{workloadMinutes}m</p>
            <p className="mt-1 text-sm text-violet-800">Estimated work in current view.</p>
          </div>
        </div>
      </div>

      {subtaskParentId && (
        <div className="flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-700">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
          <span>Adding subtask to: <strong>{todos.find(t => t.id === subtaskParentId)?.text}</strong></span>
          <button onClick={() => setSubtaskParentId(null)} className="ml-auto text-violet-400 hover:text-violet-600">✕</button>
        </div>
      )}

      <form onSubmit={addTodo} className="grid gap-2 rounded-[28px] border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[minmax(0,1.35fr)_160px_140px_160px_150px_140px_140px_auto]">
        <input
          value={draft.text}
          onChange={e => setDraft(prev => ({ ...prev, text: e.target.value }))}
          placeholder="What needs to be done?"
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
        />
        <input
          type="date"
          value={draft.dueDate}
          onChange={e => setDraft(prev => ({ ...prev, dueDate: e.target.value }))}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
        />
        <select
          value={draft.priority}
          onChange={e => setDraft(prev => ({ ...prev, priority: e.target.value }))}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <input
          value={draft.tag}
          onChange={e => setDraft(prev => ({ ...prev, tag: e.target.value }))}
          placeholder="Tag or project"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
        />
        <select
          value={draft.recurrence}
          onChange={e => setDraft(prev => ({ ...prev, recurrence: e.target.value }))}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
        >
          <option value="none">No repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <input
          type="time"
          value={draft.reminderTime}
          onChange={e => setDraft(prev => ({ ...prev, reminderTime: e.target.value }))}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
        />
        <input
          type="number"
          min="0"
          step="5"
          value={draft.estimatedMinutes}
          onChange={e => setDraft(prev => ({ ...prev, estimatedMinutes: e.target.value }))}
          placeholder="Mins"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
        />
        <button
          type="submit"
          className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-sky-600"
        >
          Add
        </button>
      </form>

      <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by task, tag, priority, or date"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
        />

        <div className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1">
          {['all', 'active', 'today', 'upcoming', 'overdue', 'completed'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-xl px-3 py-2 text-xs font-medium capitalize whitespace-nowrap transition ${
                filter === f
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 rounded-2xl bg-slate-100 p-1 w-fit">
        {['list', 'kanban', 'matrix', 'calendar'].map(mode => (
          <button
            key={mode}
            onClick={() => setView(mode)}
            className={`rounded-xl px-3 py-2 text-xs font-medium capitalize transition ${
              view === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {view === 'list' ? (
        <ul className="space-y-2">
          {orderedList.length === 0 && (
            <li className="rounded-3xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
              {filter === 'all' ? 'No tasks yet — add one above!' : `No ${filter} tasks.`}
            </li>
          )}
          {orderedList.map(todo => (
            <li
              key={todo.id}
              className={`group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 ${
                todo.parentId ? 'ml-8 border-l-2 border-l-violet-300' : ''
              }`}
            >
              <button
                onClick={() => toggle(todo.id)}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                  todo.done
                    ? 'border-green-500 bg-green-500 text-white'
                    : 'border-slate-300 hover:border-blue-400'
                }`}
              >
                {todo.done && (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <span className={`flex-1 text-sm ${todo.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                <span className="block font-medium">{todo.text}</span>
                <span className="mt-1 flex flex-wrap gap-2 text-xs">
                  <span className={`rounded-full px-2 py-1 font-medium ${PRIORITY_STYLES[todo.priority]}`}>
                    {todo.priority}
                  </span>
                  {todo.tag && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500">{todo.tag}</span>}
                  {todo.dueDate && (
                    <span className={`rounded-full px-2 py-1 ${isOverdue(todo) ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                      Due {todo.dueDate}
                    </span>
                  )}
                  {todo.recurrence !== 'none' && <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-700">Repeats {todo.recurrence}</span>}
                  {todo.reminderTime && <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-700">Reminds {todo.reminderTime}</span>}
                  {!!Number(todo.estimatedMinutes) && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{todo.estimatedMinutes}m</span>}
                </span>
              </span>
              <span className="hidden rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500 sm:inline-flex">
                {new Date(todo.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
              </span>
              <button
                onClick={() => remove(todo.id)}
                className="text-slate-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                aria-label="Delete"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              {!todo.parentId && !todo.done && (
                <button
                  onClick={() => setSubtaskParentId(todo.id)}
                  className="text-slate-300 opacity-0 transition hover:text-sky-500 group-hover:opacity-100"
                  aria-label="Add subtask"
                  title="Add subtask"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : view === 'kanban' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Object.keys(kanbanColumns).length === 0 ? (
            <div className="col-span-full rounded-3xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
              No active tasks to show in kanban.
            </div>
          ) : Object.entries(kanbanColumns).map(([colName, tasks]) => (
            <section key={colName} className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">{colName}</h3>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">{tasks.length}</span>
              </div>
              <div className="mt-3 space-y-2">
                {tasks.map(todo => (
                  <div key={todo.id} className="group rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggle(todo.id)}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition hover:border-blue-400"
                      />
                      <p className="flex-1 text-sm font-medium text-slate-800">{todo.text}</p>
                      <button
                        onClick={() => remove(todo.id)}
                        className="text-slate-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                        aria-label="Delete"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_STYLES[todo.priority]}`}>{todo.priority}</span>
                      {todo.dueDate && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${isOverdue(todo) ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                          {todo.dueDate}
                        </span>
                      )}
                      {!!Number(todo.estimatedMinutes) && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">{todo.estimatedMinutes}m</span>
                      )}
                    </div>
                    {(childrenByParent[todo.id] || []).length > 0 && (
                      <p className="mt-1.5 text-[10px] text-slate-400">
                        {(childrenByParent[todo.id] || []).filter(s => s.done).length}/{(childrenByParent[todo.id] || []).length} subtasks
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : view === 'calendar' ? (
        <div className="space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setCalendarDate(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n })}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
              >
                ←
              </button>
              <h3 className="text-lg font-semibold text-slate-900">
                {calendarDate.toLocaleDateString('en', { month: 'long', year: 'numeric' })}
              </h3>
              <button
                onClick={() => setCalendarDate(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n })}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
              >
                →
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calDays.map((day, i) => day ? (
                <button
                  key={day.key}
                  onClick={() => setSelectedCalDay(day.key === selectedCalDay ? null : day.key)}
                  className={`rounded-xl p-2 text-center transition min-h-[3.5rem] ${
                    day.key === todayKey()
                      ? 'bg-sky-100 font-semibold text-sky-700'
                      : day.key === selectedCalDay
                        ? 'bg-slate-200 font-semibold'
                        : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="text-sm">{day.day}</span>
                  {day.tasks.length > 0 && (
                    <div className="mt-1 flex justify-center gap-0.5">
                      {day.tasks.slice(0, 3).map((t, j) => (
                        <div
                          key={j}
                          className={`h-1.5 w-1.5 rounded-full ${
                            t.priority === 'high' ? 'bg-rose-400' : t.priority === 'medium' ? 'bg-amber-400' : 'bg-emerald-400'
                          }`}
                        />
                      ))}
                      {day.tasks.length > 3 && <span className="text-[8px] text-slate-400">+{day.tasks.length - 3}</span>}
                    </div>
                  )}
                </button>
              ) : (
                <div key={`empty-${i}`} />
              ))}
            </div>
          </div>
          {selectedCalDay && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-700">
                Tasks for {new Date(selectedCalDay + 'T12:00:00').toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h4>
              {calDayTasks.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center rounded-2xl border border-dashed border-slate-200">No tasks scheduled.</p>
              ) : calDayTasks.map(todo => (
                <div key={todo.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <button
                    onClick={() => toggle(todo.id)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                      todo.done ? 'border-green-500 bg-green-500 text-white' : 'border-slate-300 hover:border-blue-400'
                    }`}
                  >
                    {todo.done && (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <span className={`flex-1 text-sm ${todo.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{todo.text}</span>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${PRIORITY_STYLES[todo.priority]}`}>{todo.priority}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {[
            ['do', 'Do First', 'Urgent + important'],
            ['schedule', 'Schedule', 'Important, not urgent'],
            ['delegate', 'Delegate', 'Urgent, lower importance'],
            ['reduce', 'Reduce', 'Neither urgent nor important'],
          ].map(([key, label, description]) => (
            <section key={key} className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-lg font-semibold text-slate-900">{label}</h3>
              <p className="mt-1 text-sm text-slate-500">{description}</p>
              <div className="mt-4 space-y-2">
                {matrix[key].length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">No tasks</div>
                ) : (
                  matrix[key].map(todo => (
                    <button
                      key={todo.id}
                      onClick={() => toggle(todo.id)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-slate-300"
                    >
                      <p className="text-sm font-medium text-slate-900">{todo.text}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {todo.dueDate ? `Due ${todo.dueDate}` : 'No due date'}
                        {todo.tag ? ` · ${todo.tag}` : ''}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Clear completed */}
      {completedCount > 0 && (
        <button
          onClick={() => setTodos(prev => prev.filter(t => !t.done))}
          className="text-xs font-medium text-slate-400 transition hover:text-red-500"
        >
          Clear {completedCount} completed task{completedCount > 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}
