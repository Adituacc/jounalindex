import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

function loadJournalData() {
  try {
    const raw = localStorage.getItem('notebookData');
    if (raw) {
      const data = JSON.parse(raw);
      for (const k in data.notes) { if (!data.notes[k].tags) data.notes[k].tags = []; }
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
    return n.sort((a, b) => sortAsc
      ? parseDateKey(a.date) - parseDateKey(b.date)
      : parseDateKey(b.date) - parseDateKey(a.date)
    );
  }, [appData.notes, activeFolder, tagFilter, searchQ, sortAsc, filterNonEmpty]);

  // All tags with counts
  const allTags = useMemo(() => {
    const tc = {};
    Object.values(appData.notes).forEach(n => { n.tags?.forEach(t => { tc[t] = (tc[t] || 0) + 1; }); });
    return tc;
  }, [appData.notes]);

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
    const updated = { ...appData, notes: { ...appData.notes, [noteId]: { ...appData.notes[noteId], content: editorRef.current.innerHTML, updated: new Date().toISOString() } } };
    save(updated);
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

  const execCmd = (cmd, val = null) => { editorRef.current?.focus(); document.execCommand(cmd, false, val); debouncedSaveNote(); };
  const applyFormat = (tag) => { editorRef.current?.focus(); document.execCommand('formatBlock', false, `<${tag}>`); debouncedSaveNote(); };

  const insertItem = (type) => {
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
    editorRef.current?.focus();
    const sanitized = url.replace(/["'<>]/g, '');
    document.execCommand('insertHTML', false, `<img src="${encodeURI(sanitized)}" style="display:block;max-width:100%;margin:15px 0;border-radius:6px;">`);
    saveNote();
  };

  const insertLink = (url) => {
    editorRef.current?.focus();
    const sanitized = url.replace(/["'<>]/g, '');
    document.execCommand('createLink', false, encodeURI(sanitized));
    debouncedSaveNote();
  };

  const changeFontSize = (dir) => {
    const newIdx = Math.max(0, Math.min(fontSizes.length - 1, fontSize + dir));
    setFontSize(newIdx);
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
    if (sel.rangeCount > 0) savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
  };
  const restoreSelection = () => {
    if (savedSelectionRef.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedSelectionRef.current);
    }
  };

  const currentFolder = currentNote ? appData.folders.find(f => f.id === currentNote.folderId) : null;

  return (
    <div className="flex flex-col" style={{ height: '100vh' }}>
      <div className="flex-1 flex flex-col p-6 overflow-hidden gap-5" style={{ height: '100%' }}>
        {/* Header */}
        <div className="flex items-center gap-5 mb-2">
          <h1 className="text-2xl font-semibold min-w-[250px]">Notebook</h1>
          <div className="flex items-center bg-dark-800 border border-dark-600 rounded-lg px-4 py-2 flex-1 max-w-[600px]">
            <i className="fas fa-search text-neutral mr-3" />
            <input type="text" className="bg-transparent border-none text-white text-sm w-full outline-none" placeholder="Search notes" value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          </div>
          <button
            className={`bg-transparent border text-neutral w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer hover:bg-dark-800 hover:text-white ${filterNonEmpty ? 'border-accent text-accent' : 'border-dark-600'}`}
            onClick={() => setFilterNonEmpty(f => !f)}
            title={filterNonEmpty ? 'Showing non-empty notes only' : 'Show all notes'}
          >
            <i className="fas fa-filter" />
          </button>
        </div>

        {/* Main notebook */}
        <div className="flex-1 flex gap-5 overflow-hidden">
          {/* Folder sidebar */}
          <div className={`j-nav-sidebar ${navCollapsed ? 'j-collapsed' : ''}`}>
            {navCollapsed && (
              <div className="j-expand-strip" onClick={() => setNavCollapsed(false)}><i className="fas fa-chevron-right" /></div>
            )}
            <div className="j-sidebar-inner">
              <div className="flex justify-between items-center px-2 pb-6 font-semibold text-[15px]">
                <div className="flex items-center gap-2 cursor-pointer hover:text-accent" onClick={addFolder}>
                  <i className="fas fa-folder-plus" /> Add folder
                </div>
                <i className="fas fa-chevron-left text-sm cursor-pointer hover:text-accent" onClick={() => setNavCollapsed(true)} />
              </div>
              <div className="mb-5">
                <div className="flex justify-between px-2 pb-2 text-xs text-neutral uppercase tracking-wider">Folders</div>
                <div className={`j-nav-item ${activeFolder === 'all' ? 'j-active' : ''}`} onClick={() => switchFolder('all')}>
                  <i className="far fa-file-alt j-main-icon" /> All notes
                </div>
                {appData.folders.map(f => (
                  <div key={f.id} className={`j-nav-item ${activeFolder === f.id ? 'j-active' : ''}`} onClick={() => switchFolder(f.id)}>
                    <i className={`${f.icon} j-main-icon`} /> {f.name}
                    <i className="fas fa-trash-alt j-more-icon" onClick={(e) => deleteFolder(e, f.id)} />
                  </div>
                ))}
              </div>
              <div>
                <div className="flex justify-between px-2 pb-2 text-xs text-neutral uppercase tracking-wider">Tags</div>
                <div className="flex flex-col gap-2 px-2">
                  {Object.entries(allTags).map(([t, cnt]) => (
                    <div key={t} className={`j-tag-pill ${tagFilter === t ? 'j-active' : ''}`} onClick={() => setTagFilter(tagFilter === t ? null : t)}>
                      {t} <span>{cnt}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Date list sidebar */}
          <div className={`j-mid-sidebar ${midCollapsed ? 'j-collapsed' : ''}`}>
            {midCollapsed && (
              <div className="j-expand-strip" onClick={() => setMidCollapsed(false)}><i className="fas fa-chevron-right" /></div>
            )}
            <div className="j-sidebar-inner">
              <div className="flex justify-between items-center px-5 pb-5 text-base font-semibold">
                <div className="flex items-center gap-2 cursor-pointer hover:text-accent" onClick={toggleCalendar} ref={calBtnRef}>
                  <i className="fas fa-file-medical" /> Log day
                </div>
                <div className="flex gap-4 items-center">
                  <i className={`fas ${sortAsc ? 'fa-sort-amount-up' : 'fa-sort-amount-down'} text-neutral cursor-pointer hover:text-white`} onClick={() => setSortAsc(s => !s)} title={sortAsc ? 'Oldest first' : 'Newest first'} />
                  <i className="fas fa-chevron-left text-neutral cursor-pointer hover:text-white ml-2" onClick={() => setMidCollapsed(true)} />
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 pb-4 font-semibold text-sm border-b border-dark-600">
                <input type="checkbox" className="j-custom-checkbox" checked={filteredNotes.length > 0 && selectedIds.size === filteredNotes.length} onChange={toggleSelectAll} />
                <label className="cursor-pointer">Select all</label>
                {selectedIds.size > 0 && <i className="fas fa-trash text-loss cursor-pointer ml-auto hover:bg-loss/10 p-1 rounded" onClick={deleteSelected} />}
              </div>
              <ul className="j-date-list">
                {filteredNotes.map(n => (
                  <li key={n.id} className={noteId === n.id ? 'j-selected' : ''} onClick={() => setNoteId(n.id)}>
                    <input type="checkbox" className="j-custom-checkbox" checked={selectedIds.has(n.id)} onClick={e => e.stopPropagation()} onChange={() => toggleSelect(n.id)} />
                    <div className="flex flex-col gap-1.5">
                      <div className="font-semibold text-[15px]">{formatDate(n.date)}</div>
                      <div className="text-xs text-neutral flex gap-2 items-center">
                        {activeFolder === 'all' && <span className="bg-dark-400 px-1.5 py-0.5 rounded text-[10px] text-white">{appData.folders.find(f => f.id === n.folderId)?.name || 'Note'}</span>}
                        {activeFolder !== 'all' && new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).format(new Date(n.created))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Editor */}
          <div className="flex-1 overflow-y-auto flex flex-col min-w-0 bg-dark-800 border border-dark-600 rounded-xl p-8">
            <div className="flex justify-between items-end mb-1">
              <h1 className="text-[32px] m-0 cursor-pointer flex items-center select-none hover:text-accent" onClick={toggleCalendar}>
                {currentNote ? (
                  <>{formatDate(currentNote.date)} <span className="text-base text-accent ml-4 font-semibold bg-accent/10 px-2.5 py-1 rounded-full">{currentFolder?.name || 'Note'}</span></>
                ) : 'Select a Date'}
                <i className="fas fa-chevron-down text-lg text-neutral ml-3" />
              </h1>
              <i className="fas fa-file-export text-neutral cursor-pointer text-lg" onClick={exportData} />
            </div>
            {currentNote && <p className="text-neutral text-[13px] mb-2">Last Updated: {new Date(currentNote.updated).toLocaleString()}</p>}

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-5 items-center" style={{ display: currentNote ? 'flex' : 'none' }}>
              {currentNote?.tags.map(t => (
                <div key={t} className="j-editor-tag-pill">{t} <i className="fas fa-times" onClick={() => removeTag(t)} /></div>
              ))}
              <div className="flex items-center gap-1.5 text-neutral text-sm cursor-pointer px-2.5 py-1 rounded-md font-medium hover:bg-white/5 hover:text-white" onClick={addTag}>
                <i className="fas fa-tag" style={{ transform: 'rotate(90deg)' }} /> Add tag <i className="fas fa-caret-down text-[10px]" />
              </div>
            </div>

            {/* Editor box */}
            <div className="j-editor-box">
              <div className="j-toolbar">
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
                <span className="text-[11px] text-neutral mr-2">{wordCount} words</span>
                {/* Duplicate note */}
                <button className="j-toolbar-btn" onClick={() => {
                  if (!currentNote) return;
                  const newId = currentNote.id + '_copy_' + Date.now();
                  const dup = { ...currentNote, id: newId, created: new Date().toISOString(), updated: new Date().toISOString() };
                  save({ ...appData, notes: { ...appData.notes, [newId]: dup } });
                  setNoteId(newId);
                }} title="Duplicate note"><i className="far fa-copy text-xs" /></button>
                <button className="j-toolbar-btn" style={{ color: '#ff4444' }} onClick={deleteNote} title="Delete note"><i className="fas fa-trash" /></button>
              </div>
              <div ref={editorRef} className="j-note-editor" contentEditable="true" onInput={handleEditorInput} onKeyDown={handleEditorKeyDown} spellCheck="true"
                onClick={(e) => {
                  // Sync checkbox checked attribute so it persists in innerHTML
                  if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
                    setTimeout(() => {
                      if (e.target.checked) e.target.setAttribute('checked', 'checked');
                      else e.target.removeAttribute('checked');
                      // Toggle strikethrough on the text
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
