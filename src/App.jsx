import { useState, useEffect, useCallback } from 'react';
import { TradeProvider } from './context/TradeContext';
import { ToastProvider } from './context/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Journal from './components/Journal';
import AddTradeModal from './components/AddTradeModal';
import HLSyncModal from './components/HLSyncModal';
import LTSyncModal from './components/LTSyncModal';
import LifeTrackerApp from './components/LifeTracker/LifeTrackerApp';
import './components/LifeTracker/LifeTracker.css';

export default function App({ onReady }) {
  const [activeView, setActiveView] = useState('dashboard');
  const [addTradeOpen, setAddTradeOpen] = useState(false);
  const [hlSyncOpen, setHlSyncOpen] = useState(false);
  const [ltSyncOpen, setLtSyncOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Signal ready after first render
  useEffect(() => { onReady?.(); }, [onReady]);

  // Global keyboard shortcuts
  const anyModalOpen = addTradeOpen || hlSyncOpen || ltSyncOpen;
  const handleKeyDown = useCallback((e) => {
    // Escape closes any open modal
    if (e.key === 'Escape') {
      if (addTradeOpen) setAddTradeOpen(false);
      else if (hlSyncOpen) setHlSyncOpen(false);
      else if (ltSyncOpen) setLtSyncOpen(false);
    }
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    // Ctrl/Cmd + N = new trade
    if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !anyModalOpen) { e.preventDefault(); setAddTradeOpen(true); }
    // 1 = dashboard, 2 = journal
    if (!anyModalOpen && !e.ctrlKey && !e.metaKey) {
      if (e.key === '1') setActiveView('dashboard');
      if (e.key === '2') setActiveView('journal');
      if (e.key === '3') setActiveView('lifetracker');
    }
  }, [addTradeOpen, hlSyncOpen, ltSyncOpen, anyModalOpen]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <ErrorBoundary>
      <TradeProvider>
        <ToastProvider>
          <div className="min-h-screen flex">
            <Sidebar
              activeView={activeView}
              setActiveView={setActiveView}
              onOpenAddTrade={() => setAddTradeOpen(true)}
              onOpenHLSync={() => setHlSyncOpen(true)}
              onOpenLTSync={() => setLtSyncOpen(true)}
              collapsed={sidebarCollapsed}
              setCollapsed={setSidebarCollapsed}
            />
            <main className={`flex-1 min-h-screen transition-all duration-300 ${sidebarCollapsed ? 'ml-[72px]' : 'ml-64'}`}>
              <div key={activeView} className="animate-fade-in">
                {activeView === 'dashboard' && <Dashboard />}
                {activeView === 'journal' && <Journal />}
                {activeView === 'lifetracker' && <ErrorBoundary><LifeTrackerApp /></ErrorBoundary>}
              </div>
            </main>

            <AddTradeModal open={addTradeOpen} onClose={() => setAddTradeOpen(false)} />
            <HLSyncModal open={hlSyncOpen} onClose={() => setHlSyncOpen(false)} />
            <LTSyncModal open={ltSyncOpen} onClose={() => setLtSyncOpen(false)} />
          </div>
        </ToastProvider>
      </TradeProvider>
    </ErrorBoundary>
  );
}
