import { readJson } from './storage'
import { computeGamification } from './gamification'

export const STORAGE_KEYS = {
  todos: 'lifetracker-todos',
  activities: 'lifetracker-activities',
  notes: 'lifetracker-notes',
  focus: 'lifetracker-focus',
  planning: 'lifetracker-planning',
}

export const DEFAULT_ACTIVITIES = [
  { id: 1, name: 'Exercise', emoji: '🏋️' },
  { id: 2, name: 'Reading', emoji: '📖' },
  { id: 3, name: 'Meditation', emoji: '🧘' },
  { id: 4, name: 'Water (8 glasses)', emoji: '💧' },
  { id: 5, name: 'Healthy Eating', emoji: '🥗' },
  { id: 6, name: 'Sleep 8h', emoji: '😴' },
]

const PRIORITY_ORDER = {
  high: 0,
  medium: 1,
  low: 2,
}

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

export function loadTodos() {
  return readJson(STORAGE_KEYS.todos, []).map(todo => ({
    priority: 'medium',
    dueDate: '',
    tag: '',
    recurrence: 'none',
    reminderTime: '',
    lastReminderAt: '',
    estimatedMinutes: 0,
    parentId: null,
    done: false,
    createdAt: new Date().toISOString(),
    ...todo,
  }))
}

export function loadActivityData() {
  const data = readJson(STORAGE_KEYS.activities, {})

  return {
    activities: data.activities || DEFAULT_ACTIVITIES,
    log: data.log || {},
    moodByDate: data.moodByDate || {},
    weeklyTarget: data.weeklyTarget ?? 5,
  }
}

export function loadNotes() {
  return readJson(STORAGE_KEYS.notes, []).map(note => ({
    title: '',
    body: '',
    pinned: false,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...note,
    tags: Array.isArray(note.tags)
      ? note.tags
      : typeof note.tags === 'string' && note.tags.trim()
        ? note.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        : [],
  }))
}

export function loadFocusData() {
  const data = readJson(STORAGE_KEYS.focus, {})

  return {
    durationMinutes: data.durationMinutes ?? 25,
    selectedTaskId: data.selectedTaskId ?? null,
    intention: data.intention ?? '',
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
  }
}

export function loadPlanningData() {
  const data = readJson(STORAGE_KEYS.planning, {})

  return {
    weeklyObjectives: Array.isArray(data.weeklyObjectives) ? data.weeklyObjectives : [],
    shutdownByDate: data.shutdownByDate || {},
    dailyCapacityHours: data.dailyCapacityHours ?? 6,
  }
}

export function isToday(dateString) {
  return Boolean(dateString) && dateString === todayKey()
}

export function isOverdue(todo) {
  return Boolean(todo.dueDate) && todo.dueDate < todayKey() && !todo.done
}

export function getUrgency(todo) {
  return isOverdue(todo) || isToday(todo.dueDate)
}

export function getImportance(todo) {
  return todo.priority === 'high'
}

export function compareTodos(left, right) {
  if (left.done !== right.done) {
    return left.done ? 1 : -1
  }

  const leftOverdue = isOverdue(left)
  const rightOverdue = isOverdue(right)
  if (leftOverdue !== rightOverdue) {
    return leftOverdue ? -1 : 1
  }

  const leftToday = isToday(left.dueDate)
  const rightToday = isToday(right.dueDate)
  if (leftToday !== rightToday) {
    return leftToday ? -1 : 1
  }

  const priorityDelta = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
  if (priorityDelta !== 0) {
    return priorityDelta
  }

  if (left.dueDate && right.dueDate && left.dueDate !== right.dueDate) {
    return left.dueDate.localeCompare(right.dueDate)
  }

  if (left.dueDate && !right.dueDate) {
    return -1
  }

  if (!left.dueDate && right.dueDate) {
    return 1
  }

  return new Date(right.createdAt) - new Date(left.createdAt)
}

export function getNextDueDate(dueDate, recurrence) {
  if (!dueDate || recurrence === 'none') {
    return ''
  }

  const next = new Date(`${dueDate}T12:00:00`)
  if (Number.isNaN(next.getTime())) {
    return ''
  }

  if (recurrence === 'daily') {
    next.setDate(next.getDate() + 1)
  } else if (recurrence === 'weekly') {
    next.setDate(next.getDate() + 7)
  } else if (recurrence === 'monthly') {
    next.setMonth(next.getMonth() + 1)
  }

  return next.toISOString().slice(0, 10)
}

export function groupTodosByMatrix(todos) {
  const buckets = {
    do: [],
    schedule: [],
    delegate: [],
    reduce: [],
  }

  todos.filter(todo => !todo.done).forEach(todo => {
    const urgent = getUrgency(todo)
    const important = getImportance(todo)

    if (urgent && important) {
      buckets.do.push(todo)
    } else if (!urgent && important) {
      buckets.schedule.push(todo)
    } else if (urgent && !important) {
      buckets.delegate.push(todo)
    } else {
      buckets.reduce.push(todo)
    }
  })

  Object.keys(buckets).forEach(key => {
    buckets[key].sort(compareTodos)
  })

  return buckets
}

export function getDashboardSnapshot() {
  const todos = loadTodos()
  const activities = loadActivityData()
  const notes = loadNotes()
  const focus = loadFocusData()
  const planning = loadPlanningData()
  const today = todayKey()
  const completedTodos = todos.filter(todo => todo.done).length
  const overdueTodos = todos.filter(isOverdue).length
  const focusTodos = todos.filter(todo => !todo.done && todo.priority === 'high').length
  const todayActivities = (activities.log[today] || []).length

  let streak = 0
  const cursor = new Date()
  while (true) {
    const key = todayKey(cursor)
    if ((activities.log[key] || []).length > 0) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }

  return {
    todos: {
      total: todos.length,
      completed: completedTodos,
      overdue: overdueTodos,
      focus: focusTodos,
    },
    activities: {
      total: activities.activities.length,
      today: todayActivities,
      streak,
      weeklyTarget: activities.weeklyTarget,
    },
    notes: {
      total: notes.length,
      pinned: notes.filter(note => note.pinned).length,
    },
    focus: {
      sessionsToday: focus.sessions.filter(session => session.completedAt.slice(0, 10) === today).length,
    },
    planning: {
      objectives: planning.weeklyObjectives.length,
      completedObjectives: planning.weeklyObjectives.filter(item => item.done).length,
    },
  }
}

export function getGamificationSnapshot() {
  const todos = loadTodos()
  const activities = loadActivityData()
  const focus = loadFocusData()
  const notes = loadNotes()
  const today = todayKey()

  const completedTasks = todos.filter(t => t.done).length
  const todayLog = activities.log[today] || []
  const perfectDay = activities.activities.length > 0 && todayLog.length >= activities.activities.length
  const totalHabitLogs = Object.values(activities.log).reduce((sum, dayLog) => sum + (Array.isArray(dayLog) ? dayLog.length : 0), 0)
  const focusSessions = focus.sessions.length
  const totalNotes = notes.length

  let streak = 0
  const cursor = new Date()
  while (true) {
    const key = todayKey(cursor)
    if ((activities.log[key] || []).length > 0) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }

  return computeGamification({ completedTasks, totalHabitLogs, focusSessions, totalNotes, streak, perfectDay })
}

export function isWorkspaceEmpty() {
  const todos = loadTodos()
  const notes = loadNotes()
  const focus = loadFocusData()
  const planning = loadPlanningData()
  const activities = loadActivityData()

  const hasActivityLog = Object.values(activities.log || {}).some(entries => Array.isArray(entries) && entries.length > 0)
  const hasMoodHistory = Object.keys(activities.moodByDate || {}).length > 0

  return (
    todos.length === 0
    && notes.length === 0
    && focus.sessions.length === 0
    && planning.weeklyObjectives.length === 0
    && !hasActivityLog
    && !hasMoodHistory
  )
}

export function getActivitySeries(log, days) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (days - index - 1))
    const key = todayKey(date)
    return {
      key,
      label: date.toLocaleDateString('en', { weekday: 'short' }),
      dateLabel: date.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      count: (log[key] || []).length,
    }
  })
}

export function getActiveDaysThisWeek(log) {
  return getActivitySeries(log, 7).filter(day => day.count > 0).length
}

export function getRecentNotes(limit = 4) {
  return loadNotes()
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
    .slice(0, limit)
}

export function getAgenda(limit = 5) {
  return loadTodos()
    .filter(todo => !todo.done)
    .sort(compareTodos)
    .slice(0, limit)
}

export function getGlobalSearchResults(query) {
  const normalizedQuery = query.trim().toLowerCase()
  const todos = loadTodos()
  const notes = loadNotes()
  const activities = loadActivityData().activities

  const tabs = [
    { key: 'go-insights', type: 'tab', tab: 'insights', title: 'Open Insights', badge: 'Jump' },
    { key: 'go-focus', type: 'tab', tab: 'focus', title: 'Open Focus Studio', badge: 'Jump' },
    { key: 'go-planner', type: 'tab', tab: 'planner', title: 'Open Planner', badge: 'Jump' },
    { key: 'go-todos', type: 'tab', tab: 'todos', title: 'Open To-Do', badge: 'Jump' },
    { key: 'go-activities', type: 'tab', tab: 'activities', title: 'Open Activities', badge: 'Jump' },
    { key: 'go-notes', type: 'tab', tab: 'notes', title: 'Open Notes', badge: 'Jump' },
  ].filter(item => !normalizedQuery || item.title.toLowerCase().includes(normalizedQuery))

  const todoMatches = todos
    .filter(todo => [todo.text, todo.tag, todo.priority].join(' ').toLowerCase().includes(normalizedQuery))
    .sort(compareTodos)
    .slice(0, 5)
    .map(todo => ({
      key: `todo-${todo.id}`,
      type: 'tab',
      tab: 'todos',
      title: todo.text,
      description: `${todo.priority} priority${todo.tag ? ` · ${todo.tag}` : ''}`,
      badge: 'Task',
    }))

  const noteMatches = notes
    .filter(note => [note.title, note.body, ...(note.tags || [])].join(' ').toLowerCase().includes(normalizedQuery))
    .slice(0, 5)
    .map(note => ({
      key: `note-${note.id}`,
      type: 'tab',
      tab: 'notes',
      title: note.title || 'Untitled note',
      description: note.body || 'Open in Notes',
      badge: 'Note',
    }))

  const activityMatches = activities
    .filter(activity => activity.name.toLowerCase().includes(normalizedQuery))
    .slice(0, 5)
    .map(activity => ({
      key: `activity-${activity.id}`,
      type: 'tab',
      tab: 'activities',
      title: `${activity.emoji} ${activity.name}`,
      description: 'Open Activity Tracker',
      badge: 'Habit',
    }))

  const quickActions = normalizedQuery
    ? [
        {
          key: 'create-todo',
          type: 'create-todo',
          title: `Create task: ${query}`,
          description: 'Add a new task directly from the command center.',
          badge: 'New',
        },
        {
          key: 'create-note',
          type: 'create-note',
          title: `Create note: ${query}`,
          description: 'Start a new note using the current query as the title.',
          badge: 'New',
        },
      ]
    : []

  return [
    { title: 'Actions', items: [...quickActions, ...tabs].slice(0, 7) },
    { title: 'Tasks', items: todoMatches },
    { title: 'Notes', items: noteMatches },
    { title: 'Habits', items: activityMatches },
  ].filter(section => section.items.length > 0)
}
