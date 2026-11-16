import { useEffect, useState, useRef } from 'react';
import { connect, disconnect, pairingCode, recoveryRecords, subscribe, syncNow } from '../sync/client';
export default function DeviceSync() {
  const [status,setStatus] = useState({state:'local',message:'Saved on this device'});
  const [code,setCode] = useState(''), [showCode,setShowCode] = useState(false), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => subscribe(setStatus),[]);
  async function importPair(event) { const file=event.target.files?.[0]; if(!file)return;setBusy(true);setError('');try { const value=JSON.parse(await file.text());await connect(value.code); }catch(e){setError(e.message || 'Unable to import pairing file.');}finally{setBusy(false);event.target.value='';} }
  async function pair(event) { event.preventDefault(); setBusy(true); setError(''); try { await connect(code); setCode(''); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  function exportRecovery() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({version:1,records:recoveryRecords()},null,2)],{type:'application/json'}));
    const anchor = document.createElement('a'); anchor.href=url; anchor.download='journal-index-sync-recovery.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  return <section className="rounded-2xl border border-accent/30 bg-dark-800 p-5" aria-label="Private device sync">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Your private workspace</h2><p className="mt-2 text-sm text-neutral" role="status">{status.message}</p>{status.lastSync && <p className="mt-1 text-xs text-neutral">Last synced {new Date(status.lastSync).toLocaleString()}</p>}</div><span className="rounded-full bg-accent/10 px-3 py-1 text-xs text-accent">{status.paired ? 'Encrypted sync' : 'Local workspace'}</span></div>
    <p className="mt-3 text-xs leading-5 text-neutral">Your journal, trades, settings, and Life Tracker stay together. Paired devices decrypt your data locally. Keep the pairing code private: it grants access to your workspace. Offline edits sync when you return.</p>
    {status.paired ? <><div className="mt-4 flex flex-wrap gap-2"><button className="rounded-lg bg-accent px-4 py-2 text-sm text-white" onClick={() => syncNow()}>Sync now</button><button className="rounded-lg border border-dark-600 px-4 py-2 text-sm" onClick={() => setShowCode(v => !v)}>{showCode ? 'Hide code' : 'Pair another device'}</button><button className="rounded-lg border border-dark-600 px-4 py-2 text-sm" onClick={exportRecovery}>Export recovered changes</button><button className="rounded-lg px-4 py-2 text-sm text-neutral" onClick={() => { disconnect(); setShowCode(false); }}>Disconnect this device</button></div>{showCode && <div className="mt-3 rounded-lg bg-dark-900 p-3"><label className="text-xs text-neutral">Pairing code<input aria-label="Workspace pairing code" readOnly className="mt-2 w-full select-all bg-transparent font-mono text-xs text-white" value={pairingCode()} /></label><p className="mt-2 text-xs text-neutral">On your other device, open Settings → Your private workspace and enter this code.</p></div>}</> : <form onSubmit={pair} className="mt-4 flex flex-wrap gap-2"><input aria-label="Pairing code" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} placeholder="Paste your JI1. pairing code" className="min-w-0 flex-1 rounded-lg border border-dark-600 bg-dark-900 p-3 text-sm" /><button disabled={busy || !code.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Connecting…' : 'Pair this device'}</button></form>}
    {!status.paired && <div className="mt-3"><button className="text-sm text-accent" disabled={busy} onClick={() => fileRef.current?.click()}>Import pairing file</button><input ref={fileRef} aria-label="Import workspace pairing file" type="file" accept="application/json,.json" className="hidden" onChange={importPair} /></div>}
    {error && <p role="alert" className="mt-3 text-sm text-loss">{error}</p>}
  </section>;
}
