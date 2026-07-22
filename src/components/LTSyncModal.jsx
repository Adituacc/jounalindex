import { useEffect, useState, useRef } from 'react';
import { useTrades } from '../context/TradeContext';
import { useToast } from '../context/ToastContext';
import { ltLookupAccounts, syncLighter } from '../utils/ltSync';
import { parseLighterCSV } from '../utils/csvImport';
import { formatMoneyFull, dedupeKey } from '../utils/formatters';

function getTokenAccountIndex(token) {
  const parts = String(token || '').trim().split(':');
  const candidate = parts[0] === 'ro' ? parts[1] : parts[1];
  return /^\d+$/.test(candidate || '') ? candidate : '';
}

export default function LTSyncModal({ open, onClose }) {
  const { trades, addTrades, saveTrades, upsertSyncAccount, recordImport } = useTrades();
  const showToast = useToast();
  const [addr, setAddr] = useState(() => localStorage.getItem('tz_lt_addr') || '');
  const [apiToken, setApiToken] = useState('');
  const [accountOptions, setAccountOptions] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split('T')[0]; });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [clearBefore, setClearBefore] = useState(true);
  const [showTokenHelp, setShowTokenHelp] = useState(false);
  const [status, setStatus] = useState('idle');
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [results, setResults] = useState(null);
  const [preview, setPreview] = useState(null);
  const csvRef = useRef();

  useEffect(() => {
    // Remove credentials saved by older releases. Tokens stay in memory only.
    localStorage.removeItem('tz_lt_token');
  }, []);

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
    setPreview(null); setResults(null); setStatus('progress'); onProgress('Connecting to Lighter...', 5);

    try {
      let syncTarget = a;
      const tokenAccount = getTokenAccountIndex(token);

      if (a.startsWith('0x')) {
        let options = accountOptions;
        if (options.length === 0) {
          onProgress('Finding wallet accounts...', 7);
          options = await ltLookupAccounts(a);
          setAccountOptions(options);
        }

        if (options.length > 1) {
          const tokenMatch = tokenAccount && options.find(option => String(option.index) === tokenAccount);
          const chosenAccount = selectedAccount || (tokenMatch ? tokenAccount : '');
          if (!chosenAccount) {
            setStatus('idle');
            showToast(`Found ${options.length} Lighter accounts. Select the account to sync.`, 'error');
            return;
          }
          setSelectedAccount(chosenAccount);
          syncTarget = chosenAccount;
        } else {
          syncTarget = String(options[0].index);
        }
      }

      if (tokenAccount && tokenAccount !== String(syncTarget)) {
        setStatus('idle');
        showToast(`This token belongs to account #${tokenAccount}. Select that account or use its matching token.`, 'error');
        return;
      }

      const syncResult = await syncLighter(syncTarget, startDate, endDate, token, onProgress);
      const { trades: rawTrades, accIdx, fillCount, openPositions } = syncResult;
      const accountId = `lighter_${accIdx}`;
      const nt = rawTrades.map(trade => ({ ...trade, accountId }));
      upsertSyncAccount({ id: accountId, source: 'lighter', label: `Lighter #${accIdx}`, address: a, accountIndex: String(accIdx), status: 'syncing' });
      onProgress('Preparing position-cycle preview...', 90);
      const existing = new Set(trades.map(dedupeKey));
      const fresh = clearBefore ? nt : nt.filter(trade => !existing.has(dedupeKey(trade)));
      const duplicates = clearBefore ? 0 : nt.length - fresh.length;
      const tp = nt.reduce((s, t) => s + t.pnl, 0);
      const uc = new Set(nt.map(t => t.symbol));
      setPreview({ allTrades: nt, fresh, duplicates, pnl: tp, coins: uc.size, accIdx, fillCount, openPositions, accountId });
      setStatus('preview');
      if (nt.length === 0) showToast('No completed trades found within date range.', 'error');
    } catch (err) {
      console.error(err);
      setStatus('idle');
      const failedAccount = selectedAccount || getTokenAccountIndex(apiToken) || addr.trim();
      const accountId = `lighter_${failedAccount}`;
      upsertSyncAccount({ id: accountId, source: 'lighter', label: `Lighter ${/^\d+$/.test(failedAccount) ? `#${failedAccount}` : ''}`.trim(), address: addr.trim(), accountIndex: /^\d+$/.test(failedAccount) ? failedAccount : '', status: 'error', lastError: err.message });
      recordImport({ source: 'lighter', accountId, account: failedAccount, status: 'error', message: err.message, startDate, endDate });
      showToast(`Lighter sync failed: ${err.message}`, 'error');
    }
  };

  const commitImport = () => {
    if (!preview) return;
    if (clearBefore) {
      const kept = trades.filter(trade => trade.source !== 'lighter' || (trade.accountId && trade.accountId !== preview.accountId));
      saveTrades([...kept, ...preview.allTrades]);
    } else {
      addTrades(preview.fresh);
    }
    setResults({ total: preview.allTrades.length, imported: preview.fresh.length, pnl: preview.pnl, coins: preview.coins, accIdx: preview.accIdx, fillCount: preview.fillCount, openPositions: preview.openPositions });
    setStatus('done');
    recordImport({ source: 'lighter', accountId: preview.accountId, account: `#${preview.accIdx}`, added: preview.fresh.length, fills: preview.fillCount, duplicates: preview.duplicates, tradeIds: preview.fresh.map(trade => trade.id), startDate, endDate });
    showToast(`Lighter: ${preview.fillCount.toLocaleString()} fills imported as ${preview.fresh.length} logical trades`, 'success');
  };

  const handleCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const imported = parseLighterCSV(text);
    if (imported.length === 0) { showToast('No valid Lighter trades found in CSV', 'error'); return; }

    if (clearBefore) {
      // CSV imports have no account identity, so never wipe API-synced accounts.
      const kept = trades.filter(t => t.source !== 'lighter' || t.accountId);
      saveTrades([...kept, ...imported]);
    } else {
      const existing = new Set(trades.map(dedupeKey));
      addTrades(imported.filter(t => !existing.has(dedupeKey(t))));
    }
    const fillCount = imported.reduce((sum, trade) => sum + (trade.fillCount || 1), 0);
    recordImport({ source: 'lighter', account: 'CSV', added: imported.length, fills: fillCount, duplicates: 0, tradeIds: imported.map(trade => trade.id), status: 'success' });
    showToast(`Imported ${fillCount} fills as ${imported.length} grouped Lighter trades`, 'success');
    e.target.value = '';
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="lt-sync-title" className="bg-dark-800 border border-[#4fc3f7]/20 rounded-xl w-[calc(100%-1.5rem)] max-w-lg max-h-[calc(100vh-1.5rem)] shadow-2xl overflow-y-auto animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-[#1a1a2e] to-[#16213e] px-6 py-4 border-b border-[#4fc3f7]/20 flex justify-between items-center">
          <h2 id="lt-sync-title" className="text-lg font-semibold flex items-center gap-2">
            <svg className="w-5 h-5 text-[#4fc3f7]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-5" /></svg>
            Lighter Sync
          </h2>
          <button type="button" onClick={onClose} aria-label="Close Lighter sync" className="text-neutral hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10"><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-lg border border-[#4fc3f7]/20 bg-[#4fc3f7]/5 p-3 text-xs leading-5 text-neutral">
            <p className="font-semibold text-[#4fc3f7]">TWAP-aware position grouping</p>
            <p className="mt-1">Every child execution is combined from position open to flat. A TWAP with hundreds of fills appears as one journal trade with VWAP entry, VWAP exit, and combined P&amp;L.</p>
          </div>
          <div>
            <label htmlFor="lt-account" className="block text-xs font-medium text-neutral mb-1.5 uppercase tracking-wider">Wallet Address or Account Index</label>
            <input id="lt-account" type="text" value={addr} onChange={e => { setAddr(e.target.value); setAccountOptions([]); setSelectedAccount(''); }} placeholder="0x... or account index" spellCheck="false"
              className="w-full bg-dark-900 border border-dark-600 rounded-lg p-3 text-sm text-white focus:border-[#4fc3f7] outline-none font-mono placeholder:text-dark-400" />
          </div>
          {accountOptions.length > 1 && (
            <div className="rounded-lg border border-[#4fc3f7]/20 bg-dark-900 p-3">
              <label htmlFor="lt-subaccount" className="block text-xs font-medium text-[#4fc3f7] mb-1.5 uppercase tracking-wider">Lighter Account</label>
              <select id="lt-subaccount" value={selectedAccount} onChange={event => setSelectedAccount(event.target.value)} className="w-full rounded-lg border border-dark-600 bg-dark-800 p-3 text-sm text-white outline-none focus:border-[#4fc3f7]">
                <option value="">Select an account</option>
                {accountOptions.map(account => (
                  <option key={account.index} value={account.index}>Account #{account.index}{account.name ? ` — ${account.name}` : ''}</option>
                ))}
              </select>
              <p className="mt-2 text-xs text-neutral">The API token must belong to the selected account. Recognized tokens select their account automatically.</p>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="lt-token" className="block text-xs font-medium text-neutral uppercase tracking-wider">API Token</label>
              <button onClick={() => setShowTokenHelp(!showTokenHelp)} className="text-[11px] text-[#4fc3f7] hover:underline">
                {showTokenHelp ? 'Hide help' : 'How to get token?'}
              </button>
            </div>
            <input id="lt-token" type="password" autoComplete="off" value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder="Paste your Lighter API token" spellCheck="false"
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
                <p className="text-[11px] mt-1">Token stays in memory for this session and is sent only to Lighter. Or use <b>Import CSV</b> below — no token needed.</p>
              </div>
            )}
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="lt-from-date" className="block text-xs font-medium text-neutral mb-1.5 uppercase tracking-wider">From Date</label>
              <input id="lt-from-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-dark-900 border border-dark-600 rounded-lg p-3 text-sm text-white focus:border-[#4fc3f7] outline-none" />
            </div>
            <div className="flex-1">
              <label htmlFor="lt-to-date" className="block text-xs font-medium text-neutral mb-1.5 uppercase tracking-wider">To Date</label>
              <input id="lt-to-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-dark-900 border border-dark-600 rounded-lg p-3 text-sm text-white focus:border-[#4fc3f7] outline-none" />
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
              <span className="text-sm text-neutral">Replace only the selected Lighter account <span className="text-xs text-[#4fc3f7]">(recommended)</span></span>
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

          {status === 'preview' && preview && (
            <div className="rounded-lg border border-[#4fc3f7]/25 bg-[#4fc3f7]/5 p-4">
              <div className="flex items-center justify-between"><span className="text-sm font-medium text-[#4fc3f7]">Review grouped trades</span><span className="text-xs text-neutral">No data has changed yet</span></div>
              <p className="mt-1 text-[11px] text-neutral">Account #{preview.accIdx} · {preview.fillCount.toLocaleString()} executions grouped into {preview.allTrades.length} completed position cycles.</p>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center"><div><div className="text-lg font-bold">{preview.fresh.length}</div><div className="text-[10px] uppercase text-neutral">New trades</div></div><div><div className="text-lg font-bold">{preview.duplicates}</div><div className="text-[10px] uppercase text-neutral">Duplicates</div></div><div><div className="text-lg font-bold">{preview.fillCount}</div><div className="text-[10px] uppercase text-neutral">Fills</div></div></div>
              <div className="mt-3 max-h-36 space-y-1 overflow-y-auto border-t border-[#4fc3f7]/15 pt-3">{preview.allTrades.slice(0, 8).map(trade => <div key={trade.id} className="flex justify-between text-xs"><span>{trade.date} · {trade.symbol} · {trade.side} {trade.fillCount > 1 ? `· ${trade.fillCount} fills` : ''}</span><span className={trade.pnl >= 0 ? 'text-profit' : 'text-loss'}>{formatMoneyFull(trade.pnl)}</span></div>)}{preview.allTrades.length > 8 && <p className="text-[11px] text-neutral">+{preview.allTrades.length - 8} more logical trades</p>}</div>
            </div>
          )}

          {status === 'done' && results && (
            <div className="bg-dark-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-[#4fc3f7]">Sync Complete</span>
                <span className="text-xs text-neutral">Account #{results.accIdx} · {results.fillCount.toLocaleString()} fills → {results.total} trades</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><div className="text-lg font-bold">{results.total}</div><div className="text-[10px] text-neutral uppercase">Trades</div></div>
                <div><div className={`text-lg font-bold ${results.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{formatMoneyFull(results.pnl)}</div><div className="text-[10px] text-neutral uppercase">Net P&L</div></div>
                <div><div className="text-lg font-bold">{results.coins}</div><div className="text-[10px] text-neutral uppercase">Markets</div></div>
              </div>
              {results.openPositions > 0 && (
                <p className="mt-3 text-xs text-neutral">{results.openPositions} still-open position{results.openPositions === 1 ? ' was' : 's were'} not counted as completed trades.</p>
              )}
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <button onClick={() => csvRef.current?.click()} className="px-4 py-2 text-sm font-medium rounded-lg text-[#4fc3f7] border border-[#4fc3f7]/30 hover:bg-[#4fc3f7]/10">
              <i className="fa-solid fa-file-import mr-1.5" />Import CSV
            </button>
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} aria-label="Import Lighter CSV file" />
            <div className="flex gap-3 ml-auto">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg text-neutral hover:text-white hover:bg-dark-600">Cancel</button>
              <button onClick={status === 'preview' ? commitImport : handleSync} disabled={status === 'progress'}
                className="px-6 py-2 bg-gradient-to-r from-[#29b6f6] to-[#4fc3f7] hover:from-[#4fc3f7] hover:to-[#81d4fa] text-dark-900 text-sm font-semibold rounded-lg disabled:opacity-50">
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
