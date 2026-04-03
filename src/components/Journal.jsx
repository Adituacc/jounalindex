import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

function loadJournalData() {
  try {
    const raw = localStorage.getItem('notebookData');
    if (raw) {
      const data = JSON.parse(raw);
      for (const k in data.notes) { if (!data.notes[k].tags) data.notes[k].tags = []; if (data.notes[k].pinned === undefined) data.notes[k].pinned = false; }
      return data;
    }
  } catch { /* fallback */ }
  return {
    folders: [
      { id: 'trade-notes', name: 'Trade Notes', icon: 'fas fa-chart-line' },
      { id: 'daily-journal', name: 'Daily Journal', icon: 'far fa-calendar-alt' },
      { id: 'sessions-recap', name: 'Sessions Recap', icon: 'far fa-file-alt' },
      { id: 'my-notes', name: 'My notes', icon: 'far fa-sticky-note' },
      { id: 'self-care', name: 'self care', icon: 'fas fa-heart' },
    ],
    notes: {},
  };
}

// Debounce helper
function useDebounce(fn, delay) {
  const timerRef = useRef(null);
  const debouncedFn = useCallback((...args) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return debouncedFn;
}

// Color palette for text/highlight pickers
const COLOR_PALETTE = [
  '#ffffff', '#e0e0e0', '#a1a1aa', '#71717a', '#3f3f46', '#000000',
  '#ff4444', '#ff6b6b', '#f59e0b', '#fbbf24', '#22c55e', '#4ade80',
  '#3b82f6', '#60a5fa', '#8b5cf6', '#a78bfa', '#ec4899', '#f472b6',
  '#7c5cfc', '#06b6d4', '#14b8a6', '#84cc16', '#f97316', '#ef4444',
];

function getDateKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function parseDateKey(k) { if (!k) return new Date(); const [y, m, d] = k.split('-'); return new Date(y, m - 1, d); }
function formatDate(k) { return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(parseDateKey(k)); }
function formatDateShort(k) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parseDateKey(k)); }

function getPreview(html) {
  if (!html) return '';
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 90 ? text.slice(0, 90) + '…' : text;
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// Inline popover component for link/image URL input
function InlineInput({ label, placeholder, onSubmit, onClose }) {
  const [val, setVal] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div className="j-inline-popover" onClick={e => e.stopPropagation()}>
      <div className="text-xs text-neutral mb-1.5 font-semibold">{label}</div>
      <form onSubmit={e => { e.preventDefault(); if (val.trim()) onSubmit(val.trim()); onClose(); }} className="flex gap-1.5">
        <input ref={inputRef} className="j-inline-input" type="text" placeholder={placeholder} value={val} onChange={e => setVal(e.target.value)} />
        <button type="submit" className="j-inline-submit"><i className="fas fa-check" /></button>
        <button type="button" className="j-inline-cancel" onClick={onClose}><i className="fas fa-times" /></button>
      </form>
    </div>
  );
}

// Color picker grid component
function ColorPicker({ onPick, onClose }) {
  return (
    <div className="j-color-picker" onClick={e => e.stopPropagation()}>
      <div className="j-color-grid">
        {COLOR_PALETTE.map(c => (
          <div key={c} className="j-color-swatch" style={{ background: c }} onClick={() => { onPick(c); onClose(); }} title={c} />
        ))}
      </div>
    </div>
  );
}

export default function Journal() {
  const [appData, setAppData] = useState(loadJournalData);
  const [activeFolder, setActiveFolder] = useState('all');
  const [tagFilter, setTagFilter] = useState(null);
  const [noteId, setNoteId] = useState(null);
  const [calDate, setCalDate] = useState(new Date());
  const [searchQ, setSearchQ] = useState('');
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [midCollapsed, setMidCollapsed] = useState(false);
  const [calPopup, setCalPopup] = useState(null);
  const [fontSize, setFontSize] = useState(2);
  const [sortAsc, setSortAsc] = useState(false);
  const [filterNonEmpty, setFilterNonEmpty] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const editorRef = useRef(null);
  const calBtnRef = useRef(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [focusMode, setFocusMode] = useState(false);
  const saveTimerRef = useRef(null);

  const fontSizes = [10, 13, 15, 18, 24, 32, 48];

  const save = useCallback((data) => {
    setAppData(data);
    localStorage.setItem('notebookData', JSON.stringify(data));
  }, []);

  // Filtered & sorted notes
  const filteredNotes = useMemo(() => {
    let n = Object.values(appData.notes);
    if (activeFolder !== 'all') n = n.filter(x => x.folderId === activeFolder);
    if (tagFilter) n = n.filter(x => x.tags?.includes(tagFilter));
    if (searchQ) n = n.filter(x => x.content.replace(/<[^>]+>/g, '').toLowerCase().includes(searchQ.toLowerCase()));
    if (filterNonEmpty) n = n.filter(x => x.content.replace(/<[^>]+>/g, '').trim().length > 0);
    return n.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return sortAsc
        ? parseDateKey(a.date) - parseDateKey(b.date)
        : parseDateKey(b.date) - parseDateKey(a.date);
    });
  }, [appData.notes, activeFolder, tagFilter, searchQ, sortAsc, filterNonEmpty]);

  // All tags with counts
  const allTags = useMemo(() => {
    const tc = {};
    Object.values(appData.notes).forEach(n => { n.tags?.forEach(t => { tc[t] = (tc[t] || 0) + 1; }); });
    return tc;
  }, [appData.notes]);

  // Note counts per folder
  const noteCountByFolder = useMemo(() => {
    const counts = { all: Object.keys(appData.notes).length };
    appData.folders.forEach(f => { counts[f.id] = 0; });
    Object.values(appData.notes).forEach(n => { if (counts[n.folderId] !== undefined) counts[n.folderId]++; });
    return counts;
  }, [appData.notes, appData.folders]);

  const currentNote = noteId ? appData.notes[noteId] : null;

  // Update word count
  const updateWordCount = useCallback(() => {
    if (!editorRef.current) { setWordCount(0); return; }
    const text = editorRef.current.innerText?.trim() || '';
    setWordCount(text ? text.split(/\s+/).length : 0);
  }, []);

  // Load note into editor
  useEffect(() => {
    if (editorRef.current && currentNote) {
      if (editorRef.current.innerHTML !== currentNote.content) {
        editorRef.current.innerHTML = currentNote.content;
      }
    } else if (editorRef.current && !currentNote) {
      editorRef.current.innerHTML = '';
    }
    updateWordCount();
  }, [noteId, currentNote?.content, updateWordCount]);

  const saveNote = useCallback(() => {
    if (!noteId || !editorRef.current) return;
    setSaveStatus('saving');
    const updated = { ...appData, notes: { ...appData.notes, [noteId]: { ...appData.notes[noteId], content: editorRef.current.innerHTML, updated: new Date().toISOString() } } };
    save(updated);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveStatus('saved'), 400);
  }, [noteId, appData, save]);

  const debouncedSaveNote = useDebounce(saveNote, 300);

  const handleEditorInput = useCallback(() => {
    debouncedSaveNote();
    updateWordCount();
  }, [debouncedSaveNote, updateWordCount]);

  // Handle Enter key inside checklists to auto-insert new checklist items
  // Handle Tab for indent/outdent in lists
  const handleEditorKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const li = sel.anchorNode?.closest?.('li.j-checklist-item') || sel.anchorNode?.parentElement?.closest?.('li.j-checklist-item');
      if (li) {
        e.preventDefault();
        // If the current item text is empty, exit the checklist
        const textSpan = li.querySelector('.j-check-text');
        if (textSpan && textSpan.textContent.trim() === '') {
          // Remove this empty item and insert a paragraph after the list
          const ul = li.closest('.j-checklist');
          li.remove();
          if (ul && ul.children.length === 0) ul.remove();
          document.execCommand('insertParagraph');
        } else {
          // Insert a new checklist item after the current one
          const newLi = document.createElement('li');
          newLi.className = 'j-checklist-item';
          newLi.innerHTML = '<span contenteditable="false"><input type="checkbox" class="j-check"></span> <span class="j-check-text"></span>';
          li.after(newLi);
          // Move cursor into the new text span
          const newText = newLi.querySelector('.j-check-text');
          const range = document.createRange();
          range.selectNodeContents(newText);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        debouncedSaveNote();
      }
    } else if (e.key === 'Tab') {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const li = sel.anchorNode?.closest?.('li') || sel.anchorNode?.parentElement?.closest?.('li');
      if (li) {
        e.preventDefault();
        if (e.shiftKey) {
          document.execCommand('outdent');
        } else {
          document.execCommand('indent');
        }
        debouncedSaveNote();
      }
    } else if (e.key === ' ') {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const node = sel.anchorNode;
      if (node?.nodeType !== 3) return;
      const text = node.textContent.slice(0, sel.anchorOffset);
      let format = null;
      let clearLen = 0;
      if (text === '#') { format = 'h1'; clearLen = 1; }
      else if (text === '##') { format = 'h2'; clearLen = 2; }
      else if (text === '###') { format = 'h3'; clearLen = 3; }
      else if (text === '>') { format = 'blockquote'; clearLen = 1; }
      else if (text === '-' || text === '*') { format = 'ul'; clearLen = 1; }
      else if (/^\d+\.$/.test(text)) { format = 'ol'; clearLen = text.length; }
      else if (text === '[]') { format = 'checklist'; clearLen = 2; }
      if (format) {
        e.preventDefault();
        node.textContent = node.textContent.slice(clearLen);
        const range = document.createRange();
        range.setStart(node, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        if (format === 'ul') document.execCommand('insertUnorderedList');
        else if (format === 'ol') document.execCommand('insertOrderedList');
        else if (format === 'checklist') {
          document.execCommand('insertHTML', false,
            '<ul class="j-checklist"><li class="j-checklist-item"><span contenteditable="false"><input type="checkbox" class="j-check"></span> <span class="j-check-text"></span></li></ul>'
          );
        } else {
          document.execCommand('formatBlock', false, `<${format}>`);
        }
        debouncedSaveNote();
      }
    }
  }, [debouncedSaveNote]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveNote();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [saveNote]);

  const switchFolder = (id) => {
    setActiveFolder(id);
    setTagFilter(null);
  };

  const addFolder = () => {
    const nm = prompt("Enter new folder name:");
    if (!nm?.trim()) return;
    const id = nm.toLowerCase().replace(/[^a-z0-9]/g, '-');
    if (appData.folders.find(f => f.id === id)) { alert("Exists."); return; }
    const updated = { ...appData, folders: [...appData.folders, { id, name: nm, icon: 'far fa-folder' }] };
    save(updated);
    setActiveFolder(id);
  };

  const deleteFolder = (e, id) => {
    e.stopPropagation();
    if (!confirm("Delete folder and all notes inside?")) return;
    const newNotes = { ...appData.notes };
    for (const k in newNotes) { if (newNotes[k].folderId === id) delete newNotes[k]; }
    save({ ...appData, folders: appData.folders.filter(f => f.id !== id), notes: newNotes });
    if (activeFolder === id) setActiveFolder('all');
  };

  const createNote = (fid, dk) => {
    const nid = `${fid}_${dk}`;
    if (!appData.notes[nid]) {
      const updated = { ...appData, notes: { ...appData.notes, [nid]: { id: nid, folderId: fid, date: dk, tags: [], content: '', created: new Date().toISOString(), updated: new Date().toISOString() } } };
      save(updated);
    }
    setNoteId(nid);
  };

  const deleteNote = () => {
    if (!noteId || !confirm('Delete this note?')) return;
    const newNotes = { ...appData.notes };
    delete newNotes[noteId];
    save({ ...appData, notes: newNotes });
    setNoteId(null);
  };

  const togglePin = () => {
    if (!noteId) return;
    const note = appData.notes[noteId];
    save({ ...appData, notes: { ...appData.notes, [noteId]: { ...note, pinned: !note.pinned } } });
  };

  const addTag = () => {
    if (!noteId) return;
    const t = prompt("Enter new tag:");
    if (!t?.trim()) return;
    const ft = t.trim().toLowerCase();
    const note = appData.notes[noteId];
    if (note.tags.includes(ft)) return;
    save({ ...appData, notes: { ...appData.notes, [noteId]: { ...note, tags: [...note.tags, ft] } } });
  };

  const removeTag = (tag) => {
    if (!noteId) return;
    const note = appData.notes[noteId];
    save({ ...appData, notes: { ...appData.notes, [noteId]: { ...note, tags: note.tags.filter(t => t !== tag) } } });
  };

  const selectionInsideEditor = useCallback((range) => {
    const editor = editorRef.current;
    if (!editor || !range) return false;
    return editor.contains(range.startContainer) && editor.contains(range.endContainer);
  }, []);

  const execCmd = (cmd, val = null) => {
    restoreSelection();
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    debouncedSaveNote();
  };
  const applyFormat = (tag) => {
    restoreSelection();
    editorRef.current?.focus();
    document.execCommand('formatBlock', false, `<${tag}>`);
    debouncedSaveNote();
  };

  const insertItem = (type) => {
    restoreSelection();
    editorRef.current?.focus();
    if (type === 'hr') document.execCommand('insertHorizontalRule');
    else if (type === 'pagebreak') document.execCommand('insertHTML', false, '<div class="j-page-break" contenteditable="false">--- Page Break ---</div><p><br></p>');
    else if (type === 'table') document.execCommand('insertHTML', false, '<table contenteditable="true"><tbody><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr></tbody></table><p><br></p>');
    else if (type === 'checklist') {
      document.execCommand('insertHTML', false,
        '<ul class="j-checklist"><li class="j-checklist-item"><span contenteditable="false"><input type="checkbox" class="j-check"></span> <span class="j-check-text"></span></li></ul>'
      );
      // Place cursor in the text span
      setTimeout(() => {
        const items = editorRef.current?.querySelectorAll('.j-check-text');
        if (items?.length) {
          const last = items[items.length - 1];
          const range = document.createRange();
          range.selectNodeContents(last);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }, 10);
    }
    saveNote();
  };

  const insertImage = (url) => {
    restoreSelection();
    editorRef.current?.focus();
    const sanitized = url.replace(/["'<>]/g, '');
    document.execCommand('insertHTML', false, `<img src="${encodeURI(sanitized)}" style="display:block;max-width:100%;margin:15px 0;border-radius:6px;">`);
    saveNote();
  };

  const insertLink = (url) => {
    restoreSelection();
    editorRef.current?.focus();
    const sanitized = url.replace(/["'<>]/g, '');
    document.execCommand('createLink', false, encodeURI(sanitized));
    debouncedSaveNote();
  };

  const changeFontSize = (dir) => {
    const newIdx = Math.max(0, Math.min(fontSizes.length - 1, fontSize + dir));
    setFontSize(newIdx);
    restoreSelection();
    document.execCommand('fontSize', false, newIdx + 1);
    debouncedSaveNote();
  };

  const exportData = () => {
    const s = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData));
    const a = document.createElement('a');
    a.href = s; a.download = `notebook_backup_${getDateKey(new Date())}.json`; a.click();
  };

  // Calendar popup
  const calendarMonth = calDate.getMonth(), calendarYear = calDate.getFullYear();
  const calFirstDay = new Date(calendarYear, calendarMonth, 1).getDay();
  const calDaysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const prevMonthDays = new Date(calendarYear, calendarMonth, 0).getDate();
  const today = new Date();

  const handleCalDayClick = (dk) => {
    if (activeFolder === 'all') {
      const ex = Object.values(appData.notes).filter(n => n.date === dk);
      if (ex.length) setNoteId(ex[0].id); else createNote('daily-journal', dk);
    } else {
      createNote(activeFolder, dk);
    }
    setCalPopup(null);
  };

  const toggleCalendar = (e) => {
    e.stopPropagation();
    if (calPopup) { setCalPopup(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    // Clamp popup to viewport
    const top = Math.min(rect.bottom + 10, window.innerHeight - 320);
    const left = Math.min(rect.left, window.innerWidth - 280);
    setCalPopup({ top, left: Math.max(10, left) });
  };

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredNotes.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredNotes.map(n => n.id)));
  };
  const toggleSelect = (id) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const deleteSelected = () => {
    if (!confirm("Delete all selected notes?")) return;
    const newNotes = { ...appData.notes };
    selectedIds.forEach(id => delete newNotes[id]);
    save({ ...appData, notes: newNotes });
    setSelectedIds(new Set());
    if (selectedIds.has(noteId)) setNoteId(null);
  };

  // Close calendar on outside click
  useEffect(() => {
    const handler = () => setCalPopup(null);
    if (calPopup) { document.addEventListener('click', handler); return () => document.removeEventListener('click', handler); }
  }, [calPopup]);

  // Dropdown state — also used for inline popovers (link, image, textColor, highlightColor)
  const [openDropdown, setOpenDropdown] = useState(null);
  const [activeFont, setActiveFont] = useState('Arial');
  const toggleDropdown = (e, id) => { e.stopPropagation(); setOpenDropdown(openDropdown === id ? null : id); };
  useEffect(() => {
    const handler = () => setOpenDropdown(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Save selection before opening popover (so we can restore it when applying color/link)
  const savedSelectionRef = useRef(null);
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (selectionInsideEditor(range)) {
        savedSelectionRef.current = range.cloneRange();
      }
    }
  };
  const restoreSelection = () => {
    if (savedSelectionRef.current && selectionInsideEditor(savedSelectionRef.current)) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedSelectionRef.current);
    }
  };

  const currentFolder = currentNote ? appData.folders.find(f => f.id === currentNote.folderId) : null;
  const readingTime = wordCount > 0 ? Math.max(1, Math.ceil(wordCount / 200)) : 0;

  return (
    <div className="flex flex-col" style={{ height: '100vh' }}>
      <div className="flex-1 flex flex-col p-6 overflow-hidden gap-4" style={{ height: '100%' }}>
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
              <i className="fas fa-book-open text-accent text-sm" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight">Journal</h1>
              <p className="text-[11px] text-neutral leading-none mt-0.5">{Object.keys(appData.notes).length} entries</p>
            </div>
          </div>
          <div className="flex items-center bg-dark-800 border border-dark-600 rounded-xl px-4 py-2.5 flex-1 max-w-[500px] group focus-within:border-accent/40 transition-colors">
            <i className="fas fa-search text-neutral mr-3 text-xs group-focus-within:text-accent transition-colors" />
            <input type="text" className="bg-transparent border-none text-white text-sm w-full outline-none placeholder:text-neutral/50" placeholder="Search notes..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
            {searchQ && <i className="fas fa-times text-neutral text-xs cursor-pointer hover:text-white ml-2" onClick={() => setSearchQ('')} />}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              className={`bg-transparent border text-neutral w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer hover:bg-dark-800 hover:text-white transition-all ${filterNonEmpty ? 'border-accent text-accent' : 'border-dark-600'}`}
              onClick={() => setFilterNonEmpty(f => !f)}
              title={filterNonEmpty ? 'Showing non-empty notes only' : 'Show all notes'}
            >
              <i className="fas fa-filter text-xs" />
            </button>
            <button
              className={`bg-transparent border text-neutral w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer hover:bg-dark-800 hover:text-white transition-all ${focusMode ? 'border-accent text-accent' : 'border-dark-600'}`}
              onClick={() => setFocusMode(f => !f)}
              title={focusMode ? 'Exit focus mode' : 'Focus mode — hide sidebars'}
            >
              <i className={`fas ${focusMode ? 'fa-compress' : 'fa-expand'} text-xs`} />
            </button>
            <button className="bg-transparent border border-dark-600 text-neutral w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer hover:bg-dark-800 hover:text-white transition-all" onClick={exportData} title="Export backup">
              <i className="fas fa-file-export text-xs" />
            </button>
          </div>
        </div>

        {/* Main notebook */}
        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Folder sidebar */}
          <div className={`j-nav-sidebar ${navCollapsed || focusMode ? 'j-collapsed' : ''}`} style={focusMode ? { width: 0, border: 'none', opacity: 0, overflow: 'hidden' } : undefined}>
            {(navCollapsed && !focusMode) && (
              <div className="j-expand-strip" onClick={() => setNavCollapsed(false)}><i className="fas fa-chevron-right" /></div>
            )}
            <div className="j-sidebar-inner">
              <div className="flex justify-between items-center px-2 pb-5 font-semibold text-[14px]">
                <div className="flex items-center gap-2 cursor-pointer hover:text-accent transition-colors text-neutral" onClick={addFolder}>
                  <i className="fas fa-folder-plus text-xs" /> New folder
                </div>
                <i className="fas fa-chevron-left text-[11px] cursor-pointer text-neutral hover:text-accent transition-colors" onClick={() => setNavCollapsed(true)} />
              </div>
              <div className="mb-5">
                <div className="flex justify-between px-2 pb-2 text-[10px] text-neutral uppercase tracking-[0.12em] font-semibold">Folders</div>
                <div className={`j-nav-item ${activeFolder === 'all' ? 'j-active' : ''}`} onClick={() => switchFolder('all')}>
                  <i className="far fa-file-alt j-main-icon" /> All notes
                  <span className="j-count-badge">{noteCountByFolder.all || 0}</span>
                </div>
                {appData.folders.map(f => (
                  <div key={f.id} className={`j-nav-item ${activeFolder === f.id ? 'j-active' : ''}`} onClick={() => switchFolder(f.id)}>
                    <i className={`${f.icon} j-main-icon`} /> {f.name}
                    <span className="j-count-badge">{noteCountByFolder[f.id] || 0}</span>
                    <i className="fas fa-trash-alt j-more-icon" onClick={(e) => deleteFolder(e, f.id)} />
                  </div>
                ))}
              </div>
              <div>
                <div className="flex justify-between px-2 pb-2 text-[10px] text-neutral uppercase tracking-[0.12em] font-semibold">Tags</div>
                <div className="flex flex-wrap gap-1.5 px-2">
                  {Object.entries(allTags).map(([t, cnt]) => (
                    <div key={t} className={`j-tag-pill ${tagFilter === t ? 'j-active' : ''}`} onClick={() => setTagFilter(tagFilter === t ? null : t)}>
                      {t} <span>{cnt}</span>
                    </div>
                  ))}
                  {Object.keys(allTags).length === 0 && <p className="text-neutral/40 text-xs italic">No tags yet</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Date list sidebar */}
          <div className={`j-mid-sidebar ${midCollapsed || focusMode ? 'j-collapsed' : ''}`} style={focusMode ? { width: 0, border: 'none', opacity: 0, overflow: 'hidden' } : undefined}>
            {(midCollapsed && !focusMode) && (
              <div className="j-expand-strip" onClick={() => setMidCollapsed(false)}><i className="fas fa-chevron-right" /></div>
            )}
            <div className="j-sidebar-inner">
              <div className="flex justify-between items-center px-5 pb-4 text-sm font-semibold">
                <div className="flex items-center gap-2 cursor-pointer hover:text-accent transition-colors" onClick={toggleCalendar} ref={calBtnRef}>
                  <i className="fas fa-plus text-xs" /> New entry
                </div>
                <div className="flex gap-3 items-center">
                  <i className={`fas ${sortAsc ? 'fa-sort-amount-up' : 'fa-sort-amount-down'} text-neutral text-xs cursor-pointer hover:text-white transition-colors`} onClick={() => setSortAsc(s => !s)} title={sortAsc ? 'Oldest first' : 'Newest first'} />
                  <i className="fas fa-chevron-left text-neutral text-[11px] cursor-pointer hover:text-white transition-colors" onClick={() => setMidCollapsed(true)} />
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 pb-3 text-xs border-b border-dark-600">
                <input type="checkbox" className="j-custom-checkbox" checked={filteredNotes.length > 0 && selectedIds.size === filteredNotes.length} onChange={toggleSelectAll} />
                <label className="cursor-pointer text-neutral font-medium">Select all</label>
                {selectedIds.size > 0 && (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[10px] text-neutral">{selectedIds.size} selected</span>
                    <i className="fas fa-trash text-loss text-xs cursor-pointer hover:bg-loss/10 p-1 rounded transition-colors" onClick={deleteSelected} />
                  </div>
                )}
              </div>
              <ul className="j-date-list">
                {filteredNotes.length === 0 && (
                  <li className="j-empty-list">
                    <i className="far fa-folder-open text-2xl text-neutral/30 mb-2" />
                    <span className="text-neutral/40 text-xs">No notes found</span>
                  </li>
                )}
                {filteredNotes.map(n => {
                  const preview = getPreview(n.content);
                  return (
                    <li key={n.id} className={`j-note-item ${noteId === n.id ? 'j-selected' : ''}`} onClick={() => setNoteId(n.id)}>
                      <input type="checkbox" className="j-custom-checkbox" checked={selectedIds.has(n.id)} onClick={e => e.stopPropagation()} onChange={() => toggleSelect(n.id)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {n.pinned && <i className="fas fa-thumbtack text-accent text-[9px]" />}
                          <span className="font-semibold text-[13px] truncate">{formatDateShort(n.date)}</span>
                          <span className="text-[10px] text-neutral/50 ml-auto flex-shrink-0">{relativeTime(n.updated)}</span>
                        </div>
                        {activeFolder === 'all' && (
                          <div className="mb-1">
                            <span className="j-note-folder-badge">{appData.folders.find(f => f.id === n.folderId)?.name || 'Note'}</span>
                          </div>
                        )}
                        {preview && <p className="text-[11px] text-neutral/60 leading-relaxed line-clamp-2 m-0">{preview}</p>}
                        {!preview && <p className="text-[11px] text-neutral/30 italic m-0">Empty note</p>}
                        {n.tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {n.tags.slice(0, 3).map(t => <span key={t} className="j-note-tag-mini">{t}</span>)}
                            {n.tags.length > 3 && <span className="text-[9px] text-neutral/40">+{n.tags.length - 3}</span>}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Editor */}
          <div className={`flex-1 overflow-y-auto flex flex-col min-w-0 rounded-xl transition-all ${focusMode ? 'max-w-[800px] mx-auto' : ''}`}>
            {!currentNote ? (
              /* Empty state */
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div className="j-empty-icon mb-6">
                  <i className="fas fa-feather-alt text-4xl text-accent/30" />
                </div>
                <h2 className="text-xl font-semibold text-white/80 mb-2">Start Writing</h2>
                <p className="text-sm text-neutral/50 max-w-[320px] leading-relaxed mb-6">Select a note from the list or create a new entry to begin journaling your thoughts.</p>
                <div className="flex gap-3">
                  <button className="j-ghost-btn" onClick={toggleCalendar}>
                    <i className="fas fa-plus mr-2 text-xs" /> New Entry
                  </button>
                </div>
                <div className="j-shortcuts-hint mt-10">
                  <p className="text-[10px] text-neutral/30 uppercase tracking-[0.15em] font-semibold mb-3">Markdown Shortcuts</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] text-neutral/40">
                    <span><kbd className="j-kbd">#</kbd> Heading 1</span>
                    <span><kbd className="j-kbd">##</kbd> Heading 2</span>
                    <span><kbd className="j-kbd">-</kbd> Bullet list</span>
                    <span><kbd className="j-kbd">1.</kbd> Numbered list</span>
                    <span><kbd className="j-kbd">[]</kbd> Checklist</span>
                    <span><kbd className="j-kbd">&gt;</kbd> Blockquote</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Active note */
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold cursor-pointer hover:text-accent transition-colors select-none flex items-center gap-2" onClick={toggleCalendar}>
                      {formatDate(currentNote.date)}
                      <i className="fas fa-chevron-down text-xs text-neutral/50" />
                    </h1>
                    <span className="j-folder-label">{currentFolder?.name || 'Note'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className={`j-icon-btn ${currentNote.pinned ? 'text-accent' : 'text-neutral/40'}`}
                      onClick={togglePin}
                      title={currentNote.pinned ? 'Unpin note' : 'Pin note to top'}
                    >
                      <i className="fas fa-thumbtack text-xs" />
                    </button>
                  </div>
                </div>

                {/* Meta info */}
                <div className="flex items-center gap-4 mb-3 text-[11px] text-neutral/40">
                  <span><i className="far fa-clock mr-1" />{relativeTime(currentNote.updated)}</span>
                  {wordCount > 0 && <span><i className="fas fa-font mr-1" />{wordCount} words</span>}
                  {readingTime > 0 && <span><i className="far fa-eye mr-1" />{readingTime} min read</span>}
                  {/* Save status */}
                  <span className={`j-save-indicator ${saveStatus === 'saving' ? 'j-saving' : saveStatus === 'saved' ? 'j-saved' : ''}`}>
                    {saveStatus === 'saving' && <><i className="fas fa-circle-notch fa-spin mr-1" />Saving</>}
                    {saveStatus === 'saved' && <><i className="fas fa-check mr-1" />Saved</>}
                  </span>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mb-4 items-center">
                  {currentNote.tags.map(t => (
                    <div key={t} className="j-editor-tag-pill">{t} <i className="fas fa-times" onClick={() => removeTag(t)} /></div>
                  ))}
                  <div className="flex items-center gap-1 text-neutral/40 text-xs cursor-pointer px-2 py-1 rounded-md hover:bg-white/5 hover:text-neutral transition-colors" onClick={addTag}>
                    <i className="fas fa-plus text-[9px]" /> tag
                  </div>
                </div>

                {/* Editor box */}
                <div className="j-editor-box flex-1">
                  <div className="j-toolbar" onMouseDownCapture={saveSelection}>
                    {/* Undo / Redo */}
                    <button className="j-toolbar-btn" onClick={() => execCmd('undo')} title="Undo (Ctrl+Z)"><i className="fas fa-undo text-xs" /></button>
                    <button className="j-toolbar-btn" onClick={() => execCmd('redo')} title="Redo (Ctrl+Y)"><i className="fas fa-redo text-xs" /></button>
                    <div className="j-separator" />
                    {/* Format dropdown */}
                    <div className="relative">
                      <button className="j-toolbar-btn" onClick={(e) => toggleDropdown(e, 'format')}>Format <i className="fas fa-chevron-down text-[10px]" /></button>
                      {openDropdown === 'format' && (
                        <div className="j-dropdown-menu" style={{ display: 'flex', width: 220 }} onClick={e => e.stopPropagation()}>
                          <div className="j-dropdown-item" onClick={() => { applyFormat('p'); setOpenDropdown(null); }}><span className="j-format-icon"><i className="fas fa-align-left" /></span> Normal</div>
                          <div className="j-dropdown-item" onClick={() => { applyFormat('h1'); setOpenDropdown(null); }}><span className="j-format-icon">H1</span> Heading 1</div>
                          <div className="j-dropdown-item" onClick={() => { applyFormat('h2'); setOpenDropdown(null); }}><span className="j-format-icon">H2</span> Heading 2</div>
                          <div className="j-dropdown-item" onClick={() => { applyFormat('h3'); setOpenDropdown(null); }}><span className="j-format-icon">H3</span> Heading 3</div>
                          <div className="j-dropdown-item" onClick={() => { applyFormat('blockquote'); setOpenDropdown(null); }}><span className="j-format-icon"><i className="fas fa-quote-left" /></span> Quote</div>
                        </div>
                      )}
                    </div>
                    {/* Font dropdown */}
                    <div className="relative">
                      <button className="j-toolbar-btn" onClick={(e) => toggleDropdown(e, 'font')}>{activeFont} <i className="fas fa-chevron-down text-[10px]" /></button>
                      {openDropdown === 'font' && (
                        <div className="j-dropdown-menu" style={{ display: 'flex', width: 180 }} onClick={e => e.stopPropagation()}>
                          {['Arial', 'Courier New', 'Georgia', 'Times New Roman'].map(f => (
                            <div key={f} className={`j-dropdown-item ${activeFont === f ? 'j-dd-active' : ''}`} onClick={() => { editorRef.current?.focus(); document.execCommand('fontName', false, f); setActiveFont(f); setOpenDropdown(null); debouncedSaveNote(); }}>{f}</div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="j-separator" />
                    <div className="flex items-center">
                      <button className="j-toolbar-btn" style={{ padding: '4px 6px' }} onClick={() => changeFontSize(-1)}><i className="fas fa-minus text-[10px]" /></button>
                      <div className="border border-dark-600 px-1.5 py-0.5 rounded text-[13px] mx-0.5 min-w-[18px] text-center">{fontSizes[fontSize]}</div>
                      <button className="j-toolbar-btn" style={{ padding: '4px 6px' }} onClick={() => changeFontSize(1)}><i className="fas fa-plus text-[10px]" /></button>
                    </div>
                    <div className="j-separator" />
                    <button className="j-toolbar-btn" onClick={() => execCmd('bold')} title="Bold (Ctrl+B)" style={{ fontWeight: 'bold', fontFamily: 'serif' }}>B</button>
                    <button className="j-toolbar-btn" onClick={() => execCmd('italic')} title="Italic (Ctrl+I)" style={{ fontStyle: 'italic', fontFamily: 'serif' }}>I</button>
                    <button className="j-toolbar-btn" onClick={() => execCmd('underline')} title="Underline (Ctrl+U)" style={{ textDecoration: 'underline', fontFamily: 'serif' }}>U</button>
                    <button className="j-toolbar-btn" onClick={() => execCmd('strikeThrough')} title="Strikethrough" style={{ textDecoration: 'line-through', fontFamily: 'serif' }}>S</button>
                    <button className="j-toolbar-btn" onClick={() => applyFormat('pre')} title="Code block"><i className="fas fa-code text-xs" /></button>
                    {/* Link — inline popover */}
                    <div className="relative">
                      <button className="j-toolbar-btn" onClick={(e) => { saveSelection(); toggleDropdown(e, 'link'); }} title="Insert link"><i className="fas fa-link text-xs" /></button>
                      {openDropdown === 'link' && (
                        <InlineInput label="Insert Link" placeholder="https://example.com" onSubmit={(url) => { restoreSelection(); insertLink(url); }} onClose={() => setOpenDropdown(null)} />
                      )}
                    </div>
                    <div className="j-separator" />
                    {/* Text color — color picker */}
                    <div className="relative">
                      <button className="j-toolbar-btn" onClick={(e) => { saveSelection(); toggleDropdown(e, 'textColor'); }} title="Text color"><i className="fas fa-font" /></button>
                      {openDropdown === 'textColor' && (
                        <ColorPicker onPick={(c) => { restoreSelection(); execCmd('foreColor', c); }} onClose={() => setOpenDropdown(null)} />
                      )}
                    </div>
                    {/* Highlight color — color picker */}
                    <div className="relative">
                      <button className="j-toolbar-btn" onClick={(e) => { saveSelection(); toggleDropdown(e, 'highlight'); }} title="Highlight color"><i className="fas fa-fill-drip" /></button>
                      {openDropdown === 'highlight' && (
                        <ColorPicker onPick={(c) => { restoreSelection(); execCmd('hiliteColor', c); }} onClose={() => setOpenDropdown(null)} />
                      )}
                    </div>
                    <div className="j-separator" />
                    {/* Insert dropdown */}
                    <div className="relative">
                      <button className="j-toolbar-btn" onClick={(e) => toggleDropdown(e, 'insert')}><i className="fas fa-plus" /></button>
                      {openDropdown === 'insert' && (
                        <div className="j-dropdown-menu" style={{ display: 'flex', width: 210 }} onClick={e => e.stopPropagation()}>
                          <div className="j-dropdown-item" onClick={() => { insertItem('hr'); setOpenDropdown(null); }}><span className="j-format-icon">—</span> Horizontal rule</div>
                          <div className="j-dropdown-item" onClick={() => { insertItem('pagebreak'); setOpenDropdown(null); }}><span className="j-format-icon"><i className="fas fa-cut" /></span> Page break</div>
                          <div className="j-dropdown-item" onClick={() => { setOpenDropdown('image'); }}><span className="j-format-icon"><i className="fas fa-image" /></span> Image</div>
                          <div className="j-dropdown-item" onClick={() => { insertItem('table'); setOpenDropdown(null); }}><span className="j-format-icon"><i className="fas fa-table" /></span> Table</div>
                        </div>
                      )}
                      {openDropdown === 'image' && (
                        <InlineInput label="Image URL" placeholder="https://example.com/image.png" onSubmit={insertImage} onClose={() => setOpenDropdown(null)} />
                      )}
                    </div>
                    {/* Align dropdown */}
                    <div className="relative">
                      <button className="j-toolbar-btn" onClick={(e) => toggleDropdown(e, 'align')}><i className="fas fa-align-left" /> <i className="fas fa-chevron-down text-[10px]" /></button>
                      {openDropdown === 'align' && (
                        <div className="j-dropdown-menu" style={{ display: 'flex', width: 180, right: 0, left: 'auto' }} onClick={e => e.stopPropagation()}>
                          <div className="j-dropdown-item" onClick={() => { execCmd('justifyLeft'); setOpenDropdown(null); }}><span className="j-format-icon"><i className="fas fa-align-left" /></span> Align Left</div>
                          <div className="j-dropdown-item" onClick={() => { execCmd('justifyCenter'); setOpenDropdown(null); }}><span className="j-format-icon"><i className="fas fa-align-center" /></span> Align Center</div>
                          <div className="j-dropdown-item" onClick={() => { execCmd('justifyRight'); setOpenDropdown(null); }}><span className="j-format-icon"><i className="fas fa-align-right" /></span> Align Right</div>
                          <div style={{ height: 1, background: '#22222e', margin: '5px 0' }} />
                          <div className="j-dropdown-item" onClick={() => { execCmd('insertUnorderedList'); setOpenDropdown(null); }}><span className="j-format-icon"><i className="fas fa-list-ul" /></span> Bullet List</div>
                          <div className="j-dropdown-item" onClick={() => { execCmd('insertOrderedList'); setOpenDropdown(null); }}><span className="j-format-icon"><i className="fas fa-list-ol" /></span> Numbered List</div>
                          <div className="j-dropdown-item" onClick={() => { insertItem('checklist'); setOpenDropdown(null); }}><span className="j-format-icon"><i className="far fa-check-square" /></span> Check list</div>
                        </div>
                      )}
                    </div>
                    {/* Clear formatting */}
                    <button className="j-toolbar-btn" onClick={() => execCmd('removeFormat')} title="Clear formatting"><i className="fas fa-eraser text-xs" /></button>
                    <div className="j-separator ml-auto" />
                    {/* Duplicate note */}
                    <button className="j-toolbar-btn" onClick={() => {
                      if (!currentNote) return;
                      const newId = currentNote.id + '_copy_' + Date.now();
                      const dup = { ...currentNote, id: newId, pinned: false, created: new Date().toISOString(), updated: new Date().toISOString() };
                      save({ ...appData, notes: { ...appData.notes, [newId]: dup } });
                      setNoteId(newId);
                    }} title="Duplicate note"><i className="far fa-copy text-xs" /></button>
                    <button className="j-toolbar-btn j-btn-danger" onClick={deleteNote} title="Delete note"><i className="fas fa-trash text-xs" /></button>
                  </div>
                  <div ref={editorRef} className="j-note-editor" contentEditable="true" onInput={handleEditorInput} onKeyDown={handleEditorKeyDown} onMouseUp={saveSelection} onKeyUp={saveSelection} spellCheck="true"
                    onClick={(e) => {
                      if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
                        setTimeout(() => {
                          if (e.target.checked) e.target.setAttribute('checked', 'checked');
                          else e.target.removeAttribute('checked');
                          const textSpan = e.target.closest('.j-checklist-item')?.querySelector('.j-check-text');
                          if (textSpan) {
                            textSpan.style.textDecoration = e.target.checked ? 'line-through' : 'none';
                            textSpan.style.color = e.target.checked ? '#71717a' : '';
                          }
                          saveNote();
                        }, 0);
                      }
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Calendar popup */}
      {calPopup && (
        <div className="j-calendar-popup" style={{ display: 'block', top: calPopup.top, left: calPopup.left }} onClick={e => e.stopPropagation()}>
          <div className="j-cal-header">
            <button onClick={() => setCalDate(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; })}>&lt;</button>
            <span className="font-semibold text-sm">{calDate.toLocaleString('default', { month: 'long' })} {calendarYear}</span>
            <button onClick={() => setCalDate(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; })}>&gt;</button>
          </div>
          <div className="grid grid-cols-7 mb-2 text-neutral text-[11px] font-semibold text-center">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="j-cal-grid">
            {Array.from({ length: calFirstDay }, (_, i) => (
              <div key={'p' + i} className="j-cal-day j-inactive">{prevMonthDays - calFirstDay + 1 + i}</div>
            ))}
            {Array.from({ length: calDaysInMonth }, (_, i) => {
              const day = i + 1;
              const dk = getDateKey(new Date(calendarYear, calendarMonth, day));
              let hasNote = false;
              if (activeFolder === 'all') hasNote = Object.values(appData.notes).some(n => n.date === dk && n.content.trim() !== '');
              else { const nid = `${activeFolder}_${dk}`; hasNote = appData.notes[nid] && appData.notes[nid].content.trim() !== ''; }
              const isToday = day === today.getDate() && calendarMonth === today.getMonth() && calendarYear === today.getFullYear();
              return (
                <div key={day} className={`j-cal-day ${hasNote ? 'j-has-note' : ''} ${isToday ? 'j-today' : ''}`} onClick={() => handleCalDayClick(dk)}>
                  {day}
                </div>
              );
            })}
            {Array.from({ length: 42 - calFirstDay - calDaysInMonth }, (_, i) => (
              <div key={'n' + i} className="j-cal-day j-inactive">{i + 1}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
