import { useRef } from 'react';
import { useTrades } from '../context/TradeContext';
import { useToast } from '../context/ToastContext';

const BACKUP_KEYS = [
  'tz_trades', 'tz_settings', 'tz_sync_accounts', 'tz_import_history', 'tz_trade_trash', 'tz_trade_versions', 'tz_dashboard_widgets', 'tz_hl_addr', 'tz_lt_addr',
  'tz_saved_trade_filters', 'notebookData', 'lifetracker-todos', 'lifetracker-activities', 'lifetracker-notes', 'lifetracker-focus', 'lifetracker-planning',
];

export default function Settings() {
  const { settings, updateSettings, tradeTrash, tradeVersions, restoreTrade, emptyTradeTrash, restoreTradeVersion, clearTradeVersions } = useTrades();
  const showToast = useToast();
  const restoreRef = useRef(null);

  const exportBackup = () => {
    const storage = {};
    BACKUP_KEYS.forEach(key => { const value = localStorage.getItem(key); if (value !== null) storage[key] = value; });
    const payload = { version: 1, createdAt: new Date().toISOString(), storage };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `adixtrade_backup_${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast('Full app backup exported.', 'success');
  };

  const restoreBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (payload?.version !== 1 || !payload.storage || typeof payload.storage !== 'object') throw new Error('Invalid app backup.');
      if (!confirm('Restore this backup? Current app data will be replaced and the app will reload.')) return;
      BACKUP_KEYS.forEach(key => localStorage.removeItem(key));
      Object.entries(payload.storage).forEach(([key, value]) => { if (BACKUP_KEYS.includes(key) && typeof value === 'string') localStorage.setItem(key, value); });
      window.location.reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not restore backup.', 'error');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="min-h-screen p-4 pt-16 md:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Workspace</p><h1 className="mt-1 text-2xl font-bold">Settings & data safety</h1><p className="mt-2 text-sm text-neutral">Set the rules once so every dashboard, sync, and journal view agrees.</p></div>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-2xl border border-dark-600 bg-dark-800 p-5">
            <h2 className="font-semibold">Trading preferences</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-neutral">Starting balance
                <input type="number" min="0" step="any" value={settings.startBalance} onChange={event => updateSettings({ startBalance: Number(event.target.value) || 0 })} className="mt-1.5 w-full rounded-lg border border-dark-600 bg-dark-900 p-2.5 text-sm text-white outline-none focus:border-accent" />
              </label>
              <label className="text-xs text-neutral">Base currency
                <select value={settings.baseCurrency} onChange={event => updateSettings({ baseCurrency: event.target.value })} className="mt-1.5 w-full rounded-lg border border-dark-600 bg-dark-900 p-2.5 text-sm text-white outline-none focus:border-accent"><option>USD</option><option>EUR</option><option>GBP</option><option>INR</option><option>USDC</option></select>
              </label>
              <label className="text-xs text-neutral">Timezone
                <input value={settings.timezone} onChange={event => updateSettings({ timezone: event.target.value })} className="mt-1.5 w-full rounded-lg border border-dark-600 bg-dark-900 p-2.5 text-sm text-white outline-none focus:border-accent" />
              </label>
              <label className="text-xs text-neutral">Trading-day cutoff
                <input type="time" value={settings.tradingDayCutoff} onChange={event => updateSettings({ tradingDayCutoff: event.target.value })} className="mt-1.5 w-full rounded-lg border border-dark-600 bg-dark-900 p-2.5 text-sm text-white outline-none focus:border-accent" />
              </label>
              <label className="text-xs text-neutral sm:col-span-2">Lighter/TWAP grouping
                <select value={settings.twapGrouping} onChange={event => updateSettings({ twapGrouping: event.target.value })} className="mt-1.5 w-full rounded-lg border border-dark-600 bg-dark-900 p-2.5 text-sm text-white outline-none focus:border-accent"><option value="position-cycle">One trade from position open to flat (recommended)</option><option value="order">One trade per parent order</option></select>
              </label>
            </div>
            <div className="mt-5 space-y-3 border-t border-dark-600 pt-5">
              <label className="flex items-center justify-between gap-4 text-sm"><span><strong className="font-medium">Skip duplicates</strong><small className="block text-neutral">Match normalized source, time, market, size and P&amp;L.</small></span><input type="checkbox" checked={settings.skipDuplicates} onChange={event => updateSettings({ skipDuplicates: event.target.checked })} /></label>
              <label className="flex items-center justify-between gap-4 text-sm"><span><strong className="font-medium">Automatic safety snapshots</strong><small className="block text-neutral">Keep deleted trades recoverable in Trash.</small></span><input type="checkbox" checked={settings.autoBackup} onChange={event => updateSettings({ autoBackup: event.target.checked })} /></label>
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-2xl border border-dark-600 bg-dark-800 p-5">
              <h2 className="font-semibold">Full backup</h2><p className="mt-2 text-xs leading-5 text-neutral">Includes trades, accounts, sync history, journal, settings, and Life Tracker data. API tokens are never included.</p>
              <div className="mt-4 grid gap-2"><button type="button" onClick={exportBackup} className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-600"><i className="fa-solid fa-download mr-2" />Export everything</button><button type="button" onClick={() => restoreRef.current?.click()} className="rounded-lg border border-dark-600 px-4 py-2.5 text-sm font-semibold text-neutral hover:bg-dark-700 hover:text-white"><i className="fa-solid fa-upload mr-2" />Restore backup</button><input ref={restoreRef} type="file" accept="application/json,.json" className="hidden" onChange={restoreBackup} /></div>
            </section>
            <section className="rounded-2xl border border-dark-600 bg-dark-800 p-5">
              <div className="flex items-center justify-between"><h2 className="font-semibold">Automatic versions</h2><span className="rounded-full bg-dark-900 px-2 py-1 text-xs text-neutral">{tradeVersions.length}/10</span></div>
              <p className="mt-2 text-xs leading-5 text-neutral">Created before account replacement, bulk import replacement, deletion, or restoring an older version.</p>
              <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">{tradeVersions.map(version => <div key={version.id} className="flex items-center gap-2 rounded-lg bg-dark-900 p-2.5 text-xs"><span className="min-w-0 flex-1"><strong className="block truncate">{version.reason}</strong><small className="text-neutral">{version.trades.length} trades · {new Date(version.createdAt).toLocaleString()}</small></span><button type="button" onClick={() => confirm(`Restore this ${version.trades.length}-trade version?`) && restoreTradeVersion(version.id)} className="text-accent hover:text-white">Restore</button></div>)}{tradeVersions.length === 0 && <p className="rounded-lg border border-dashed border-dark-600 p-4 text-center text-xs text-neutral">Versions appear after the first protected data change.</p>}</div>
              {tradeVersions.length > 0 && <button type="button" onClick={clearTradeVersions} className="mt-3 text-xs text-neutral hover:text-white">Clear versions</button>}
            </section>
            <section className="rounded-2xl border border-dark-600 bg-dark-800 p-5">
              <div className="flex items-center justify-between"><h2 className="font-semibold">Trade trash</h2><span className="rounded-full bg-dark-900 px-2 py-1 text-xs text-neutral">{tradeTrash.length}</span></div>
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                {tradeTrash.length === 0 && <p className="rounded-lg border border-dashed border-dark-600 p-4 text-center text-xs text-neutral">Deleted trades appear here.</p>}
                {tradeTrash.slice(0, 20).map(trade => <div key={`${trade.id}_${trade.deletedAt}`} className="flex items-center gap-2 rounded-lg bg-dark-900 p-2.5 text-xs"><span className="flex-1 truncate"><strong>{trade.symbol}</strong> · {trade.date} · {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}</span><button type="button" onClick={() => restoreTrade(trade.id)} className="text-accent hover:text-white">Restore</button></div>)}
              </div>
              {tradeTrash.length > 0 && <button type="button" onClick={() => confirm('Permanently empty trade trash?') && emptyTradeTrash()} className="mt-3 text-xs text-loss hover:text-white">Empty trash permanently</button>}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
