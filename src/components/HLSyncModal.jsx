import { useState, useRef } from 'react';
import { useTrades } from '../context/TradeContext';
import { useToast } from '../context/ToastContext';
import { fetchHL, processHL } from '../utils/hlSync';
import { formatMoneyFull, dedupeKey } from '../utils/formatters';

export default function HLSyncModal({ open, onClose }) {
  const { trades, addTrades, replaceTrades, saveHlAddr, hlSavedAddr, upsertSyncAccount, recordImport } = useTrades();
  const showToast = useToast();
  const [addr, setAddr] = useState(hlSavedAddr);
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split('T')[0]; });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [perpOnly, setPerpOnly] = useState(true);
  const [clearBefore, setClearBefore] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | progress | done
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [results, setResults] = useState(null);
  const [preview, setPreview] = useState(null);
  const lastSynced = useRef([]);

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
    else if (label === 'all') d.setFullYear(2021, 0, 1); // HL launch
    setStartDate(d.toISOString().split('T')[0]);
  };

  const handleSync = async () => {
    const a = addr.trim();
    if (!a || !a.startsWith('0x') || a.length !== 42) { showToast('Enter a valid wallet address', 'error'); return; }
    saveHlAddr(a);
    const st = new Date(startDate).getTime(), et = new Date(endDate).getTime() + 86400000;
    if (isNaN(st) || isNaN(et)) { showToast('Select valid dates', 'error'); return; }

    setPreview(null); setResults(null); setStatus('progress'); onProgress('Connecting...', 5);
    const accountId = `hyperliquid_${a}`;
    upsertSyncAccount({ id: accountId, source: 'hyperliquid', label: 'Hyperliquid', address: a, status: 'syncing' });
    try {
      const fills = await fetchHL(a, st, et, perpOnly, onProgress);
      onProgress(`Processing ${fills.length} fills...`, 85);
      const nt = processHL(fills).map(trade => ({ ...trade, accountId }));
      onProgress('Preparing import preview...', 95);
      const existing = new Set(trades.map(dedupeKey));
      const fresh = clearBefore ? nt : nt.filter(trade => !existing.has(dedupeKey(trade)));
      const duplicates = clearBefore ? 0 : nt.length - fresh.length;
      const tp = nt.reduce((s, t) => s + t.pnl, 0);
      const uc = new Set(nt.map(t => t.symbol));
      setPreview({ allTrades: nt, fresh, duplicates, pnl: tp, coins: uc.size, fillCount: fills.length, accountId, account: a });
      setStatus('preview');
    } catch (err) {
      console.error(err);
      setStatus('idle');
      recordImport({ source: 'hyperliquid', accountId, account: a, status: 'error', message: err.message, startDate, endDate });
      showToast(`Sync failed: ${err.message}`, 'error');
    }
  };

  const commitImport = () => {
    if (!preview) return;
    if (clearBefore) {
      const kept = trades.filter(trade => trade.source !== 'hyperliquid' || (trade.accountId && trade.accountId !== preview.accountId));
      replaceTrades([...kept, ...preview.allTrades]);
    } else {
      addTrades(preview.fresh);
    }
    lastSynced.current = preview.allTrades;
    setResults({ total: preview.allTrades.length, imported: preview.fresh.length, pnl: preview.pnl, coins: preview.coins, fillCount: preview.fillCount });
    setStatus('done');
    recordImport({ source: 'hyperliquid', accountId: preview.accountId, account: preview.account, added: preview.fresh.length, fills: preview.fillCount, duplicates: preview.duplicates, tradeIds: preview.fresh.map(trade => trade.id), startDate, endDate });
    showToast(`Imported ${preview.fresh.length} Hyperliquid trades`, 'success');
  };

  const handleExportCSV = () => {
    if (!lastSynced.current.length) return;
    const h = 'Date,Time,Symbol,Buy/Sell,Quantity,Price,Spread,Expiration,Strike,Call/Put,Commission,Fees';
    const rows = lastSynced.current.map(t => {
      const [y, m, d] = t.date.split('-');
      return `${m}/${d}/${y.slice(2)},${t.time}:00,${t.symbol},${t.side === 'Long' ? 'BUY' : 'SELL'},${t.size},${t.exit},Crypto,,,,,${t.fees.toFixed(4)}`;
    });
    const csv = [h, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `hyperliquid_trades_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported', 'success');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="hl-sync-title" className="bg-dark-800 border border-[#50e3c2]/20 rounded-xl w-[calc(100%-1.5rem)] max-w-lg max-h-[calc(100vh-1.5rem)] shadow-2xl overflow-y-auto animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-[#0e1f2a] to-[#0a2e26] px-6 py-4 border-b border-[#50e3c2]/20 flex justify-between items-center">
          <h2 id="hl-sync-title" className="text-lg font-semibold flex items-center gap-2">
            <svg className="w-5 h-5 text-hl" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9" /></svg>
            Hyperliquid Sync
          </h2>
          <button type="button" onClick={onClose} aria-label="Close Hyperliquid sync" className="text-neutral hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10"><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label htmlFor="hl-wallet" className="block text-xs font-medium text-neutral mb-1.5 uppercase tracking-wider">Wallet Address</label>
            <input id="hl-wallet" type="text" value={addr} onChange={e => setAddr(e.target.value)} placeholder="0x..." spellCheck="false"
              className="w-full bg-dark-900 border border-dark-600 rounded-lg p-3 text-sm text-white focus:border-hl outline-none font-mono placeholder:text-dark-400" />
            <p className="text-[11px] text-neutral mt-1.5">Public wallet address — read-only, no private key needed</p>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="hl-from-date" className="block text-xs font-medium text-neutral mb-1.5 uppercase tracking-wider">From Date</label>
              <input id="hl-from-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-dark-900 border border-dark-600 rounded-lg p-3 text-sm text-white focus:border-hl outline-none" />
            </div>
            <div className="flex-1">
              <label htmlFor="hl-to-date" className="block text-xs font-medium text-neutral mb-1.5 uppercase tracking-wider">To Date</label>
              <input id="hl-to-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-dark-900 border border-dark-600 rounded-lg p-3 text-sm text-white focus:border-hl outline-none" />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[['7d','7 Days'],['30d','30 Days'],['90d','90 Days'],['6m','6 Months'],['1y','1 Year'],['all','All Time']].map(([k,l]) => (
              <button key={k} onClick={() => setPreset(k)} className="px-3 py-1 text-xs font-medium rounded-md border border-dark-500 text-neutral hover:text-white hover:border-hl/50 hover:bg-hl/10 transition-colors">{l}</button>
            ))}
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={perpOnly} onChange={e => setPerpOnly(e.target.checked)} className="w-4 h-4 accent-[#50e3c2]" />
              <span className="text-sm text-neutral">Perps only</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={clearBefore} onChange={e => setClearBefore(e.target.checked)} className="w-4 h-4 accent-[#50e3c2]" />
              <span className="text-sm text-neutral">Replace this wallet's Hyperliquid trades</span>
            </label>
          </div>

          {status === 'progress' && (
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-5 h-5 border-2 border-hl border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-hl">{progressMsg}</span>
              </div>
              <div className="h-1.5 bg-dark-600 rounded-full overflow-hidden">
                <div className="h-full bg-hl rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          {status === 'preview' && preview && (
            <div className="rounded-lg border border-hl/25 bg-hl/5 p-4">
              <div className="flex items-center justify-between"><span className="text-sm font-medium text-hl">Review before import</span><span className="text-xs text-neutral">No data has changed yet</span></div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center"><div><div className="text-lg font-bold">{preview.fresh.length}</div><div className="text-[10px] uppercase text-neutral">New trades</div></div><div><div className="text-lg font-bold">{preview.duplicates}</div><div className="text-[10px] uppercase text-neutral">Duplicates</div></div><div><div className="text-lg font-bold">{preview.fillCount}</div><div className="text-[10px] uppercase text-neutral">Fills</div></div></div>
              <div className="mt-3 max-h-36 space-y-1 overflow-y-auto border-t border-hl/15 pt-3">{preview.allTrades.slice(0, 8).map(trade => <div key={trade.id} className="flex justify-between text-xs"><span>{trade.date} · {trade.symbol} · {trade.side}</span><span className={trade.pnl >= 0 ? 'text-profit' : 'text-loss'}>{formatMoneyFull(trade.pnl)}</span></div>)}{preview.allTrades.length > 8 && <p className="text-[11px] text-neutral">+{preview.allTrades.length - 8} more trades</p>}</div>
            </div>
          )}

          {status === 'done' && results && (
            <div className="bg-dark-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-hl">Sync Complete</span>
                <span className="text-xs text-neutral">{results.fillCount} fills → {results.total} trades</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><div className="text-lg font-bold">{results.total}</div><div className="text-[10px] text-neutral uppercase">Trades</div></div>
                <div><div className={`text-lg font-bold ${results.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{formatMoneyFull(results.pnl)}</div><div className="text-[10px] text-neutral uppercase">Net P&L</div></div>
                <div><div className="text-lg font-bold">{results.coins}</div><div className="text-[10px] text-neutral uppercase">Assets</div></div>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            {status === 'done' && (
              <button onClick={handleExportCSV} className="px-4 py-2 text-sm font-medium rounded-lg text-hl border border-hl/30 hover:bg-hl/10">
                <i className="fa-solid fa-download mr-1.5" />Export CSV
              </button>
            )}
            <div className="flex gap-3 ml-auto">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg text-neutral hover:text-white hover:bg-dark-600">Cancel</button>
              <button onClick={status === 'preview' ? commitImport : handleSync} disabled={status === 'progress'}
                className="px-6 py-2 bg-gradient-to-r from-[#3dd9b3] to-[#50e3c2] hover:from-[#50e3c2] hover:to-[#6aebd0] text-dark-900 text-sm font-semibold rounded-lg disabled:opacity-50">
                {status === 'progress' ? (
                  <><div className="w-4 h-4 border-2 border-dark-900 border-t-transparent rounded-full animate-spin inline-block mr-2" />Syncing...</>
                ) : (
                  <><i className="fa-solid fa-bolt mr-1.5" />{status === 'preview' ? `Import ${preview?.fresh.length || 0}` : status === 'done' ? 'Sync Again' : 'Preview Sync'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
