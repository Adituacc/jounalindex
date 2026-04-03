import { useState, useEffect } from 'react'
import { loadNotes, STORAGE_KEYS } from '../lib/analytics'
import { readJson, writeJson } from '../lib/storage'

const STORAGE_KEY = STORAGE_KEYS.notes
const TEMPLATES = [
  {
    key: 'blank',
    label: 'Blank',
    title: '',
    body: '',
  },
  {
    key: 'journal',
    label: 'Journal',
    title: 'Daily reflection',
    body: 'Wins\n- \n\nChallenges\n- \n\nWhat I want tomorrow to feel like\n- ',
  },
  {
    key: 'meeting',
    label: 'Meeting',
    title: 'Meeting notes',
    body: 'Attendees\n- \n\nKey decisions\n- \n\nAction items\n- ',
  },
  {
    key: 'idea',
    label: 'Idea',
    title: 'New idea',
    body: 'Problem\n\nApproach\n\nWhy this matters\n',
  },
]

export default function Notes() {
  const [notes, setNotes] = useState(() => loadNotes())
  const [activeId, setActiveId] = useState(null)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('all')

  useEffect(() => {
    writeJson(STORAGE_KEY, notes)
  }, [notes])

  const activeNote = notes.find(n => n.id === activeId) || null

  function addNote(template = TEMPLATES[0]) {
    const note = {
      id: Date.now(),
      title: template.title,
      body: template.body,
      pinned: false,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setNotes(prev => [note, ...prev])
    setActiveId(note.id)
  }

  function updateNote(id, field, value) {
    setNotes(prev =>
      prev.map(n =>
        n.id === id ? { ...n, [field]: value, updatedAt: new Date().toISOString() } : n,
      ),
    )
  }

  function deleteNote(id) {
    setNotes(prev => prev.filter(n => n.id !== id))
    if (activeId === id) setActiveId(null)
  }

  function togglePinned(id) {
    setNotes(prev =>
      prev.map(note =>
        note.id === id
          ? { ...note, pinned: !note.pinned, updatedAt: new Date().toISOString() }
          : note,
      ),
    )
  }

  const filtered = notes
    .filter(n => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return [n.title, n.body, ...(n.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
    .filter(note => tagFilter === 'all' || note.tags.includes(tagFilter))
    .sort((left, right) => {
      if (left.pinned !== right.pinned) {
        return left.pinned ? -1 : 1
      }

      return new Date(right.updatedAt) - new Date(left.updatedAt)
    })

  useEffect(() => {
    if (!activeId && filtered.length > 0) {
      setActiveId(filtered[0].id)
    }
  }, [activeId, filtered])

  const allTags = [...new Set(notes.flatMap(note => note.tags || []))].sort((left, right) => left.localeCompare(right))
  const activeNoteWords = activeNote?.body.trim() ? activeNote.body.trim().split(/\s+/).length : 0

  function updateTags(value) {
    if (!activeNote) return

    const tags = value
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean)

    updateNote(activeNote.id, 'tags', tags)
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('en', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Notes</h2>
            <p className="text-sm text-slate-500">{notes.length} note{notes.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => addNote()}
            className="rounded-2xl bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-600"
          >
            + New Note
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map(template => (
            <button
              key={template.key}
              onClick={() => addNote(template)}
              className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100"
            >
              {template.label}
            </button>
          ))}
        </div>

        <div className="relative">
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search notes…"
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
        />
      </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTagFilter('all')}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                tagFilter === 'all' ? 'bg-slate-950 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'
              }`}
            >
              All tags
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setTagFilter(tag)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  tagFilter === tag ? 'bg-sky-500 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
            {notes.length === 0 ? 'No notes yet — create one!' : 'No matching notes.'}
          </div>
        )}
        {filtered.map(note => (
          <button
            key={note.id}
            onClick={() => setActiveId(note.id)}
            className={`w-full rounded-2xl border px-4 py-3 text-left transition hover:border-slate-300 hover:shadow-sm ${
              activeId === note.id ? 'border-sky-300 bg-white shadow-sm' : 'border-transparent bg-white/80'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate text-sm font-semibold text-slate-800">
                {note.title || 'Untitled'}
              </h3>
              {note.pinned && <span className="text-xs text-amber-500">Pinned</span>}
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {note.body || 'No content'}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {note.tags.slice(0, 3).map(tag => (
                <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">
                  {tag}
                </span>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">{fmtDate(note.updatedAt)}</p>
          </button>
        ))}
        </div>
      </aside>

      <section className="flex min-h-[480px] flex-col rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        {activeNote ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4">
              <span className="mr-auto text-xs text-slate-400">
                Created {fmtDate(activeNote.createdAt)} · Last edited {fmtDate(activeNote.updatedAt)}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-500">
                {activeNoteWords} words
              </span>
              <button
                onClick={() => togglePinned(activeNote.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  activeNote.pinned
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {activeNote.pinned ? 'Pinned' : 'Pin note'}
              </button>
              <button
                onClick={() => deleteNote(activeNote.id)}
                className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100"
              >
                Delete
              </button>
            </div>

            <input
              value={activeNote.title}
              onChange={e => updateNote(activeNote.id, 'title', e.target.value)}
              placeholder="Note title…"
              className="mt-5 w-full border-none bg-transparent text-3xl font-semibold tracking-tight text-slate-950 placeholder:text-slate-300 focus:outline-none"
            />

            <input
              value={activeNote.tags.join(', ')}
              onChange={e => updateTags(e.target.value)}
              placeholder="Tags, separated by commas"
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
            />

            <textarea
              value={activeNote.body}
              onChange={e => updateNote(activeNote.id, 'body', e.target.value)}
              placeholder="Start writing…"
              className="mt-4 min-h-[360px] w-full flex-1 resize-none rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
            Select a note or create a new one.
          </div>
        )}
      </section>
    </div>
  )
}
