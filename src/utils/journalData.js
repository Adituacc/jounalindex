function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeJournalBackup(value, sanitizeHtml = (html) => String(html || '')) {
  if (!isRecord(value) || !Array.isArray(value.folders) || !isRecord(value.notes)) {
    throw new Error('This is not a valid journal backup.');
  }

  const seenFolders = new Set();
  const folders = value.folders.map((folder) => {
    if (!isRecord(folder) || typeof folder.id !== 'string' || !folder.id.trim() || typeof folder.name !== 'string' || !folder.name.trim()) {
      throw new Error('The backup contains an invalid folder.');
    }
    const id = folder.id.trim();
    if (seenFolders.has(id)) throw new Error('The backup contains duplicate folders.');
    seenFolders.add(id);
    return {
      id,
      name: folder.name.trim(),
      icon: typeof folder.icon === 'string' && folder.icon.trim() ? folder.icon : 'far fa-folder',
    };
  });

  const notes = {};
  for (const [key, note] of Object.entries(value.notes)) {
    if (!isRecord(note) || typeof note.folderId !== 'string' || !seenFolders.has(note.folderId)) {
      throw new Error('The backup contains a note with an invalid folder.');
    }
    const id = typeof note.id === 'string' && note.id.trim() ? note.id.trim() : key;
    if (!id || notes[id]) throw new Error('The backup contains duplicate or invalid notes.');
    if (typeof note.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(note.date)) {
      throw new Error('The backup contains a note with an invalid date.');
    }
    const created = typeof note.created === 'string' ? note.created : new Date().toISOString();
    const updated = typeof note.updated === 'string' ? note.updated : created;
    notes[id] = {
      ...note,
      id,
      folderId: note.folderId,
      date: note.date,
      content: sanitizeHtml(note.content),
      tags: Array.isArray(note.tags)
        ? [...new Set(note.tags.filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim().toLowerCase()))]
        : [],
      pinned: Boolean(note.pinned),
      created,
      updated,
    };
  }

  return { folders, notes };
}
