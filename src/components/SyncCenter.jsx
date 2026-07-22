import { useMemo } from 'react';
import { useTrades } from '../context/TradeContext';

function sourceMeta(source) {
  return source === 'lighter'
    ? { name: 'Lighter', color: '#4fc3f7', icon: 'fa-bolt' }
    : { name: 'Hyperliquid', color: '#50e3c2', icon: 'fa-wave-square' };
}

function shortAccount(account) {
  const value = String(account.accountIndex ?? account.address ?? 'Not configured');
  return value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

export default function SyncCenter({ onOpenHyperliquid, onOpenLighter }) {
  const { trades, syncAccounts, importHistory, accountTradeCounts, settings, removeSyncAccount, clearImportHistory, rollbackImport } = useTrades();
  const sourceCounts = useMemo(() => ({
    hyperliquid: trades.filter(trade => trade.source === 'hyperliquid').length,
    lighter: trades.filter(trade => trade.source === 'lighter').length,
  }), [trades]);

  return (
    <div className="min-h-screen p-4 pt-16 md:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Data connections</p>
            <h1 className="mt-1 text-2xl font-bold">Sync Center</h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral">Manage every exchange account, review import results, and keep fills separate from completed journal trades.</p>
          </div>
          <div className="rounded-xl border border-dark-600 bg-dark-800 px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-wider text-neutral">Grouping rule</p>
            <p className="mt-1 text-sm font-semibold text-white">{settings.twapGrouping === 'position-cycle' ? 'Position open → flat' : 'Order-based'}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {['hyperliquid', 'lighter'].map(source => {
            const meta = sourceMeta(source);
            const accounts = syncAccounts.filter(account => account.source === source);
            return (
              <section key={source} className="rounded-2xl border border-dark-600 bg-dark-800 p-5 shadow-lg">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ color: meta.color, background: `${meta.color}15`, border: `1px solid ${meta.color}35` }}>
                      <i className={`fa-solid ${meta.icon}`} />
                    </div>
                    <div>
                      <h2 className="font-semibold">{meta.name}</h2>
                      <p className="text-xs text-neutral">{sourceCounts[source]} logical trades · {accounts.length} accounts</p>
                    </div>
                  </div>
                  <button type="button" aria-label={`Sync ${meta.name} account`} onClick={source === 'lighter' ? onOpenLighter : onOpenHyperliquid} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-purple-600">
                    <i className="fa-solid fa-rotate mr-1.5" />Sync account
                  </button>
                </div>

                <div className="mt-5 space-y-2">
                  {accounts.length === 0 && <div className="rounded-xl border border-dashed border-dark-600 p-4 text-sm text-neutral">No saved account yet. The first successful sync adds it here.</div>}
                  {accounts.map(account => (
                    <div key={account.id} className="flex items-center gap-3 rounded-xl border border-dark-600 bg-dark-900/60 p-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${account.status === 'error' ? 'bg-loss' : account.status === 'synced' ? 'bg-profit' : 'bg-yellow-400'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{account.label || `${meta.name} account`}</p>
                        <p className="truncate text-[11px] text-neutral">{shortAccount(account)} · {accountTradeCounts[account.id] || 0} trades</p>
                        {account.lastError && <p className="mt-1 text-[11px] text-loss">{account.lastError}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wider text-neutral">{account.lastSync ? new Date(account.lastSync).toLocaleString() : 'Never synced'}</p>
                        <button type="button" onClick={() => removeSyncAccount(account.id)} className="mt-1 text-[11px] text-neutral hover:text-loss">Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <section className="rounded-2xl border border-dark-600 bg-dark-800 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Import history</h2>
              <p className="mt-1 text-xs text-neutral">Every sync records logical trades, underlying fills, duplicates, and errors.</p>
            </div>
            {importHistory.length > 0 && <button type="button" onClick={clearImportHistory} className="text-xs text-neutral hover:text-white">Clear history</button>}
          </div>
          <div className="mt-4 overflow-x-auto">
            {importHistory.length === 0 ? (
              <div className="rounded-xl border border-dashed border-dark-600 p-8 text-center text-sm text-neutral">Sync an account to build an audit trail.</div>
            ) : (
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-neutral"><tr><th className="pb-3">Time</th><th className="pb-3">Source</th><th className="pb-3">Account</th><th className="pb-3">Logical trades</th><th className="pb-3">Fills</th><th className="pb-3">Duplicates</th><th className="pb-3">Result</th></tr></thead>
                <tbody className="divide-y divide-dark-600">
                  {importHistory.slice(0, 20).map(entry => (
                    <tr key={entry.id}>
                      <td className="py-3 text-neutral">{new Date(entry.createdAt).toLocaleString()}</td>
                      <td className="py-3 font-medium capitalize">{entry.source}</td>
                      <td className="py-3 text-neutral">{entry.account || '—'}</td>
                      <td className="py-3">{entry.added ?? 0}</td>
                      <td className="py-3">{entry.fills ?? entry.added ?? 0}</td>
                      <td className="py-3">{entry.duplicates ?? 0}</td>
                      <td className={`py-3 ${entry.status === 'error' ? 'text-loss' : entry.status === 'rolled-back' ? 'text-neutral' : 'text-profit'}`}>{entry.status === 'error' ? entry.message || 'Failed' : entry.status === 'rolled-back' ? 'Rolled back' : <span className="flex items-center gap-2">Completed{entry.tradeIds?.length > 0 && <button type="button" onClick={() => confirm(`Remove ${entry.tradeIds.length} trades from this import? They will remain recoverable in Trash.`) && rollbackImport(entry.id)} className="text-[10px] text-neutral underline hover:text-white">Rollback</button>}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
