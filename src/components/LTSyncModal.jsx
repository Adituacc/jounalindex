import { useState, useRef } from 'react';
import { useTrades } from '../context/TradeContext';
import { useToast } from '../context/ToastContext';
import { syncLighter } from '../utils/ltSync';
import { parseLighterCSV } from '../utils/csvImport';
import { formatMoneyFull, dedupeKey } from '../utils/formatters';

export default function LTSyncModal({ open, onClose }) {
  const { trades, addTrades, saveTrades } = useTrades();
  const showToast = useToast();
  const [addr, setAddr] = useState(() => localStorage.getItem('tz_lt_addr') || '');
  const [apiToken, setApiToken] = useState(() => localStorage.getItem('tz_lt_token') || '');
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split('T')[0]; });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [clearBefore, setClearBefore] = useState(false);
  const [showTokenHelp, setShowTokenHelp] = useState(false);
  const [status, setStatus] = useState('idle');
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [results, setResults] = useState(null);
  const csvRef = useRef();

  const onProgress = (msg, pct) => { setProgressMsg(msg); setProgressPct(pct); };

  const setPreset = (label) => {
    const now = new Date();
    setEndDate(now.toISOString().split('T')[0]);
    const d = new Date(now);
    if (label === '7d') d.setDate(d.getDate() - 7);
    else if (label === '30d') d.setDate(d.getDate() - 30);
    else if (label === '90d') d.setDate(d.getDate() - 90);
    else if (label === '6m') d.setMonth(d.getMonth() - 6);
    else if (label === '1y') d.setFullYear(d.getFullYear() - 1);
    else if (label === 'all') d.setFullYear(2020, 0, 1);
    setStartDate(d.toISOString().split('T')[0]);
  };

  const handleSync = async () => {
    const a = addr.trim();
    if (!a) { showToast('Enter wallet address or account index', 'error'); return; }
    const token = apiToken.trim();
    if (!token) { showToast('API token required — click "How to get token" for instructions', 'error'); return; }
    localStorage.setItem('tz_lt_addr', a);
    localStorage.setItem('tz_lt_token', token);
    setStatus('progress'); onProgress('Connecting to Lighter...', 5);

    try {
      const { trades: nt, accIdx } = await syncLighter(a, startDate, endDate, token, onProgress);
      onProgress('Importing aggregated trades...', 90);

      if (clearBefore) {
        const kept = trades.filter(t => t.source !== 'lighter');
        saveTrades([...kept, ...nt]);
      } else {
        const existing = new Set(trades.map(dedupeKey));
        addTrades(nt.filter(t => !existing.has(dedupeKey(t))));
      }

      const tp = nt.reduce((s, t) => s + t.pnl, 0);
      const uc = new Set(nt.map(t => t.symbol));
      setResults({ total: nt.length, pnl: tp, coins: uc.size, accIdx });
      setStatus('done');

      if (nt.length === 0) showToast('No trades found within date range.', 'error');
      else showToast(`Lighter: synced ${nt.length} aggregated trades`, 'success');
    } catch (err) {
      console.error(err);
      setStatus('idle');
      showToast(`Lighter sync failed: ${err.message}`, 'error');
    }
  };

  const handleCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const imported = parseLighterCSV(text);
    if (imported.length === 0) { showToast('No valid Lighter trades found in CSV', 'error'); return; }

    if (clearBefore) {
      const kept = trades.filter(t => t.source !== 'lighter');
      saveTrades([...kept, ...imported]);
    } else {
      const existing = new Set(trades.map(dedupeKey));
      addTrades(imported.filter(t => !existing.has(dedupeKey(t))));
    }
    showToast(`Imported ${imported.length} aggregated Lighter trades via CSV`, 'success');
    e.target.value = '';
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-dark-800 border border-[#4fc3f7]/20 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-[#1a1a2e] to-[#16213e] px-6 py-4 border-b border-[#4fc3f7]/20 flex justify-between items-center">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <svg className="w-5 h-5 text-[#4fc3f7]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-5" /></svg>
            Lighter Sync
          </h2>
          <button onClick={onClose} className="text-neutral hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10"><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral mb-1.5 uppercase tracking-wider">Wallet Address or Account Index</label>
            <input type="text" value={addr} onChange={e => setAddr(e.target.value)} placeholder="0x... or account index" spellCheck="false"
              className="w-full bg-dark-900 border border-dark-600 rounded-lg p-3 text-sm text-white focus:border-[#4fc3f7] outline-none font-mono placeholder:text-dark-400" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-neutral uppercase tracking-wider">API Token</label>
              <button onClick={() => setShowTokenHelp(!showTokenHelp)} className="text-[11px] text-[#4fc3f7] hover:underline">
                {showTokenHelp ? 'Hide help' : 'How to get token?'}
              </button>
            </div>
            <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder="Paste your Lighter API token" spellCheck="false"
              className="w-full bg-dark-900 border border-dark-600 rounded-lg p-3 text-sm text-white focus:border-[#4fc3f7] outline-none font-mono placeholder:text-dark-400" />
            {showTokenHelp && (
              <div className="mt-2 p-3 bg-dark-700 rounded-lg text-xs text-neutral space-y-1.5 border border-[#4fc3f7]/10">
                <p className="text-white font-medium">To get your API token:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Go to <span className="text-[#4fc3f7]">app.lighter.xyz</span> and connect your wallet</li>
                  <li>Click your profile → <span className="text-white">Settings</span></li>
                  <li>Go to <span className="text-white">API Tokens</span> tab</li>
                  <li>Create a new token (read-only is fine)</li>
                  <li>Copy and paste it here</li>
                </ol>
                <p className="text-[11px] mt-1">Token is saved locally and never shared. Or use <b>Import CSV</b> below — no token needed.</p>
              </div>
            )}
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-neutral mb-1.5 uppercase tracking-wider">From Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-dark-900 border border-dark-600 rounded-lg p-3 text-sm text-white focus:border-[#4fc3f7] outline-none" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-neutral mb-1.5 uppercase tracking-wider">To Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-dark-900 border border-dark-600 rounded-lg p-3 text-sm text-white focus:border-[#4fc3f7] outline-none" />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[['7d','7 Days'],['30d','30 Days'],['90d','90 Days'],['6m','6 Months'],['1y','1 Year'],['all','All Time']].map(([k,l]) => (
              <button key={k} onClick={() => setPreset(k)} className="px-3 py-1 text-xs font-medium rounded-md border border-dark-500 text-neutral hover:text-white hover:border-[#4fc3f7]/50 hover:bg-[#4fc3f7]/10 transition-colors">{l}</button>
            ))}
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={clearBefore} onChange={e => setClearBefore(e.target.checked)} className="w-4 h-4 accent-[#4fc3f7]" />
              <span className="text-sm text-neutral">Replace existing trades</span>
            </label>
          </div>

          {status === 'progress' && (
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-5 h-5 border-2 border-[#4fc3f7] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-[#4fc3f7]">{progressMsg}</span>
              </div>
              <div className="h-1.5 bg-dark-600 rounded-full overflow-hidden">
                <div className="h-full bg-[#4fc3f7] rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          {status === 'done' && results && (
            <div className="bg-dark-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-[#4fc3f7]">Sync Complete</span>
                <span className="text-xs text-neutral">Account #{results.accIdx} → {results.total} grouped trades</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><div className="text-lg font-bold">{results.total}</div><div className="text-[10px] text-neutral uppercase">Trades</div></div>
                <div><div className={`text-lg font-bold ${results.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{formatMoneyFull(results.pnl)}</div><div className="text-[10px] text-neutral uppercase">Net P&L</div></div>
                <div><div className="text-lg font-bold">{results.coins}</div><div className="text-[10px] text-neutral uppercase">Markets</div></div>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <button onClick={() => csvRef.current?.click()} className="px-4 py-2 text-sm font-medium rounded-lg text-[#4fc3f7] border border-[#4fc3f7]/30 hover:bg-[#4fc3f7]/10">
              <i className="fa-solid fa-file-import mr-1.5" />Import CSV
            </button>
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
            <div className="flex gap-3 ml-auto">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg text-neutral hover:text-white hover:bg-dark-600">Cancel</button>
              <button onClick={handleSync} disabled={status === 'progress'}
                className="px-6 py-2 bg-gradient-to-r from-[#29b6f6] to-[#4fc3f7] hover:from-[#4fc3f7] hover:to-[#81d4fa] text-dark-900 text-sm font-semibold rounded-lg disabled:opacity-50">
                {status === 'progress' ? (
                  <><div className="w-4 h-4 border-2 border-dark-900 border-t-transparent rounded-full animate-spin inline-block mr-2" />Syncing...</>
                ) : (
                  <><i className="fa-solid fa-bolt mr-1.5" />{status === 'done' ? 'Sync Again' : 'Sync Trades'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
