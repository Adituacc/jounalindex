import { useRef } from 'react';
import { useToast } from '../context/ToastContext';
import { useTrades } from '../context/TradeContext';
import { parseCSVTrades } from '../utils/csvImport';
import { dedupeKey } from '../utils/formatters';

export default function Sidebar({ activeView, setActiveView, onOpenAddTrade, onOpenHLSync, onOpenLTSync, collapsed, setCollapsed }) {
  const { trades, addTrades, hlSavedAddr } = useTrades();
  const showToast = useToast();
  const csvRef = useRef();

  const navItems = [
    { id: 'dashboard', icon: 'fa-solid fa-border-all', label: 'Dashboard', shortcut: '1' },
    { id: 'journal', icon: 'fa-solid fa-book', label: 'Journal', shortcut: '2' },
  ];

  const handleCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('File too large (max 5MB)', 'error'); e.target.value = ''; return; }
    try {
      const text = await file.text();
      const imported = parseCSVTrades(text, file.name);
      if (imported.length === 0) { showToast('No valid trades found in file', 'error'); return; }
      const existing = new Set(trades.map(dedupeKey));
      const newTrades = imported.filter(t => !existing.has(dedupeKey(t)));
      addTrades(newTrades);
      showToast(`Imported ${newTrades.length} trades (${imported.length - newTrades.length} dupes skipped)`, 'success');
    } catch {
      showToast('Invalid file format', 'error');
    }
    e.target.value = '';
  };

  return (
    <aside className={`fixed left-0 top-0 h-full bg-dark-800 border-r border-dark-600 flex flex-col z-50 transition-all duration-300 ${collapsed ? 'w-[72px]' : 'w-64'}`}>
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-dark-600 gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-purple-400 flex items-center justify-center flex-shrink-0">
          <i className="fa-solid fa-chart-line text-white text-sm" />
        </div>
        {!collapsed && <span className="text-lg font-bold tracking-wider whitespace-nowrap">adixTRADE</span>}
      </div>

      {/* Action buttons */}
      <div className="p-3 space-y-2">
        <button onClick={onOpenAddTrade}
          className={`w-full bg-accent hover:bg-purple-600 text-white py-2.5 rounded-lg flex items-center justify-center font-medium transition-all group ${collapsed ? 'px-0' : 'px-4'}`}
          title={collapsed ? 'Add Trade (Ctrl+N)' : undefined}>
          <i className="fa-solid fa-plus" />
          {!collapsed && <span className="ml-2">Add Trade</span>}
          {!collapsed && <kbd className="ml-auto text-[10px] opacity-40 bg-white/10 px-1.5 py-0.5 rounded">⌘N</kbd>}
        </button>
        <button onClick={onOpenHLSync}
          className={`w-full bg-gradient-to-r from-[#0e1f2a] to-[#0a2e26] hover:from-[#12283a] hover:to-[#0d3b30] border border-[#50e3c2]/30 text-hl py-2.5 rounded-lg flex items-center justify-center font-medium transition-all group ${collapsed ? 'px-0' : 'px-4'}`}
          title={collapsed ? 'Sync Hyperliquid' : undefined}>
          <svg className="w-4 h-4 transition-transform group-hover:rotate-180 duration-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9" />
          </svg>
          {!collapsed && <span className="ml-2">Sync Hyperliquid</span>}
        </button>
        <button onClick={onOpenLTSync}
          className={`w-full bg-gradient-to-r from-[#1a1a2e] to-[#16213e] hover:from-[#1f1f3a] hover:to-[#1a2847] border border-[#4fc3f7]/30 text-[#4fc3f7] py-2.5 rounded-lg flex items-center justify-center font-medium transition-all group ${collapsed ? 'px-0' : 'px-4'}`}
          title={collapsed ? 'Sync Lighter' : undefined}>
          <svg className="w-4 h-4 transition-transform group-hover:scale-110 duration-300 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-5" />
          </svg>
          {!collapsed && <span className="ml-2">Sync Lighter</span>}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1 mt-2">
        {navItems.map(item => (
          <a
            key={item.id}
            href="#"
            onClick={(e) => { e.preventDefault(); setActiveView(item.id); }}
            className={`flex items-center py-3 rounded-lg transition-all duration-200 group ${collapsed ? 'justify-center px-0' : 'px-4'}
              ${activeView === item.id
                ? 'bg-accent/10 text-white border-l-2 border-accent'
                : 'text-neutral hover:text-white hover:bg-dark-700'}`}
            title={collapsed ? item.label : undefined}
          >
            <i className={`${item.icon} w-5 text-center ${activeView === item.id ? 'text-accent' : ''}`} />
            {!collapsed && (
              <>
                <span className="ml-3 text-sm font-medium">{item.label}</span>
                <kbd className="ml-auto text-[10px] opacity-0 group-hover:opacity-40 transition-opacity bg-dark-600 px-1.5 py-0.5 rounded">{item.shortcut}</kbd>
              </>
            )}
          </a>
        ))}
      </nav>

      {/* Import CSV */}
      <div className="px-3 pb-2">
        <button onClick={() => csvRef.current?.click()}
          className={`w-full border border-dark-600 text-neutral hover:text-white hover:bg-dark-700 py-2 rounded-lg flex items-center justify-center text-sm font-medium transition-all ${collapsed ? 'px-0' : 'px-4'}`}
          title={collapsed ? 'Import CSV' : undefined}>
          <i className="fa-solid fa-file-import" />
          {!collapsed && <span className="ml-2">Import CSV</span>}
        </button>
        <input ref={csvRef} type="file" accept=".csv,.json" className="hidden" onChange={handleCSVImport} aria-label="Import CSV file" />
      </div>

      {/* HL address status */}
      {hlSavedAddr && (
        <div className="px-3 py-3 border-t border-dark-600">
          <div className="flex items-center gap-2 text-xs" title={hlSavedAddr}>
            <div className="w-2 h-2 rounded-full bg-hl animate-pulse" />
            {!collapsed && <span className="text-neutral truncate">{hlSavedAddr.slice(0, 6)}...{hlSavedAddr.slice(-4)} · saved</span>}
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <div className="px-3 py-2 border-t border-dark-600">
        <button onClick={() => setCollapsed(c => !c)}
          className="w-full flex items-center justify-center py-2 text-neutral hover:text-white rounded-lg hover:bg-dark-700 transition-all">
          <i className={`fa-solid fa-chevron-${collapsed ? 'right' : 'left'} text-xs transition-transform`} />
          {!collapsed && <span className="ml-2 text-xs font-medium">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
