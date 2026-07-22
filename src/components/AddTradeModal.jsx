import { useState, useEffect, useRef } from 'react';
import { useTrades } from '../context/TradeContext';
import { useToast } from '../context/ToastContext';
import { formatMoneyFull } from '../utils/formatters';

const EMPTY_FORM = { symbol: '', side: 'Long', date: '', time: '12:00', size: '', entry: '', exit: '', fees: '0', accountId: '', strategy: '', setup: '', mistake: '', tags: '', notes: '', reviewed: false };

export default function AddTradeModal({ open, onClose, trade = null }) {
  const { addTrades, updateTrade, syncAccounts } = useTrades();
  const showToast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const symbolRef = useRef();

  useEffect(() => {
    if (open) {
      const today = new Date();
      const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      setForm(trade ? {
        symbol: trade.symbol,
        side: trade.side,
        date: trade.date,
        time: trade.time || '12:00',
        size: String(trade.size ?? ''),
        entry: String(trade.entry ?? ''),
        exit: String(trade.exit ?? ''),
        fees: String(trade.fees ?? 0),
        accountId: trade.accountId || '',
        strategy: trade.strategy || '',
        setup: trade.setup || '',
        mistake: trade.mistake || '',
        tags: (trade.tags || []).join(', '),
        notes: trade.notes || '',
        reviewed: Boolean(trade.reviewed),
      } : { ...EMPTY_FORM, date: localDate });
      // Auto-focus symbol field
      setTimeout(() => symbolRef.current?.focus(), 100);
    }
  }, [open, trade]);

  const pnl = (() => {
    const sz = parseFloat(form.size) || 0, en = parseFloat(form.entry) || 0, ex = parseFloat(form.exit) || 0, fe = parseFloat(form.fees) || 0;
    if (!sz || !en || !ex) return null;
    return form.side === 'Long' ? (ex - en) * sz - fe : (en - ex) * sz - fe;
  })();

  const handleSubmit = (e) => {
    e.preventDefault();
    const sym = form.symbol.trim().toUpperCase();
    if (!sym) { showToast('Enter a symbol', 'error'); return; }
    const sz = parseFloat(form.size), en = parseFloat(form.entry), ex = parseFloat(form.exit), fe = parseFloat(form.fees) || 0;
    if (sz <= 0 || en <= 0 || ex <= 0 || fe < 0) { showToast('Size and prices must be positive; fees cannot be negative', 'error'); return; }
    const p = form.side === 'Long' ? (ex - en) * sz - fe : (en - ex) * sz - fe;
    const payload = { symbol: sym, side: form.side, date: form.date, time: form.time, size: sz, entry: en, exit: ex, fees: fe, pnl: p, source: trade?.source || 'manual', accountId: form.accountId, strategy: form.strategy.trim(), setup: form.setup.trim(), mistake: form.mistake.trim(), tags: form.tags.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean), notes: form.notes.trim(), reviewed: form.reviewed };
    if (trade) updateTrade(trade.id, payload);
    else addTrades([payload]);
    showToast(`${trade ? 'Updated' : 'Logged'} ${sym} ${form.side} — ${p >= 0 ? '+' : ''}${formatMoneyFull(p)}`, 'success');
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="trade-modal-title" className="bg-dark-800 border border-dark-600 rounded-xl w-[calc(100%-1.5rem)] max-w-md max-h-[calc(100vh-1.5rem)] overflow-y-auto shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="bg-dark-700 px-6 py-4 border-b border-dark-600 flex justify-between items-center">
          <h2 id="trade-modal-title" className="text-lg font-semibold"><i className="fa-solid fa-bolt text-accent mr-2" />{trade ? 'Edit Trade' : 'Log Trade'}</h2>
          <button type="button" onClick={onClose} aria-label="Close trade dialog" className="text-neutral hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-dark-600"><i className="fa-solid fa-xmark" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="trade-symbol" className="block text-xs font-medium text-neutral mb-1 uppercase">Symbol</label>
              <input id="trade-symbol" ref={symbolRef} type="text" placeholder="BTCUSD" required value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none uppercase transition-colors" />
            </div>
            <div className="w-1/3">
              <label htmlFor="trade-side" className="block text-xs font-medium text-neutral mb-1 uppercase">Side</label>
              <select id="trade-side" value={form.side} onChange={e => setForm(f => ({ ...f, side: e.target.value }))}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent outline-none transition-colors">
                <option value="Long">Long</option><option value="Short">Short</option>
              </select>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="trade-date" className="block text-xs font-medium text-neutral mb-1 uppercase">Close Date</label>
              <input id="trade-date" type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent outline-none transition-colors" />
            </div>
            <div className="flex-1">
              <label htmlFor="trade-time" className="block text-xs font-medium text-neutral mb-1 uppercase">Close Time</label>
              <input id="trade-time" type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent outline-none transition-colors" />
            </div>
          </div>
          <div className="flex gap-4">
            {['size', 'entry', 'exit'].map(field => (
              <div key={field} className="flex-1">
                <label htmlFor={`trade-${field}`} className="block text-xs font-medium text-neutral mb-1 uppercase">{field === 'entry' ? 'Entry Price' : field === 'exit' ? 'Exit Price' : 'Size'}</label>
                <input id={`trade-${field}`} type="number" min="0" step="any" required placeholder="0.00" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent outline-none transition-colors" />
              </div>
            ))}
          </div>
          <div>
            <label htmlFor="trade-fees" className="block text-xs font-medium text-neutral mb-1 uppercase">Total Fees</label>
            <input id="trade-fees" type="number" min="0" step="any" value={form.fees} onChange={e => setForm(f => ({ ...f, fees: e.target.value }))}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent outline-none transition-colors" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="trade-account" className="block text-xs font-medium text-neutral mb-1 uppercase">Account</label>
              <select id="trade-account" value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))} className="w-full bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent outline-none"><option value="">Manual / unassigned</option>{syncAccounts.map(account => <option key={account.id} value={account.id}>{account.label || account.id}</option>)}</select>
            </div>
            <div>
              <label htmlFor="trade-strategy" className="block text-xs font-medium text-neutral mb-1 uppercase">Strategy</label>
              <input id="trade-strategy" value={form.strategy} onChange={e => setForm(f => ({ ...f, strategy: e.target.value }))} placeholder="Breakout, mean reversion…" className="w-full bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent outline-none" />
            </div>
            <div>
              <label htmlFor="trade-setup" className="block text-xs font-medium text-neutral mb-1 uppercase">Setup</label>
              <input id="trade-setup" value={form.setup} onChange={e => setForm(f => ({ ...f, setup: e.target.value }))} placeholder="Opening range reclaim" className="w-full bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent outline-none" />
            </div>
            <div>
              <label htmlFor="trade-mistake" className="block text-xs font-medium text-neutral mb-1 uppercase">Mistake / lesson</label>
              <input id="trade-mistake" value={form.mistake} onChange={e => setForm(f => ({ ...f, mistake: e.target.value }))} placeholder="Chased entry, moved stop…" className="w-full bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent outline-none" />
            </div>
          </div>
          <div>
            <label htmlFor="trade-tags" className="block text-xs font-medium text-neutral mb-1 uppercase">Tags</label>
            <input id="trade-tags" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="a-plus, london, disciplined" className="w-full bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent outline-none" />
          </div>
          <div>
            <label htmlFor="trade-notes" className="block text-xs font-medium text-neutral mb-1 uppercase">Review notes</label>
            <textarea id="trade-notes" rows="3" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="What happened, what worked, and what changes next time?" className="w-full resize-y bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent outline-none" />
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral"><input type="checkbox" checked={form.reviewed} onChange={e => setForm(f => ({ ...f, reviewed: e.target.checked }))} /> Review complete</label>
          {pnl !== null && (
            <div className={`rounded-lg p-4 border transition-colors ${pnl >= 0 ? 'bg-profit/5 border-profit/20' : 'bg-loss/5 border-loss/20'}`}>
              <div className="flex justify-between items-center">
                <span className="text-sm text-neutral">Estimated P&L</span>
                <span className={`text-xl font-bold ${pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{pnl >= 0 ? '+' : ''}{formatMoneyFull(pnl)}</span>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-dark-600">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg text-neutral hover:text-white hover:bg-dark-600 transition-colors">Cancel</button>
            <button type="submit" className="px-6 py-2 bg-accent hover:bg-purple-600 text-sm font-medium rounded-lg text-white transition-colors">{trade ? 'Update Trade' : 'Save Trade'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
