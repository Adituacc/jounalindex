import { useState, useEffect, useCallback } from 'react';
import { TradeProvider, useTrades } from './context/TradeContext';
import { ToastProvider } from './context/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TradeLibrary from './components/TradeLibrary';
import Journal from './components/Journal';
import SyncCenter from './components/SyncCenter';
import Settings from './components/Settings';
import AddTradeModal from './components/AddTradeModal';
import HLSyncModal from './components/HLSyncModal';
import LTSyncModal from './components/LTSyncModal';
import LifeTrackerApp from './components/LifeTracker/LifeTrackerApp';
import './components/LifeTracker/LifeTracker.css';

function CommandPalette({ open, onClose, onNavigate, onAddTrade, onSync }) {
  const [query, setQuery] = useState('');
  const actions = [
    { label: 'Dashboard', hint: '1', icon: 'fa-border-all', run: () => onNavigate('dashboard') },
    { label: 'Trade Library', hint: '2', icon: 'fa-list-check', run: () => onNavigate('trades') },
    { label: 'Journal', hint: '3', icon: 'fa-book', run: () => onNavigate('journal') },
    { label: 'Sync Center', hint: '4', icon: 'fa-rotate', run: () => onNavigate('sync') },
    { label: 'Life Tracker', hint: '5', icon: 'fa-heart-pulse', run: () => onNavigate('lifetracker') },
    { label: 'Settings & backups', hint: '6', icon: 'fa-gear', run: () => onNavigate('settings') },
    { label: 'Log a new trade', hint: 'Ctrl N', icon: 'fa-plus', run: onAddTrade },
    { label: 'Sync Hyperliquid', hint: '', icon: 'fa-wave-square', run: () => onSync('hyperliquid') },
    { label: 'Sync Lighter', hint: '', icon: 'fa-bolt', run: () => onSync('lighter') },
  ];
  const visible = actions.filter(action => action.label.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => { if (!open) setQuery(''); }, [open]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/70 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}><div role="dialog" aria-modal="true" aria-label="Command menu" className="w-full max-w-xl overflow-hidden rounded-2xl border border-dark-600 bg-dark-800 shadow-2xl" onMouseDown={event => event.stopPropagation()}><div className="flex items-center gap-3 border-b border-dark-600 px-4"><i className="fa-solid fa-magnifying-glass text-neutral" /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search views and actions…" className="w-full bg-transparent py-4 text-sm text-white outline-none" /><kbd className="rounded bg-dark-900 px-2 py-1 text-[10px] text-neutral">Esc</kbd></div><div className="max-h-[55vh] overflow-y-auto p-2">{visible.map(action => <button type="button" key={action.label} onClick={() => { action.run(); onClose(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-neutral hover:bg-accent/10 hover:text-white"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-dark-900 text-accent"><i className={`fa-solid ${action.icon}`} /></span><span className="flex-1">{action.label}</span>{action.hint && <kbd className="text-[10px] text-neutral/60">{action.hint}</kbd>}</button>)}{visible.length === 0 && <p className="p-8 text-center text-sm text-neutral">No matching action.</p>}</div></div></div>;
}

function WorkspaceOnboarding({ onNavigate, onAddTrade }) {
  const { trades, syncAccounts, settings, updateSettings } = useTrades();
  if (settings.onboardingComplete) return null;
  const steps = [
    { done: settings.startBalance > 0 && settings.timezone, label: 'Set balance, timezone, and trading-day rules', action: () => onNavigate('settings'), actionLabel: 'Open settings' },
    { done: syncAccounts.length > 0, label: 'Connect at least one exchange account', action: () => onNavigate('sync'), actionLabel: 'Open Sync Center' },
    { done: trades.length > 0, label: 'Import or log the first logical trade', action: trades.length ? () => onNavigate('trades') : onAddTrade, actionLabel: trades.length ? 'Review trades' : 'Log trade' },
  ];
  const completed = steps.filter(step => step.done).length;
  return <aside className="mx-3 mt-16 rounded-2xl border border-accent/30 bg-dark-800 p-4 shadow-lg md:mx-6 md:mt-4"><div className="flex flex-wrap items-start gap-4"><div className="min-w-[180px] flex-1"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Workspace setup · {completed}/{steps.length}</p><h2 className="mt-1 font-semibold">Build your review system</h2></div><button type="button" onClick={() => updateSettings({ onboardingComplete: true })} aria-label="Dismiss setup" className="text-neutral hover:text-white"><i className="fa-solid fa-xmark" /></button></div><div className="mt-3 h-1.5 overflow-hidden rounded bg-dark-600"><div className="h-full bg-accent transition-all" style={{ width: `${completed / steps.length * 100}%` }} /></div></div><div className="grid flex-[2] gap-2 md:grid-cols-3">{steps.map(step => <button type="button" key={step.label} onClick={step.action} className="flex items-center gap-2 rounded-xl bg-dark-900 p-3 text-left text-xs hover:bg-dark-700"><i className={`${step.done ? 'fa-solid fa-circle-check text-profit' : 'fa-regular fa-circle text-neutral'}`} /><span className="flex-1">{step.label}</span></button>)}</div>{completed === steps.length && <button type="button" onClick={() => updateSettings({ onboardingComplete: true })} className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white">Finish setup</button>}</div></aside>;
}

export default function App({ onReady }) {
  const [activeView, setActiveView] = useState('dashboard');
  const [addTradeOpen, setAddTradeOpen] = useState(false);
  const [hlSyncOpen, setHlSyncOpen] = useState(false);
  const [ltSyncOpen, setLtSyncOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [linkedTradeId, setLinkedTradeId] = useState('');
  const [linkedJournalDate, setLinkedJournalDate] = useState('');
  const [commandOpen, setCommandOpen] = useState(false);

  // Signal ready after first render
  useEffect(() => { onReady?.(); }, [onReady]);

  // Global keyboard shortcuts
  const anyModalOpen = addTradeOpen || Boolean(editingTrade) || hlSyncOpen || ltSyncOpen || commandOpen;
  const handleKeyDown = useCallback((e) => {
    // Escape closes any open modal
    if (e.key === 'Escape') {
      if (commandOpen) setCommandOpen(false);
      else if (editingTrade) setEditingTrade(null);
      else if (addTradeOpen) setAddTradeOpen(false);
      else if (hlSyncOpen) setHlSyncOpen(false);
      else if (ltSyncOpen) setLtSyncOpen(false);
      else if (mobileSidebarOpen) setMobileSidebarOpen(false);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCommandOpen(open => !open); return; }
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    // Ctrl/Cmd + N = new trade
    if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !anyModalOpen) { e.preventDefault(); setAddTradeOpen(true); }
    // Number keys switch primary views.
    if (!anyModalOpen && !e.ctrlKey && !e.metaKey) {
      if (e.key === '1') setActiveView('dashboard');
      if (e.key === '2') setActiveView('trades');
      if (e.key === '3') setActiveView('journal');
      if (e.key === '4') setActiveView('sync');
      if (e.key === '5') setActiveView('lifetracker');
      if (e.key === '6') setActiveView('settings');
    }
  }, [addTradeOpen, editingTrade, hlSyncOpen, ltSyncOpen, mobileSidebarOpen, anyModalOpen, commandOpen]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <ErrorBoundary>
      <TradeProvider>
        <ToastProvider>
          <div className="min-h-screen flex">
            {mobileSidebarOpen && (
              <button
                type="button"
                aria-label="Close navigation menu"
                className="fixed inset-0 z-40 bg-black/70 md:hidden"
                onClick={() => setMobileSidebarOpen(false)}
              />
            )}
            <Sidebar
              activeView={activeView}
              setActiveView={setActiveView}
              onOpenAddTrade={() => { setEditingTrade(null); setAddTradeOpen(true); }}
              onOpenHLSync={() => setHlSyncOpen(true)}
              onOpenLTSync={() => setLtSyncOpen(true)}
              collapsed={sidebarCollapsed}
              setCollapsed={setSidebarCollapsed}
              mobileOpen={mobileSidebarOpen}
              onRequestClose={() => setMobileSidebarOpen(false)}
            />
            <button
              type="button"
              aria-label="Open navigation menu"
              className="fixed left-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-dark-600 bg-dark-800 text-white shadow-lg md:hidden"
              onClick={() => { setSidebarCollapsed(false); setMobileSidebarOpen(true); }}
            >
              <i className="fa-solid fa-bars" />
            </button>
            <main className={`w-full min-w-0 flex-1 min-h-screen transition-[margin] duration-300 ml-0 ${sidebarCollapsed ? 'md:ml-[72px]' : 'md:ml-64'}`}>
              <WorkspaceOnboarding onNavigate={setActiveView} onAddTrade={() => setAddTradeOpen(true)} />
              <div key={activeView} className="animate-fade-in">
                {activeView === 'dashboard' && <Dashboard onEditTrade={setEditingTrade} onJournalTrade={trade => { setLinkedTradeId(trade.id); setActiveView('journal'); }} onJournalDate={date => { setLinkedJournalDate(date); setActiveView('journal'); }} />}
                {activeView === 'trades' && <TradeLibrary onEditTrade={setEditingTrade} onJournalTrade={trade => { setLinkedTradeId(trade.id); setActiveView('journal'); }} />}
                {activeView === 'journal' && <Journal linkedTradeId={linkedTradeId} linkedDate={linkedJournalDate} onLinkedTradeConsumed={() => setLinkedTradeId('')} onLinkedDateConsumed={() => setLinkedJournalDate('')} />}
                {activeView === 'sync' && <SyncCenter onOpenHyperliquid={() => setHlSyncOpen(true)} onOpenLighter={() => setLtSyncOpen(true)} />}
                {activeView === 'lifetracker' && <ErrorBoundary><LifeTrackerApp /></ErrorBoundary>}
                {activeView === 'settings' && <Settings />}
              </div>
            </main>

            <AddTradeModal
              open={addTradeOpen || Boolean(editingTrade)}
              trade={editingTrade}
              onClose={() => { setAddTradeOpen(false); setEditingTrade(null); }}
            />
            <HLSyncModal open={hlSyncOpen} onClose={() => setHlSyncOpen(false)} />
            <LTSyncModal open={ltSyncOpen} onClose={() => setLtSyncOpen(false)} />
            <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} onNavigate={setActiveView} onAddTrade={() => setAddTradeOpen(true)} onSync={source => source === 'lighter' ? setLtSyncOpen(true) : setHlSyncOpen(true)} />
          </div>
        </ToastProvider>
      </TradeProvider>
    </ErrorBoundary>
  );
}
