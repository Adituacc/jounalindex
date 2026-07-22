import { useMemo, useState } from 'react';
import { useTrades } from '../context/TradeContext';
import { useToast } from '../context/ToastContext';
import { formatMoneyFull } from '../utils/formatters';

const EMPTY_FILTERS = { query: '', source: 'all', accountId: 'all', strategy: 'all', tag: 'all', review: 'all' };

export default function TradeLibrary({ onEditTrade, onJournalTrade }) {
  const { trades, syncAccounts, updateTrade, deleteTrades, mergeTrades } = useTrades();
  const showToast = useToast();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState(new Set());
  const [savedFilters, setSavedFilters] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tz_saved_trade_filters') || '[]'); } catch { return []; }
  });

  const metadata = useMemo(() => ({
    strategies: [...new Set(trades.map(trade => trade.strategy).filter(Boolean))].sort(),
    tags: [...new Set(trades.flatMap(trade => trade.tags || []))].sort(),
  }), [trades]);

  const filtered = useMemo(() => trades.filter(trade => {
    const query = filters.query.trim().toLowerCase();
    if (query && ![trade.symbol, trade.strategy, trade.setup, trade.mistake, trade.notes, ...(trade.tags || [])].join(' ').toLowerCase().includes(query)) return false;
    if (filters.source !== 'all' && trade.source !== filters.source) return false;
    if (filters.accountId !== 'all' && trade.accountId !== filters.accountId) return false;
    if (filters.strategy !== 'all' && trade.strategy !== filters.strategy) return false;
    if (filters.tag !== 'all' && !trade.tags?.includes(filters.tag)) return false;
    if (filters.review === 'reviewed' && !trade.reviewed) return false;
    if (filters.review === 'unreviewed' && trade.reviewed) return false;
    return true;
  }).sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`)), [trades, filters]);

  const toggleAll = () => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(trade => trade.id)));
  const toggleOne = id => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const bulkReview = () => {
    selected.forEach(id => updateTrade(id, { reviewed: true }));
    showToast(`Marked ${selected.size} trades reviewed.`, 'success');
    setSelected(new Set());
  };

  const bulkTag = () => {
    const tag = prompt('Tag selected trades:')?.trim().toLowerCase();
    if (!tag) return;
    selected.forEach(id => {
      const trade = trades.find(item => item.id === id);
      updateTrade(id, { tags: [...new Set([...(trade?.tags || []), tag])] });
    });
    showToast(`Added “${tag}” to ${selected.size} trades.`, 'success');
    setSelected(new Set());
  };

  const bulkMerge = () => {
    const result = mergeTrades([...selected]);
    if (!result.ok) { showToast(result.message, 'error'); return; }
    showToast(`Merged ${selected.size} executions/trades into one logical trade.`, 'success');
    setSelected(new Set());
  };

  const saveCurrentFilter = () => {
    const name = prompt('Name this filter:')?.trim();
    if (!name) return;
    const next = [...savedFilters.filter(filter => filter.name !== name), { name, filters }].slice(-8);
    setSavedFilters(next);
    localStorage.setItem('tz_saved_trade_filters', JSON.stringify(next));
    showToast('Filter saved.', 'success');
  };

  return (
    <div className="min-h-screen p-4 pt-16 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Review workflow</p><h1 className="mt-1 text-2xl font-bold">Trade Library</h1><p className="mt-2 text-sm text-neutral">Organize logical trades by strategy, setup, account, mistakes, and review status.</p></div>
          <button type="button" onClick={saveCurrentFilter} className="rounded-lg border border-dark-600 px-4 py-2 text-sm text-neutral hover:bg-dark-800 hover:text-white"><i className="fa-regular fa-bookmark mr-2" />Save filter</button>
        </div>

        {savedFilters.length > 0 && <div className="flex flex-wrap gap-2">{savedFilters.map(saved => <button type="button" key={saved.name} onClick={() => setFilters(saved.filters)} className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20">{saved.name}</button>)}</div>}

        <section className="rounded-2xl border border-dark-600 bg-dark-800 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <input value={filters.query} onChange={event => setFilters({ ...filters, query: event.target.value })} placeholder="Search trades…" className="rounded-lg border border-dark-600 bg-dark-900 p-2.5 text-sm text-white outline-none focus:border-accent xl:col-span-2" />
            <select value={filters.source} onChange={event => setFilters({ ...filters, source: event.target.value })} className="rounded-lg border border-dark-600 bg-dark-900 p-2.5 text-sm"><option value="all">All sources</option><option value="manual">Manual</option><option value="hyperliquid">Hyperliquid</option><option value="lighter">Lighter</option><option value="import">Import</option></select>
            <select value={filters.accountId} onChange={event => setFilters({ ...filters, accountId: event.target.value })} className="rounded-lg border border-dark-600 bg-dark-900 p-2.5 text-sm"><option value="all">All accounts</option>{syncAccounts.map(account => <option key={account.id} value={account.id}>{account.label || account.id}</option>)}</select>
            <select value={filters.strategy} onChange={event => setFilters({ ...filters, strategy: event.target.value })} className="rounded-lg border border-dark-600 bg-dark-900 p-2.5 text-sm"><option value="all">All strategies</option>{metadata.strategies.map(strategy => <option key={strategy}>{strategy}</option>)}</select>
            <select value={filters.review} onChange={event => setFilters({ ...filters, review: event.target.value })} className="rounded-lg border border-dark-600 bg-dark-900 p-2.5 text-sm"><option value="all">Any review status</option><option value="reviewed">Reviewed</option><option value="unreviewed">Needs review</option></select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral">Tags:</span><button type="button" onClick={() => setFilters({ ...filters, tag: 'all' })} className={`rounded-full px-2.5 py-1 text-xs ${filters.tag === 'all' ? 'bg-accent text-white' : 'bg-dark-900 text-neutral'}`}>All</button>{metadata.tags.map(tag => <button type="button" key={tag} onClick={() => setFilters({ ...filters, tag })} className={`rounded-full px-2.5 py-1 text-xs ${filters.tag === tag ? 'bg-accent text-white' : 'bg-dark-900 text-neutral'}`}>{tag}</button>)}
            <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="ml-auto text-xs text-neutral hover:text-white">Reset filters</button>
          </div>
        </section>

        {selected.size > 0 && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm"><strong>{selected.size} selected</strong><button type="button" onClick={bulkReview} className="text-accent hover:text-white">Mark reviewed</button><button type="button" onClick={bulkTag} className="text-accent hover:text-white">Add tag</button>{selected.size > 1 && <button type="button" onClick={bulkMerge} className="text-accent hover:text-white">Merge logical trade</button>}<button type="button" onClick={() => { if (confirm(`Delete ${selected.size} trades?`)) { deleteTrades([...selected]); setSelected(new Set()); } }} className="text-loss hover:text-white">Delete</button></div>}

        <section className="overflow-hidden rounded-2xl border border-dark-600 bg-dark-800">
          <div className="flex items-center justify-between border-b border-dark-600 px-4 py-3 text-sm"><span>{filtered.length} logical trades</span><span className="text-xs text-neutral">Underlying fills stay grouped and expandable through their fill count.</span></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-dark-900 text-[10px] uppercase tracking-wider text-neutral"><tr><th className="p-3"><input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} /></th><th className="p-3">Trade</th><th className="p-3">Account</th><th className="p-3">Strategy / setup</th><th className="p-3">Tags</th><th className="p-3">Review</th><th className="p-3 text-right">P&amp;L</th><th className="p-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-dark-600">
            {filtered.map(trade => <tr key={trade.id} className="hover:bg-dark-700/60"><td className="p-3"><input type="checkbox" checked={selected.has(trade.id)} onChange={() => toggleOne(trade.id)} /></td><td className="p-3"><strong>{trade.symbol} · {trade.side}</strong><small className="mt-1 block text-neutral">{trade.date} {trade.time} · {trade.fillCount > 1 ? `${trade.fillCount.toLocaleString()} fills → 1 trade` : trade.source}</small></td><td className="p-3 text-neutral">{syncAccounts.find(account => account.id === trade.accountId)?.label || trade.source || 'Manual'}</td><td className="p-3"><span>{trade.strategy || '—'}</span><small className="block text-neutral">{trade.setup || trade.mistake || 'No setup notes'}</small></td><td className="p-3"><div className="flex flex-wrap gap-1">{(trade.tags || []).slice(0, 4).map(tag => <span key={tag} className="rounded-full bg-accent/10 px-2 py-1 text-[10px] text-accent">{tag}</span>)}</div></td><td className="p-3"><button type="button" onClick={() => updateTrade(trade.id, { reviewed: !trade.reviewed })} className={trade.reviewed ? 'text-profit' : 'text-yellow-400'}><i className={`fa-${trade.reviewed ? 'solid' : 'regular'} fa-circle-check mr-1.5`} />{trade.reviewed ? 'Reviewed' : 'Review'}</button></td><td className={`p-3 text-right font-semibold ${trade.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{formatMoneyFull(trade.pnl)}</td><td className="p-3"><div className="flex justify-end gap-1"><button type="button" onClick={() => onJournalTrade?.(trade)} title="Open trade journal" aria-label={`Open ${trade.symbol} trade journal`} className="h-8 w-8 rounded-lg text-neutral hover:bg-accent/10 hover:text-accent"><i className="fa-solid fa-book-open" /></button><button type="button" onClick={() => onEditTrade?.(trade)} title="Edit trade" aria-label={`Edit ${trade.symbol} trade`} className="h-8 w-8 rounded-lg text-neutral hover:bg-accent/10 hover:text-accent"><i className="fa-solid fa-pen" /></button></div></td></tr>)}
            {filtered.length === 0 && <tr><td colSpan="8" className="p-12 text-center text-neutral">No trades match these filters.</td></tr>}
          </tbody></table></div>
        </section>
      </div>
    </div>
  );
}
