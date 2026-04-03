const XP_PER_TASK = 25
const XP_PER_HABIT_LOG = 15
const XP_PER_FOCUS = 30
const XP_PER_NOTE = 10
const XP_PER_LEVEL = 200

export const ACHIEVEMENT_DEFS = [
  { id: 'first_task', name: 'First Step', desc: 'Complete your first task', icon: '🎯', check: d => d.completedTasks >= 1 },
  { id: 'task_10', name: 'Productive', desc: 'Complete 10 tasks', icon: '⚡', check: d => d.completedTasks >= 10 },
  { id: 'task_50', name: 'Machine', desc: 'Complete 50 tasks', icon: '🚀', check: d => d.completedTasks >= 50 },
  { id: 'task_100', name: 'Centurion', desc: 'Complete 100 tasks', icon: '💯', check: d => d.completedTasks >= 100 },
  { id: 'streak_3', name: 'Warming Up', desc: '3-day activity streak', icon: '🔥', check: d => d.streak >= 3 },
  { id: 'streak_7', name: 'On Fire', desc: '7-day activity streak', icon: '💪', check: d => d.streak >= 7 },
  { id: 'streak_30', name: 'Unstoppable', desc: '30-day streak', icon: '👑', check: d => d.streak >= 30 },
  { id: 'focus_5', name: 'Focused', desc: '5 focus sessions', icon: '🎧', check: d => d.focusSessions >= 5 },
  { id: 'focus_25', name: 'Deep Worker', desc: '25 focus sessions', icon: '🧠', check: d => d.focusSessions >= 25 },
  { id: 'note_5', name: 'Scribe', desc: 'Write 5 notes', icon: '📝', check: d => d.totalNotes >= 5 },
  { id: 'note_25', name: 'Chronicler', desc: 'Write 25 notes', icon: '📚', check: d => d.totalNotes >= 25 },
  { id: 'perfect_day', name: 'Perfect Day', desc: 'All habits done in a day', icon: '✨', check: d => d.perfectDay },
  { id: 'level_5', name: 'Rising Star', desc: 'Reach level 5', icon: '⭐', check: d => d.level >= 5 },
  { id: 'level_10', name: 'Elite', desc: 'Reach level 10', icon: '💎', check: d => d.level >= 10 },
]

export function getLevel(xp) {
  return Math.floor(xp / XP_PER_LEVEL) + 1
}

export function getXPProgress(xp) {
  return xp % XP_PER_LEVEL
}

export function computeGamification({ completedTasks, totalHabitLogs, focusSessions, totalNotes, streak, perfectDay }) {
  const xp = (completedTasks * XP_PER_TASK) + (totalHabitLogs * XP_PER_HABIT_LOG) + (focusSessions * XP_PER_FOCUS) + (totalNotes * XP_PER_NOTE)
  const level = getLevel(xp)
  const xpProgress = getXPProgress(xp)
  const checkData = { completedTasks, totalHabitLogs, focusSessions, totalNotes, streak, perfectDay, level }
  const achievements = ACHIEVEMENT_DEFS.filter(a => a.check(checkData))

  return { xp, level, xpProgress, xpForNext: XP_PER_LEVEL, achievements }
}
