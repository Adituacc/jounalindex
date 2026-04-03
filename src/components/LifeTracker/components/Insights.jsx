import { useEffect, useState } from 'react'
import {
  getActivitySeries,
  getActiveDaysThisWeek,
  getAgenda,
  getDashboardSnapshot,
  getGamificationSnapshot,
  getRecentNotes,
  isWorkspaceEmpty,
  loadActivityData,
  STORAGE_KEYS,
} from '../lib/analytics'
import { ACHIEVEMENT_DEFS } from '../lib/gamification'
import { readJson, writeJson } from '../lib/storage'

const MOODS = {
  great: 'Flowing',
  okay: 'Steady',
  low: 'Low energy',
}

const BACKUP_VERSION = 2

function getInsights() {
  const snapshot = getDashboardSnapshot()
  const gamification = getGamificationSnapshot()
  const activityData = loadActivityData()
  const series = getActivitySeries(activityData.log, 14)
  const agenda = getAgenda(6)
  const recentNotes = getRecentNotes(4)
  const todayMood = activityData.moodByDate?.[new Date().toISOString().slice(0, 10)] || null
  const activeDaysThisWeek = getActiveDaysThisWeek(activityData.log)
  const bestDay = [...series].sort((left, right) => right.count - left.count)[0]
  const completionAverage =
    series.reduce((sum, day) => sum + day.count, 0) / Math.max(series.length, 1)

  return {
    snapshot,
    gamification,
    series,
    agenda,
    recentNotes,
    todayMood,
    activeDaysThisWeek,
    bestDay,
    completionAverage,
    isEmpty: isWorkspaceEmpty(),
  }
}

function getBackupPayload() {
  return {
    app: 'Life Tracker',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      todos: readJson(STORAGE_KEYS.todos, []),
      activities: readJson(STORAGE_KEYS.activities, {}),
      notes: readJson(STORAGE_KEYS.notes, []),
      focus: readJson(STORAGE_KEYS.focus, {}),
      planning: readJson(STORAGE_KEYS.planning, {}),
    },
  }
}

function getImportSections(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('invalid-backup')
  }

  const source = payload.data && typeof payload.data === 'object' ? payload.data : payload
  const todos = Array.isArray(source.todos) ? source.todos : []
  const activities = source.activities && typeof source.activities === 'object' ? source.activities : {}
  const notes = Array.isArray(source.notes) ? source.notes : []
  const focus = source.focus && typeof source.focus === 'object' ? source.focus : {}
  const planning = source.planning && typeof source.planning === 'object' ? source.planning : {}

  return { todos, activities, notes, focus, planning }
}

export default function Insights({ onNavigate }) {
  const [insights, setInsights] = useState(() => getInsights())
  const [importStatus, setImportStatus] = useState('')

  useEffect(() => {
    const refresh = () => setInsights(getInsights())

    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('lifetracker:sync', refresh)

    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('lifetracker:sync', refresh)
    }
  }, [])

  function exportData() {
    const payload = getBackupPayload()

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `life-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  function importData(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = loadEvent => {
      try {
        const payload = JSON.parse(String(loadEvent.target?.result || '{}'))
        const nextData = getImportSections(payload)
        writeJson(STORAGE_KEYS.todos, nextData.todos)
        writeJson(STORAGE_KEYS.activities, nextData.activities)
        writeJson(STORAGE_KEYS.notes, nextData.notes)
        writeJson(STORAGE_KEYS.focus, nextData.focus)
        writeJson(STORAGE_KEYS.planning, nextData.planning)
        setInsights(getInsights())
        setImportStatus('Backup imported successfully.')
      } catch {
        setImportStatus('Import failed. Choose a valid backup JSON file.')
      }
    }

    reader.readAsText(file)
    event.target.value = ''
  }

  return (
    <div className="space-y-6">
      {insights.isEmpty && (
        <section className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-sm ring-1 ring-sky-100 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Launchpad</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Your workspace is ready. Start with the three actions that make the app feel useful immediately.</h3>
              <p className="mt-2 text-sm text-slate-600">
                Add one task, set one weekly objective, and capture one note. After that, the rest of the dashboard becomes much more informative.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[28rem]">
              <button
                onClick={() => onNavigate?.('todos')}
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Add first task
              </button>
              <button
                onClick={() => onNavigate?.('planner')}
                className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                Set weekly objective
              </button>
              <button
                onClick={() => onNavigate?.('notes')}
                className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                Capture first note
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[28px] bg-gradient-to-br from-indigo-600 via-sky-600 to-cyan-500 px-6 py-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-100">Executive View</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Insights</h2>
          <p className="mt-2 max-w-xl text-sm text-sky-50/90">
            See what matters today, where momentum is slipping, and what needs attention next.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm text-sky-50">
            <span className="rounded-full bg-white/15 px-3 py-1.5">
              {insights.snapshot.todos.overdue} overdue tasks
            </span>
            <span className="rounded-full bg-white/15 px-3 py-1.5">
              {insights.activeDaysThisWeek}/{insights.snapshot.activities.weeklyTarget} active days this week
            </span>
            <span className="rounded-full bg-white/15 px-3 py-1.5">
              Mood: {insights.todayMood ? MOODS[insights.todayMood] : 'Not checked in'}
            </span>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Backup</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-900">Export your workspace</h3>
          <p className="mt-2 text-sm text-slate-500">
            Premium tools usually protect your data. This exports tasks, habit history, notes, focus sessions, and planning data as JSON.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={exportData}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Export backup
            </button>
            <label className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100">
              Import backup
              <input type="file" accept="application/json" className="hidden" onChange={importData} />
            </label>
          </div>
          <p className="mt-3 text-xs text-slate-400">Backup format v{BACKUP_VERSION}. Older backups are still accepted.</p>
          {importStatus && <p className="mt-3 text-sm text-slate-500">{importStatus}</p>}
        </div>
      </div>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Gamification</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">Trophy Case</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-bold text-white">
              {insights.gamification.level}
            </div>
            <div>
              <p className="text-xs font-medium text-amber-700">Level {insights.gamification.level}</p>
              <p className="text-[10px] text-amber-500">{insights.gamification.xp} XP total</p>
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {ACHIEVEMENT_DEFS.map(ach => {
            const unlocked = insights.gamification.achievements.some(a => a.id === ach.id)
            return (
              <div
                key={ach.id}
                className={`rounded-2xl border px-3 py-3 text-center transition ${
                  unlocked
                    ? 'border-amber-200 bg-amber-50 shadow-sm'
                    : 'border-slate-100 bg-slate-50 opacity-40'
                }`}
              >
                <span className="text-2xl">{ach.icon}</span>
                <p className="mt-1 text-xs font-semibold text-slate-900">{ach.name}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">{ach.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Focus Queue</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{insights.snapshot.todos.focus}</p>
          <p className="mt-1 text-sm text-slate-500">High-priority tasks waiting to be completed.</p>
        </article>
        <article className="rounded-[28px] border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Habit Average</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-950">{insights.completionAverage.toFixed(1)}</p>
          <p className="mt-1 text-sm text-emerald-800">Average completions over the last 14 days.</p>
        </article>
        <article className="rounded-[28px] border border-amber-100 bg-amber-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Knowledge Vault</p>
          <p className="mt-2 text-3xl font-semibold text-amber-950">{insights.snapshot.notes.pinned}</p>
          <p className="mt-1 text-sm text-amber-800">Pinned notes available for quick recall.</p>
        </article>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.9fr]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Upcoming Agenda</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">Next actions</h3>
            </div>
            <p className="text-xs text-slate-400">Top {insights.agenda.length} open items</p>
          </div>

          <div className="mt-5 space-y-3">
            {insights.agenda.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
                No pending tasks. Your queue is clear.
              </div>
            ) : (
              insights.agenda.map(todo => (
                <div key={todo.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    todo.priority === 'high'
                      ? 'bg-rose-100 text-rose-700'
                      : todo.priority === 'medium'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {todo.priority}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{todo.text}</p>
                    <p className="text-xs text-slate-500">
                      {todo.dueDate ? `Due ${todo.dueDate}` : 'No due date'}
                      {todo.tag ? ` · ${todo.tag}` : ''}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="grid gap-4">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Performance</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">14-day trend</h3>
            <div className="mt-5 flex items-end gap-2">
              {insights.series.map(day => (
                <div key={day.key} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-28 w-full items-end rounded-2xl bg-slate-100 p-1">
                    <div
                      className="w-full rounded-xl bg-sky-500 transition-[height]"
                      style={{ height: `${Math.max(day.count * 18, 10)}px` }}
                      title={`${day.dateLabel}: ${day.count}`}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400">{day.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Best day: {insights.bestDay?.dateLabel || 'N/A'} with {insights.bestDay?.count || 0} completions.
            </p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recent Notes</p>
            <div className="mt-4 space-y-3">
              {insights.recentNotes.length === 0 ? (
                <p className="text-sm text-slate-400">No notes captured yet.</p>
              ) : (
                insights.recentNotes.map(note => (
                  <div key={note.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">{note.title || 'Untitled'}</p>
                      {note.pinned && <span className="text-[10px] font-medium text-amber-500">PINNED</span>}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{note.body || 'No content'}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
