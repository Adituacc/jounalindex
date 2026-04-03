import { useEffect, useMemo, useState } from 'react'
import { getGlobalSearchResults, STORAGE_KEYS } from '../lib/analytics'
import { writeJson } from '../lib/storage'

function createQuickTodo(text) {
  const nextTodo = {
    id: Date.now(),
    text: text.trim(),
    done: false,
    createdAt: new Date().toISOString(),
    dueDate: '',
    priority: 'medium',
    tag: '',
  }

  const current = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.todos) || '[]')
  writeJson(STORAGE_KEYS.todos, [...current, nextTodo])
}

function createQuickNote(text) {
  const nextNote = {
    id: Date.now(),
    title: text.trim(),
    body: '',
    pinned: false,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const current = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.notes) || '[]')
  writeJson(STORAGE_KEYS.notes, [nextNote, ...current])
}

export default function CommandCenter({ isOpen, onClose, onNavigate }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => getGlobalSearchResults(query), [query])

  useEffect(() => {
    if (!isOpen) {
      setQuery('')
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  function runAction(action) {
    if (action.type === 'tab') {
      onNavigate(action.tab)
      onClose()
      return
    }

    if (action.type === 'create-todo' && query.trim()) {
      createQuickTodo(query)
      onNavigate('todos')
      onClose()
      return
    }

    if (action.type === 'create-note' && query.trim()) {
      createQuickNote(query)
      onNavigate('notes')
      onClose()
    }
  }

  return (
    <div className="lt-scope fixed inset-0 z-[60] flex items-start justify-center bg-slate-950/35 px-4 py-16 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-[32px] border border-white/60 bg-white/95 shadow-[0_35px_90px_-35px_rgba(15,23,42,0.55)]" onClick={event => event.stopPropagation()}>
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search everything, jump to a space, or create something new"
            className="w-full border-none bg-transparent text-base text-slate-950 placeholder:text-slate-400 focus:outline-none"
          />
          <p className="mt-2 text-xs text-slate-400">Press Cmd/Ctrl + K anytime to open this panel.</p>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-3">
          <div className="space-y-2">
            {results.map(section => (
              <div key={section.title} className="rounded-2xl bg-slate-50 p-3">
                <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{section.title}</p>
                <div className="mt-2 space-y-1">
                  {section.items.map(item => (
                    <button
                      key={item.key}
                      onClick={() => runAction(item)}
                      className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition hover:bg-white"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{item.title}</p>
                        {item.description && <p className="text-xs text-slate-500">{item.description}</p>}
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                        {item.badge}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
