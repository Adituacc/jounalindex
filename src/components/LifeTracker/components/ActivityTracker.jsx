import { useState, useEffect, useMemo } from 'react'
import {
  DEFAULT_ACTIVITIES,
  getActivitySeries,
  getActiveDaysThisWeek,
  loadActivityData,
  STORAGE_KEYS,
  todayKey,
} from '../lib/analytics'
import { readJson, writeJson } from '../lib/storage'

const STORAGE_KEY = STORAGE_KEYS.activities
const MOOD_OPTIONS = [
  { key: 'great', label: 'Flowing', emoji: '⚡' },
  { key: 'okay', label: 'Steady', emoji: '🙂' },
  { key: 'low', label: 'Low', emoji: '🌙' },
]

export default function ActivityTracker() {
  const [data, setData] = useState(() => loadActivityData())
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('')

  useEffect(() => {
    writeJson(STORAGE_KEY, data)
  }, [data])

  const today = todayKey()
  const todayLog = data.log[today] || []

  function toggleActivity(actId) {
    setData(prev => {
      const prevLog = prev.log[today] || []
      const next = prevLog.includes(actId)
        ? prevLog.filter(id => id !== actId)
        : [...prevLog, actId]
      return { ...prev, log: { ...prev.log, [today]: next } }
    })
  }

  function addActivity(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const id = Date.now()
    setData(prev => ({
      ...prev,
      activities: [...prev.activities, { id, name, emoji: newEmoji || '✅' }],
    }))
    setNewName('')
    setNewEmoji('')
  }

  function removeActivity(id) {
    setData(prev => ({
      ...prev,
      activities: prev.activities.filter(a => a.id !== id),
    }))
  }

  const streak = useMemo(() => {
    let count = 0
    const d = new Date()
    while (true) {
      const key = d.toISOString().slice(0, 10)
      if ((data.log[key] || []).length > 0) {
        count++
        d.setDate(d.getDate() - 1)
      } else {
        break
      }
    }
    return count
  }, [data.log])
  const completedToday = todayLog.length
  const totalActivities = data.activities.length
  const completionRate = totalActivities === 0 ? 0 : Math.round((completedToday / totalActivities) * 100)
  const weeklyActiveDays = getActiveDaysThisWeek(data.log)
  const heatmap = getActivitySeries(data.log, 21)
  const todayMood = data.moodByDate?.[today] || null

  const last7 = getActivitySeries(data.log, 7)

  function setMood(moodKey) {
    setData(prev => ({
      ...prev,
      moodByDate: {
        ...prev.moodByDate,
        [today]: moodKey,
      },
    }))
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-[28px] bg-gradient-to-br from-emerald-500 to-teal-600 px-5 py-6 text-white sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">Momentum</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Activity Tracker</h2>
          <p className="mt-2 text-sm text-emerald-50/90">
            {completedToday}/{totalActivities} habits done today.
          </p>
          <div className="mt-5 h-2 rounded-full bg-white/20">
            <div
              className="h-2 rounded-full bg-white transition-[width]"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-[28px] border border-emerald-100 bg-emerald-50 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Streak</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-950">🔥 {streak}</p>
            <p className="mt-1 text-sm text-emerald-800">Consecutive active days.</p>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Weekly Goal</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="text-3xl font-semibold text-slate-900">{weeklyActiveDays}/{data.weeklyTarget}</p>
              <select
                value={data.weeklyTarget}
                onChange={e => setData(prev => ({ ...prev, weeklyTarget: Number(e.target.value) }))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
              >
                {[3, 4, 5, 6, 7].map(target => (
                  <option key={target} value={target}>{target}/week</option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-sm text-slate-500">{completionRate}% completion today.</p>
          </div>
        </div>
      </div>

      <div className="flex items-end gap-2 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
        {last7.map((d, i) => {
          const pct = totalActivities > 0 ? (d.count / totalActivities) * 100 : 0
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative h-20 w-full">
                <div
                  className="absolute bottom-0 w-full rounded-md bg-blue-500 transition-all"
                  style={{ height: `${Math.max(pct, 4)}%` }}
                />
              </div>
              <span className="text-[10px] font-medium text-slate-500">{d.label}</span>
            </div>
          )
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Check-in</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">How are you today?</h3>
            </div>
            <span className="text-xs text-slate-400">Premium-style daily reflection</span>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {MOOD_OPTIONS.map(option => (
              <button
                key={option.key}
                onClick={() => setMood(option.key)}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  todayMood === option.key
                    ? 'border-sky-300 bg-sky-50 shadow-sm'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
              >
                <span className="text-2xl">{option.emoji}</span>
                <p className="mt-2 text-sm font-medium text-slate-900">{option.label}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Consistency Heatmap</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">Last 21 days</h3>
            </div>
            <span className="text-xs text-slate-400">Daily intensity</span>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-2">
            {heatmap.map(day => {
              const intensity = totalActivities === 0 ? 0 : day.count / totalActivities
              return (
                <div key={day.key} className="space-y-1 text-center">
                  <div
                    className="h-9 rounded-xl border border-slate-100"
                    style={{
                      backgroundColor: `rgba(14, 165, 233, ${Math.max(intensity, 0.08)})`,
                    }}
                    title={`${day.dateLabel}: ${day.count} completions`}
                  />
                  <p className="text-[10px] text-slate-400">{day.dateLabel.slice(4)}</p>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {data.activities.map(act => {
          const done = todayLog.includes(act.id)
          return (
            <div
              key={act.id}
              className={`group relative rounded-[24px] border-2 px-3 py-4 text-center shadow-sm transition ${
                done
                  ? 'border-green-500 bg-green-50'
                  : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-sky-300'
              }`}
            >
              <button
                onClick={() => toggleActivity(act.id)}
                className="flex w-full flex-col items-center gap-1"
              >
                <span className="text-2xl">{act.emoji}</span>
                <span className={`text-xs font-medium ${done ? 'text-green-700' : 'text-slate-700'}`}>
                  {act.name}
                </span>
              </button>
              {done && (
                <span className="absolute right-1.5 top-1.5 text-green-500">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
              <button
                onClick={e => {
                  e.stopPropagation()
                  removeActivity(act.id)
                }}
                className="absolute left-1.5 top-1.5 text-slate-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                aria-label="Remove activity"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>

      <form onSubmit={addActivity} className="flex flex-col gap-2 rounded-[28px] border border-slate-200 bg-slate-50 p-4 sm:flex-row">
        <input
          value={newEmoji}
          onChange={e => setNewEmoji(e.target.value)}
          placeholder="😀"
          maxLength={4}
          className="w-full rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center text-sm focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100 sm:w-16"
        />
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New activity name…"
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
        />
        <button
          type="submit"
          className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-sky-600"
        >
          Add
        </button>
      </form>
    </div>
  )
}
