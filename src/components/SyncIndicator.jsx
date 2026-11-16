import { useEffect, useState } from 'react';
import { appStorage } from '../utils/appStorage';
import { useTrades } from '../context/TradeContext';
import { subscribe } from '../sync/client';
export default function SyncIndicator({ onOpen }) {
  const [status,setStatus] = useState({state:'local',message:'Saved on this device'});
  useEffect(() => subscribe(setStatus),[]);
  const {trades} = useTrades();
  let journal;try {journal=JSON.parse(appStorage.getItem('notebookData') || '{}');}catch{journal={};}
  return <button type="button" data-sync-status data-note-count={Object.keys(journal.notes || {}).length} data-folder-count={(journal.folders || []).length} data-trade-count={trades.length} className="fixed right-3 top-3 z-30 max-w-[calc(100vw-80px)] truncate rounded-full border border-dark-600 bg-dark-900/95 px-3 py-2 text-[11px] text-neutral shadow-lg md:static md:ml-auto md:mr-6 md:mt-3 md:block" title={status.message} onClick={onOpen}><i aria-hidden="true" className={`fa-solid ${status.state === 'syncing' ? 'fa-rotate fa-spin' : status.state === 'synced' ? 'fa-check text-profit' : status.state === 'error' ? 'fa-triangle-exclamation text-loss' : 'fa-cloud'} mr-2`} />{status.message}</button>;
}
