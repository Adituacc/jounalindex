import { useEffect, useState } from 'react'
import CommandCenter from './components/CommandCenter'
import FocusStudio from './components/FocusStudio'
import Insights from './components/Insights'
import PlannerHub from './components/PlannerHub'
import TodoList from './components/TodoList'
import ActivityTracker from './components/ActivityTracker'
import Notes from './components/Notes'
import { getDashboardSnapshot, getGamificationSnapshot } from './lib/analytics'

const TABS = [
  {
    key: 'insights',
    label: 'Insights',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 2 2 5-5m2 12H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    key: 'focus',
    label: 'Focus',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 4v5c0 5-3.5 8.74-7 10-3.5-1.26-7-5-7-10V7l7-4z" />
      </svg>
    ),
  },
  {
    key: 'planner',
    label: 'Planner',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'todos',
    label: 'To‑Do',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    key: 'activities',
    label: 'Activities',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    key: 'notes',
    label: 'Notes',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  },
]

export default function LifeTrackerApp() {
  const [tab, setTab] = useState('insights')
  const [snapshot, setSnapshot] = useState(() => getDashboardSnapshot())
  const [gamification, setGamification] = useState(() => getGamificationSnapshot())
  const [isCommandCenterOpen, setIsCommandCenterOpen] = useState(false)
  const darkMode = true
  const today = new Date().toLocaleDateString('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  useEffect(() => {
    const refreshSnapshot = () => {
      setSnapshot(getDashboardSnapshot())
      setGamification(getGamificationSnapshot())
    }

    window.addEventListener('storage', refreshSnapshot)
    window.addEventListener('focus', refreshSnapshot)
    window.addEventListener('lifetracker:sync', refreshSnapshot)

    return () => {
      window.removeEventListener('storage', refreshSnapshot)
      window.removeEventListener('focus', refreshSnapshot)
      window.removeEventListener('lifetracker:sync', refreshSnapshot)
    }
  }, [])

  function renderTabButton(nextTab) {
    return (
      <button
        key={nextTab.key}
        onClick={() => setTab(nextTab.key)}
        className={`flex items-center justify-center gap-2 rounded-[18px] px-4 py-3 text-sm font-medium transition ${
          tab === nextTab.key
            ? 'bg-white text-slate-950 shadow-sm'
            : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        {nextTab.icon}
        <span>{nextTab.label}</span>
      </button>
    )
  }

  return (
    <div className={`lt-scope px-4 py-6 sm:px-6 lg:px-8 transition-colors duration-300 ${
      darkMode
        ? 'lt-dark bg-slate-950 text-slate-100'
        : 'bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#f1f5f9_100%)] text-slate-900'
    }`}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="overflow-hidden rounded-[32px] border border-white/70 bg-white/75 shadow-[0_20px_80px_-40px_rgba(15,23,42,0.4)] backdrop-blur-xl">
          <div className="flex flex-col gap-6 p-5 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2">
                <span className="inline-flex w-fit rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
                  Daily OS
                </span>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                    Life Tracker
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm text-slate-600 sm:text-base">
                    A single place for tasks, habits, and notes that actually helps you steer the day.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-3 py-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-bold text-white shadow">
                    {gamification.level}
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">Level {gamification.level}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <div className="h-1.5 w-14 rounded-full bg-amber-200">
                        <div
                          className="h-1.5 rounded-full bg-amber-500 transition-[width]"
                          style={{ width: `${(gamification.xpProgress / gamification.xpForNext) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-amber-600">{gamification.xp} XP</span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-amber-500">
                      {gamification.achievements.length} achievement{gamification.achievements.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsCommandCenterOpen(true)}
                  className="hidden rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-left text-sm text-slate-600 transition hover:border-slate-300 hover:bg-white sm:block"
                >
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Command Center</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">Search or jump</p>
                </button>
                <button
                  onClick={() => setIsCommandCenterOpen(true)}
                  className="sm:hidden rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-left text-sm text-slate-600 transition hover:border-slate-300 hover:bg-white"
                >
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Search</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">Open command center</p>
                </button>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Today</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">{today}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-6">
              <article className="rounded-2xl bg-slate-950 px-5 py-4 text-white">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Tasks</p>
                <p className="mt-3 text-3xl font-semibold">
                  {snapshot.todos.completed}
                  <span className="ml-1 text-lg text-slate-400">/ {snapshot.todos.total}</span>
                </p>
                <p className="mt-2 text-sm text-slate-300">{snapshot.todos.overdue} overdue, {snapshot.todos.focus} in focus.</p>
              </article>

              <article className="rounded-2xl bg-emerald-50 px-5 py-4 text-emerald-950 ring-1 ring-emerald-100">
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">Activity</p>
                <p className="mt-3 text-3xl font-semibold">
                  {snapshot.activities.today}
                  <span className="ml-1 text-lg text-emerald-700/70">/ {snapshot.activities.total}</span>
                </p>
                <p className="mt-2 text-sm text-emerald-800">{snapshot.activities.streak} day streak, target {snapshot.activities.weeklyTarget}/week.</p>
              </article>

              <article className="rounded-2xl bg-amber-50 px-5 py-4 text-amber-950 ring-1 ring-amber-100">
                <p className="text-xs uppercase tracking-[0.18em] text-amber-700">Notes</p>
                <p className="mt-3 text-3xl font-semibold">{snapshot.notes.total}</p>
                <p className="mt-2 text-sm text-amber-800">{snapshot.notes.pinned} pinned for quick recall.</p>
              </article>

              <article className="rounded-2xl bg-sky-50 px-5 py-4 text-sky-950 ring-1 ring-sky-100">
                <p className="text-xs uppercase tracking-[0.18em] text-sky-700">Mode</p>
                <p className="mt-3 text-3xl font-semibold capitalize">{tab}</p>
                <p className="mt-2 text-sm text-sky-800">Switch views without losing context.</p>
              </article>

              <article className="rounded-2xl bg-violet-50 px-5 py-4 text-violet-950 ring-1 ring-violet-100">
                <p className="text-xs uppercase tracking-[0.18em] text-violet-700">Focus</p>
                <p className="mt-3 text-3xl font-semibold">{snapshot.focus.sessionsToday}</p>
                <p className="mt-2 text-sm text-violet-800">Sessions completed today.</p>
              </article>

              <article className="rounded-2xl bg-orange-50 px-5 py-4 text-orange-950 ring-1 ring-orange-100">
                <p className="text-xs uppercase tracking-[0.18em] text-orange-700">Objectives</p>
                <p className="mt-3 text-3xl font-semibold">
                  {snapshot.planning.completedObjectives}
                  <span className="ml-1 text-lg text-orange-700/70">/ {snapshot.planning.objectives}</span>
                </p>
                <p className="mt-2 text-sm text-orange-800">Weekly objectives in motion.</p>
              </article>
            </div>

            <nav className="hidden rounded-2xl bg-slate-100/80 p-1.5 sm:grid sm:grid-cols-6 gap-2">
              {TABS.map(nextTab => renderTabButton(nextTab))}
            </nav>
          </div>
        </header>

        <main className="grid flex-1">
          <section className="rounded-[32px] border border-white/70 bg-white/85 p-5 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.45)] backdrop-blur sm:p-7">
            {tab === 'insights' && <Insights onNavigate={setTab} />}
            {tab === 'focus' && <FocusStudio />}
            {tab === 'planner' && <PlannerHub />}
            {tab === 'todos' && <TodoList />}
            {tab === 'activities' && <ActivityTracker />}
            {tab === 'notes' && <Notes />}
          </section>
        </main>
      </div>

      <CommandCenter
        isOpen={isCommandCenterOpen}
        onClose={() => setIsCommandCenterOpen(false)}
        onNavigate={nextTab => {
          setTab(nextTab)
          setIsCommandCenterOpen(false)
        }}
      />

    </div>
  )
}
