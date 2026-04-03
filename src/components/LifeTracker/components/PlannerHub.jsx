import { useEffect, useMemo, useState } from 'react'
import {
  loadPlanningData,
  loadTodos,
  STORAGE_KEYS,
  todayKey,
} from '../lib/analytics'
import { writeJson } from '../lib/storage'

function emptyShutdown() {
  return {
    wins: '',
    looseEnds: '',
    tomorrow: '',
    highlight: '',
  }
}

export default function PlannerHub() {
  const [planning, setPlanning] = useState(() => loadPlanningData())
  const [todos, setTodos] = useState(() => loadTodos())
  const [objectiveDraft, setObjectiveDraft] = useState('')
  const today = todayKey()
  const shutdown = planning.shutdownByDate[today] || emptyShutdown()

  useEffect(() => {
    const refresh = () => {
      setPlanning(loadPlanningData())
      setTodos(loadTodos())
    }

    window.addEventListener('lifetracker:sync', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('lifetracker:sync', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  const todayPlan = useMemo(() => {
    return todos.filter(todo => !todo.done && (todo.dueDate === today || !todo.dueDate))
  }, [todos, today])

  const plannedMinutes = todayPlan.reduce((sum, todo) => sum + (Number(todo.estimatedMinutes) || 0), 0)
  const capacityMinutes = planning.dailyCapacityHours * 60
  const capacityPercent = capacityMinutes === 0 ? 0 : Math.min(100, Math.round((plannedMinutes / capacityMinutes) * 100))

  function persist(nextPlanning) {
    setPlanning(nextPlanning)
    writeJson(STORAGE_KEYS.planning, nextPlanning)
  }

  function updateShutdown(field, value) {
    persist({
      ...planning,
      shutdownByDate: {
        ...planning.shutdownByDate,
        [today]: {
          ...shutdown,
          [field]: value,
        },
      },
    })
  }

  function addObjective(e) {
    e.preventDefault()
    const title = objectiveDraft.trim()
    if (!title) return
    persist({
      ...planning,
      weeklyObjectives: [
        { id: Date.now(), title, done: false },
        ...planning.weeklyObjectives,
      ],
    })
    setObjectiveDraft('')
  }

  function toggleObjective(id) {
    persist({
      ...planning,
      weeklyObjectives: planning.weeklyObjectives.map(objective =>
        objective.id === id ? { ...objective, done: !objective.done } : objective,
      ),
    })
  }

  function removeObjective(id) {
    persist({
      ...planning,
      weeklyObjectives: planning.weeklyObjectives.filter(objective => objective.id !== id),
    })
  }

  function updateCapacity(hours) {
    persist({
      ...planning,
      dailyCapacityHours: hours,
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[28px] bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-400 px-6 py-6 text-slate-950">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-900/70">Planning Ritual</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Plan calmly, finish cleanly</h2>
          <p className="mt-2 max-w-xl text-sm text-amber-950/80">
            Inspired by guided daily planners: set weekly intent, balance your workload, and close the day with a proper shutdown.
          </p>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Workload</p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="text-3xl font-semibold text-slate-950">{plannedMinutes}m</p>
            <select
              value={planning.dailyCapacityHours}
              onChange={event => updateCapacity(Number(event.target.value))}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
            >
              {[3, 4, 5, 6, 7, 8].map(hours => (
                <option key={hours} value={hours}>{hours}h capacity</option>
              ))}
            </select>
          </div>
          <div className="mt-4 h-2 rounded-full bg-slate-100">
            <div
              className={`h-2 rounded-full transition-[width] ${capacityPercent > 100 ? 'bg-rose-500' : 'bg-amber-500'}`}
              style={{ width: `${Math.min(capacityPercent, 100)}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {plannedMinutes <= capacityMinutes
              ? 'Your plan fits inside your intended day.'
              : 'Your plan is overloaded. Push, delegate, or trim scope.'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Weekly Objectives</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">Big rocks</h3>
            </div>
            <p className="text-xs text-slate-400">{planning.weeklyObjectives.filter(item => item.done).length}/{planning.weeklyObjectives.length} done</p>
          </div>

          <form onSubmit={addObjective} className="mt-4 flex gap-2">
            <input
              value={objectiveDraft}
              onChange={event => setObjectiveDraft(event.target.value)}
              placeholder="Add a weekly objective"
              className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
            />
            <button className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800">Add</button>
          </form>

          <div className="mt-4 space-y-2">
            {planning.weeklyObjectives.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
                No weekly objectives yet.
              </div>
            ) : (
              planning.weeklyObjectives.map(objective => (
                <div key={objective.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <button
                    onClick={() => toggleObjective(objective.id)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${objective.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}
                  >
                    {objective.done && <span className="text-[10px]">✓</span>}
                  </button>
                  <span className={`flex-1 text-sm ${objective.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{objective.title}</span>
                  <button onClick={() => removeObjective(objective.id)} className="text-xs font-medium text-slate-400 transition hover:text-rose-500">Remove</button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Daily Shutdown</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">End-of-day review</h3>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Wins</span>
              <textarea
                value={shutdown.wins}
                onChange={event => updateShutdown('wins', event.target.value)}
                placeholder="What moved forward today?"
                className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Loose ends</span>
              <textarea
                value={shutdown.looseEnds}
                onChange={event => updateShutdown('looseEnds', event.target.value)}
                placeholder="What still needs attention?"
                className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Tomorrow's focus</span>
              <textarea
                value={shutdown.tomorrow}
                onChange={event => updateShutdown('tomorrow', event.target.value)}
                placeholder="What must matter first tomorrow?"
                className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Daily highlight</span>
              <textarea
                value={shutdown.highlight}
                onChange={event => updateShutdown('highlight', event.target.value)}
                placeholder="What is the one highlight worth remembering?"
                className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
              />
            </label>
          </div>
        </section>
      </div>
    </div>
  )
}
