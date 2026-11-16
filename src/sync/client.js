import { appStorage as localStorage } from '../utils/appStorage.js';
import { DATA_KEYS, emptyDocument, flatten, materialize, merge, observe } from './model.js';
import { keysFor, open, seal } from './crypto.js';
const device = crypto.randomUUID();
let documentState = emptyDocument(), ready, code = localStorage.getItem('ji_pairing'), running = false, timer, retry = 0, lastPoll = 0;
let polling;
const cleanups = [];
function listen(target, name, fn) { target.addEventListener(name,fn); cleanups.push(() => target.removeEventListener(name,fn)); }
export function stopSync() { clearTimeout(timer); clearInterval(polling); cleanups.splice(0).forEach(fn => fn()); initialized = false; }
let baseline = {}, dirty = false, etag, initialized = false, applying = false;
let status = { state: code ? 'connecting' : 'local', message: code ? 'Connecting…' : 'Saved on this device', lastSync: null, paired: Boolean(code) };
const listeners = new Set();
const responseRevision = response => (response.headers.get('X-Workspace-Revision') || response.headers.get('ETag'))?.replace(/^W\//, '');
const timedFetch = (url, options) => fetch(url, {...options, signal: AbortSignal.timeout(20000)});
const setStatus = patch => { status = { ...status, ...patch }; listeners.forEach(fn => fn(status)); };
export const subscribe = fn => { listeners.add(fn); fn(status); return () => listeners.delete(fn); };
export const getStatus = () => status;
export const pairingCode = () => code || '';
function db() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open('journal-index-sync',1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspace');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function load() {
  const database = await db();
  try { return await new Promise((resolve,reject) => {
    const tx = database.transaction('workspace'), store = tx.objectStore('workspace');
    const documentRequest=store.get('document'), pairingRequest=store.get('pairing');
    tx.oncomplete=()=>resolve({document:documentRequest.result,pairing:pairingRequest.result});
    tx.onerror=()=>reject(tx.error);
  }); } finally { database.close(); }
}
async function persist() {
  const database = await db();
  try { await new Promise((resolve,reject) => {
    const tx = database.transaction('workspace','readwrite'),store=tx.objectStore('workspace');
    store.put(documentState,'document');
    if(code)store.put(code,'pairing');else store.delete('pairing');
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  }); } finally { database.close(); }
}
function snapshot() { return Object.fromEntries(DATA_KEYS.map(k => [k,localStorage.getItem(k)]).filter(([,v]) => v !== null)); }
function editing() { const node = document.activeElement; if (node?.closest('[aria-label="Private device sync"]')) return false; return node?.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(node?.tagName); }
async function capture() {
  const current = snapshot();
  if (JSON.stringify(current) === JSON.stringify(baseline)) return false;
  documentState = observe(documentState,flatten(current),device);
  baseline = current;
  dirty = true;
  await persist();
  return true;
}
function schedule(delay = 1800) { clearTimeout(timer); timer = setTimeout(() => syncNow(),delay); }
export async function connect(pair) {
  await ready;
  const keys = await keysFor(pair.trim());
  const response = await timedFetch('/api/workspace',{headers:{Authorization:`Bearer ${keys.auth}`},cache:'no-store'});
  if (![200,404].includes(response.status)) { const body = await response.json(); throw new Error(body.error || 'Unable to connect.'); }
  if (code && code !== pair.trim()) throw new Error('This device is already paired. Export a backup and disconnect before changing workspaces.');
  code = pair.trim(); localStorage.setItem('ji_pairing',code);
  window.dispatchEvent(new CustomEvent('workspace:pairing-changed',{detail:{code}}));
  etag = undefined;
  setStatus({paired:true,state:'connecting',message:'Pairing workspace…'});
  return syncNow();
}
export function disconnect() {
  code = null; localStorage.removeItem('ji_pairing'); clearTimeout(timer);
  window.dispatchEvent(new CustomEvent('workspace:pairing-changed',{detail:{code:''}}));
  setStatus({paired:false,state:'local',message:'Saved on this device'});
  return ready.then(persist).catch(() => {});
}
export async function syncNow() {
  await ready;
  if (!code || running) return;
  if (!navigator.onLine) { setStatus({state:'offline',message:'Offline · edits saved on this device'}); return; }
  running = true;
  try {
    window.dispatchEvent(new Event('workspace:flush'));
    await capture();
    const keys = await keysFor(code);
    const headers = {Authorization:`Bearer ${keys.auth}`};
    setStatus({state:'syncing',message:'Checking for changes…'});
    const response = await timedFetch('/api/workspace',{headers:{...headers,...(etag ? {'If-None-Match':etag} : {})},cache:'no-store'});
    let incoming, remoteTag;
    if (response.status === 200) {
      setStatus({state:'syncing',message:'Opening workspace…'});
      incoming = await open(await response.json(),keys.encryption,keys.workspace);
      remoteTag = responseRevision(response);
    } else if (response.status !== 304 && response.status !== 404) {
      const body = await response.json(); throw new Error(body.error || 'Sync unavailable.');
    }
    // Defer applying remote changes while the user is typing. Keep their editor and cursor intact.
    if (incoming && editing()) { schedule(6000); setStatus({state:'pending',message:'Edits saved · sync resumes after editing'}); return; }
    await capture(); // Edits may have arrived during the network request.
    if (incoming && editing()) { schedule(6000); setStatus({state:'pending',message:'Edits saved · sync resumes after editing'}); return; }
    if (incoming) {
      etag = remoteTag;
      const combined = merge(documentState,incoming);
      dirty = JSON.stringify(combined.records) !== JSON.stringify(incoming.records);
      documentState = combined;
      const values = materialize(documentState.records), before = snapshot();
      applying = true;
      try { for (const key of DATA_KEYS) { if (values[key] == null) localStorage.removeItem(key); else localStorage.setItem(key,values[key]); } }
      finally { applying = false; }
      baseline = snapshot();
      await persist();
      if (JSON.stringify(before) !== JSON.stringify(baseline)) window.dispatchEvent(new Event('workspace:updated'));
    }
    if (dirty || response.status === 404) {
      const uploadedRecords = JSON.stringify(documentState.records);
      setStatus({state:'syncing',message:'Preparing changes…'});
      const envelope = await seal(documentState,keys.encryption,keys.workspace);
      setStatus({state:'syncing',message:'Sending changes…'});
      const result = await timedFetch('/api/workspace',{method:'PUT',headers:{...headers,'Content-Type':'application/json',...(etag ? {'If-Match':etag} : {'If-None-Match':'*'})},body:JSON.stringify(envelope)});
      if (result.status === 412) { etag = undefined; schedule(1200); setStatus({state:'pending',message:'Merging changes from your other device…'}); return; }
      if (!result.ok) { const body = await result.json(); throw new Error(body.error || 'Upload failed.'); }
      etag = responseRevision(result);
      await capture();
      dirty = uploadedRecords !== JSON.stringify(documentState.records);
    }
    retry = 0; lastPoll = Date.now();
    setStatus({state:dirty ? 'pending' : 'synced',message:dirty ? 'Changes waiting to sync' : 'Synced across your devices',lastSync:new Date().toISOString()});
    if (dirty) schedule();
  } catch (error) {
    setStatus({state:'error',message:`Saved locally · ${error.message}`});
    schedule(Math.min(300000,15000 * 2 ** retry++));
  } finally { running = false; }
}
export function startSync() {
  if (initialized) return ready;
  initialized = true;
  ready = (async () => {
    try {
      const saved=await load();
      documentState = saved.document || emptyDocument();
      code = code || saved.pairing || null;
      if(code && !localStorage.getItem('ji_pairing'))localStorage.setItem('ji_pairing',code);
      setStatus({paired:Boolean(code),state:code ? 'connecting' : 'local',message:code ? 'Connecting…' : 'Saved on this device'});
      baseline = materialize(documentState.records);
      // Losing an entire browser mirror is recovery, never an instruction to erase the cloud.
      if (!Object.keys(snapshot()).length && Object.keys(baseline).length) {
        applying=true;
        try {for(const [key,value] of Object.entries(baseline))localStorage.setItem(key,value);}
        finally{applying=false;}
        window.dispatchEvent(new Event('workspace:updated'));
      }
      if (JSON.stringify(baseline) !== JSON.stringify(snapshot())) await capture();
    } catch (error) { setStatus({state:'error',message:`Local sync recovery unavailable: ${error.message}`}); }
  })();
  listen(window,'workspace:local-change', event => {
    if (!applying && DATA_KEYS.includes(event.detail.key)) { setStatus({state:code ? 'pending' : 'local',message:code ? 'Saved locally · waiting to sync' : 'Saved on this device'}); schedule(); }
  });
  listen(window,'storage',event => { if (DATA_KEYS.includes(event.key)) { window.dispatchEvent(new Event('workspace:updated')); schedule(); } });
  listen(window,'online',() => schedule(100));
  listen(window,'focus',() => { if (Date.now()-lastPoll > 20000) schedule(500); });
  listen(window,'focusout',() => { if (status.state === 'pending') schedule(2000); });
  listen(document,'visibilitychange',() => { window.dispatchEvent(new Event('workspace:flush')); if (!document.hidden) schedule(300); else ready.then(capture).catch(() => {}); });
  polling = setInterval(() => { if (!document.hidden && Date.now()-lastPoll >= 300000) schedule(300); },300000);
  ready.then(() => { if (code) schedule(500); });
  return ready;
}
export function recoveryRecords() { return Object.entries(documentState.records).filter(([key]) => key.startsWith('recovery/')).map(([,r]) => r.value); }
