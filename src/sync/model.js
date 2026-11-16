// Record-level causal versions. Independent edits merge; concurrent edits retain a recovery copy.
export const DATA_KEYS = ['tz_trades','tz_settings','tz_sync_accounts','tz_import_history','tz_trade_trash','tz_trade_versions','tz_dashboard_widgets','tz_hl_addr','tz_lt_addr','tz_saved_trade_filters','notebookData','lifetracker-todos','lifetracker-activities','lifetracker-notes','lifetracker-focus','lifetracker-planning'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function flatten(storage) {
  const result = {};
  for (const key of DATA_KEYS) {
    const raw = storage[key];
    if (raw == null) continue;
    let value; try { value = JSON.parse(raw); } catch { value = raw; }
    if (key === 'notebookData' && value?.notes && Array.isArray(value.folders)) {
      result[`${key}/schema`] = 'journal';
      for (const [id, note] of Object.entries(value.notes)) result[`${key}/notes/${encodeURIComponent(id)}`] = note;
      for (const folder of value.folders) result[`${key}/folders/${encodeURIComponent(folder.id)}`] = folder;
    } else if (Array.isArray(value) && value.every(item => item && typeof item === 'object' && item.id != null)) {
      result[`${key}/schema`] = 'array';
      value.forEach(item => { result[`${key}/items/${encodeURIComponent(item.id)}`] = item; });
    } else if (key === 'tz_settings' && value && typeof value === 'object' && !Array.isArray(value)) {
      result[`${key}/schema`] = 'object';
      Object.entries(value).forEach(([field, item]) => { result[`${key}/fields/${encodeURIComponent(field)}`] = item; });
    } else result[key] = value;
  }
  return result;
}
export function materialize(records) {
  const live = Object.fromEntries(Object.entries(records).filter(([,r]) => !r.deleted).map(([k,r]) => [k,r.value]));
  const storage = {};
  for (const key of DATA_KEYS) {
    const schema = live[`${key}/schema`];
    let value = live[key];
    const members = section => Object.entries(live).filter(([k]) => k.startsWith(`${key}/${section}/`)).map(([k,v]) => [decodeURIComponent(k.split('/')[2]),v]);
    if (schema === 'journal') value = { folders: members('folders').map(([,v]) => v), notes: Object.fromEntries(members('notes')) };
    if (schema === 'array') value = members('items').map(([,v]) => v);
    if (schema === 'object') value = Object.fromEntries(members('fields'));
    if (value !== undefined) storage[key] = typeof value === 'string' && ['tz_hl_addr','tz_lt_addr'].includes(key) ? value : JSON.stringify(value);
  }
  return storage;
}
export function observe(document, flat, device, now = Date.now()) {
  const records = { ...document.records };
  let counter = document.counter || 0;
  for (const key of new Set([...Object.keys(records).filter(k => !k.startsWith('recovery/')), ...Object.keys(flat)])) {
    const old = records[key], deleted = !(key in flat);
    if (old && old.deleted === deleted && (deleted || same(old.value, flat[key]))) continue;
    if (!old && deleted) continue;
    const vector = { ...(old?.vector || {}), [device]: ++counter };
    records[key] = { value: deleted ? null : flat[key], deleted, vector, at: now, device };
  }
  return { version: 1, records, counter };
}
function dominates(a, b) { return Object.entries(b).every(([d,n]) => (a[d] || 0) >= n); }
function identity(record) { return Object.entries(record.vector).sort().map(([d,n]) => `${d}:${n}`).join(','); }
function winner(a,b) { return a.at !== b.at ? (a.at > b.at ? a : b) : identity(a) > identity(b) ? a : b; }
export function merge(left, right) {
  const records = { ...left.records };
  for (const [key, b] of Object.entries(right.records)) {
    const a = records[key];
    if (!a) { records[key] = b; continue; }
    if (dominates(a.vector,b.vector)) continue;
    if (dominates(b.vector,a.vector)) { records[key] = b; continue; }
    const chosen = winner(a,b), other = chosen === a ? b : a;
    const vector = { ...a.vector };
    Object.entries(b.vector).forEach(([d,n]) => { vector[d] = Math.max(vector[d] || 0,n); });
    records[key] = { ...chosen, vector };
    if (!same(a.value,b.value) || a.deleted !== b.deleted) {
      // A deterministic key makes replays idempotent. Never discard the losing edit.
      const id = `${encodeURIComponent(key)}~${encodeURIComponent(identity(other))}`;
      records[`recovery/${id}`] = { ...other, value: { path: key, record: other }, deleted: false };
      if (key.startsWith('notebookData/notes/') && !other.deleted) {
        const note = other.value, copyId = `recovered-${encodeURIComponent(note.id)}-${encodeURIComponent(identity(other))}`;
        records[`notebookData/notes/${encodeURIComponent(copyId)}`] = { ...other, value: { ...note, id: copyId, tags: [...new Set([...(note.tags || []),'sync-recovery'])], recoveredFrom: note.id }, deleted: false };
      }
    }
  }
  return { version: 1, records, counter: Math.max(left.counter || 0,right.counter || 0) };
}
export const emptyDocument = () => ({ version: 1, records: {}, counter: 0 });
