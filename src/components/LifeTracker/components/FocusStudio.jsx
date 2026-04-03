import { useEffect, useMemo, useRef, useState } from 'react'
import { loadFocusData, loadTodos, STORAGE_KEYS } from '../lib/analytics'
import { writeJson } from '../lib/storage'

const STORAGE_KEY = STORAGE_KEYS.focus
const PRESETS = [
  { label: 'Sprint', minutes: 25 },
  { label: 'Deep Work', minutes: 50 },
  { label: 'Reset', minutes: 10 },
]

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export default function FocusStudio() {
  const [focusData, setFocusData] = useState(() => loadFocusData())
  const [todos, setTodos] = useState(() => loadTodos())
  const [remainingSeconds, setRemainingSeconds] = useState(loadFocusData().durationMinutes * 60)
  const [isRunning, setIsRunning] = useState(false)
  const notifiedRef = useRef(false)

  useEffect(() => {
    const refresh = () => {
      const next = loadFocusData()
      setFocusData(next)
      setTodos(loadTodos())
      if (!isRunning) {
        setRemainingSeconds(next.durationMinutes * 60)
      }
    }

    window.addEventListener('lifetracker:sync', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('lifetracker:sync', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [isRunning])

  useEffect(() => {
    if (!isRunning) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setRemainingSeconds(value => Math.max(value - 1, 0))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [isRunning])

  useEffect(() => {
    if (remainingSeconds !== 0 || notifiedRef.current) {
      return
    }

    notifiedRef.current = true
    setIsRunning(false)

    const completedSession = {
      id: Date.now(),
      completedAt: new Date().toISOString(),
      durationMinutes: focusData.durationMinutes,
      taskId: focusData.selectedTaskId,
      intention: focusData.intention,
    }

    const next = {
      ...focusData,
      sessions: [completedSession, ...focusData.sessions].slice(0, 20),
    }
    setFocusData(next)
    writeJson(STORAGE_KEY, next)

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Focus session complete', {
        body: focusData.intention || 'Time for a short reset.',
      })
    }
  }, [focusData, remainingSeconds])

  const selectedTask = useMemo(
    () => todos.find(todo => todo.id === focusData.selectedTaskId) || null,
    [focusData.selectedTaskId, todos],
  )

  const completedToday = focusData.sessions.filter(session =>
    session.completedAt.slice(0, 10) === new Date().toISOString().slice(0, 10),
  ).length

  const totalMinutesThisWeek = focusData.sessions
    .filter(session => new Date(session.completedAt) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    .reduce((sum, session) => sum + session.durationMinutes, 0)

  function updateFocusData(patch) {
    const next = { ...focusData, ...patch }
    setFocusData(next)
    writeJson(STORAGE_KEY, next)
  }

  function applyPreset(minutes) {
    notifiedRef.current = false
    updateFocusData({ durationMinutes: minutes })
    setRemainingSeconds(minutes * 60)
    setIsRunning(false)
  }

  function toggleTimer() {
    if (remainingSeconds === 0) {
      setRemainingSeconds(focusData.durationMinutes * 60)
      notifiedRef.current = false
    }

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => undefined)
    }

    setIsRunning(value => !value)
  }

  function resetTimer() {
    setIsRunning(false)
    notifiedRef.current = false
    setRemainingSeconds(focusData.durationMinutes * 60)
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-sky-900 px-6 py-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">Focus Studio</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Single-task execution</h2>
          <p className="mt-2 text-sm text-slate-300">
            Lock onto one task, run timed sessions, and build a history of deliberate work.
          </p>

          <div className="mt-8 text-center">
            <p className="text-[72px] font-semibold tracking-tight sm:text-[92px]">{formatTime(remainingSeconds)}</p>
            <p className="mt-2 text-sm text-slate-400">
              {selectedTask ? `Working on: ${selectedTask.text}` : focusData.intention || 'Choose a task or set an intention'}
            </p>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <button
              onClick={toggleTimer}
              className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-sky-400"
            >
              {isRunning ? 'Pause' : 'Start session'}
            </button>
            <button
              onClick={resetTimer}
              className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/15"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Sessions Today</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{completedToday}</p>
            <p className="mt-1 text-sm text-slate-500">Completed focus cycles.</p>
          </div>
          <div className="rounded-[28px] border border-sky-100 bg-sky-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Minutes This Week</p>
            <p className="mt-2 text-3xl font-semibold text-sky-950">{totalMinutesThisWeek}</p>
            <p className="mt-1 text-sm text-sky-800">Accumulated attention time.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Setup</p>
          <div className="mt-4 grid gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Intention</label>
              <input
                value={focusData.intention}
                onChange={event => updateFocusData({ intention: event.target.value })}
                placeholder="What does a successful session look like?"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Attach to task</label>
              <select
                value={focusData.selectedTaskId ?? ''}
                onChange={event => updateFocusData({ selectedTaskId: event.target.value ? Number(event.target.value) : null })}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
              >
                <option value="">No linked task</option>
                {todos.filter(todo => !todo.done).slice(0, 20).map(todo => (
                  <option key={todo.id} value={todo.id}>{todo.text}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Session preset</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {PRESETS.map(preset => (
                  <button
                    key={preset.minutes}
                    onClick={() => applyPreset(preset.minutes)}
                    className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                      focusData.durationMinutes === preset.minutes
                        ? 'bg-slate-950 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {preset.label} · {preset.minutes}m
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Session History</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">Recent deep work</h3>
            </div>
            <p className="text-xs text-slate-400">Last 20 sessions</p>
          </div>

          <div className="mt-5 space-y-3">
            {focusData.sessions.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
                No sessions completed yet.
              </div>
            ) : (
              focusData.sessions.map(session => (
                <div key={session.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {session.intention || 'Focus session'}
                    </p>
                    <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                      {session.durationMinutes}m
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(session.completedAt).toLocaleString('en', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
