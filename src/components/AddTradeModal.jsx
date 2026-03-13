import { useState, useEffect, useRef } from 'react';
import { useTrades } from '../context/TradeContext';
import { useToast } from '../context/ToastContext';
import { formatMoneyFull } from '../utils/formatters';

export default function AddTradeModal({ open, onClose }) {
  const { addTrades } = useTrades();
  const showToast = useToast();
  const [form, setForm] = useState({ symbol: '', side: 'Long', date: '', time: '12:00', size: '', entry: '', exit: '', fees: '0' });
  const symbolRef = useRef();

  useEffect(() => {
    if (open) {
      setForm(f => ({ ...f, date: new Date().toISOString().split('T')[0] }));
      // Auto-focus symbol field
      setTimeout(() => symbolRef.current?.focus(), 100);
    }
  }, [open]);

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
    if (!sz || !en || !ex) { showToast('Fill in size, entry, and exit', 'error'); return; }
    const p = form.side === 'Long' ? (ex - en) * sz - fe : (en - ex) * sz - fe;
    addTrades([{ symbol: sym, side: form.side, date: form.date, time: form.time, size: sz, entry: en, exit: ex, fees: fe, pnl: p, source: 'manual' }]);
    showToast(`Logged ${sym} ${form.side} — ${p >= 0 ? '+' : ''}${formatMoneyFull(p)}`, 'success');
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-dark-800 border border-dark-600 rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="bg-dark-700 px-6 py-4 border-b border-dark-600 flex justify-between items-center">
          <h2 className="text-lg font-semibold"><i className="fa-solid fa-bolt text-accent mr-2" />Log Trade</h2>
          <button onClick={onClose} className="text-neutral hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-dark-600"><i className="fa-solid fa-xmark" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-neutral mb-1 uppercase">Symbol</label>
              <input ref={symbolRef} type="text" placeholder="BTCUSD" required value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none uppercase transition-colors" />
            </div>
            <div className="w-1/3">
              <label className="block text-xs font-medium text-neutral mb-1 uppercase">Side</label>
              <select value={form.side} onChange={e => setForm(f => ({ ...f, side: e.target.value }))}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent outline-none transition-colors">
                <option value="Long">Long</option><option value="Short">Short</option>
              </select>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-neutral mb-1 uppercase">Close Date</label>
              <input type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent outline-none transition-colors" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-neutral mb-1 uppercase">Close Time</label>
              <input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent outline-none transition-colors" />
            </div>
          </div>
          <div className="flex gap-4">
            {['size', 'entry', 'exit'].map(field => (
              <div key={field} className="flex-1">
                <label className="block text-xs font-medium text-neutral mb-1 uppercase">{field === 'entry' ? 'Entry Price' : field === 'exit' ? 'Exit Price' : 'Size'}</label>
                <input type="number" step="any" required placeholder="0.00" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent outline-none transition-colors" />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral mb-1 uppercase">Total Fees</label>
            <input type="number" step="any" value={form.fees} onChange={e => setForm(f => ({ ...f, fees: e.target.value }))}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg p-2.5 text-sm text-white focus:border-accent outline-none transition-colors" />
          </div>
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
            <button type="submit" className="px-6 py-2 bg-accent hover:bg-purple-600 text-sm font-medium rounded-lg text-white transition-colors">Save Trade</button>
          </div>
        </form>
      </div>
    </div>
  );
}
