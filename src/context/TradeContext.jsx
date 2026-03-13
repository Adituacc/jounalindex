import { createContext, useContext, useState, useCallback } from 'react';

const TradeContext = createContext();

function loadTrades() {
  try { return JSON.parse(localStorage.getItem('tz_trades') || '[]'); } catch { return []; }
}
function loadSettings() {
  try { return JSON.parse(localStorage.getItem('tz_settings') || '{"startBalance":2000}'); } catch { return { startBalance: 2000 }; }
}

export function TradeProvider({ children }) {
  const [trades, setTrades] = useState(loadTrades);
  const [settings] = useState(loadSettings);
  const [activeSource, setActiveSource] = useState('all');
  const [activeTimeFilter, setActiveTimeFilter] = useState('all');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [hlSavedAddr, setHlSavedAddr] = useState(localStorage.getItem('tz_hl_addr') || '');

  const saveTrades = useCallback((newTrades) => {
    setTrades(newTrades);
    localStorage.setItem('tz_trades', JSON.stringify(newTrades));
  }, []);

  const addTrades = useCallback((newEntries) => {
    setTrades(prev => {
      const updated = [...prev, ...newEntries];
      localStorage.setItem('tz_trades', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const replaceTrades = useCallback((newTrades) => {
    localStorage.setItem('tz_trades', JSON.stringify(newTrades));
    setTrades(newTrades);
  }, []);

  const saveHlAddr = useCallback((addr) => {
    localStorage.setItem('tz_hl_addr', addr);
    setHlSavedAddr(addr);
  }, []);

  const getFilteredTrades = useCallback(() => {
    let base = trades;
    if (activeSource === 'manual') base = base.filter(t => !t.source || t.source === 'manual');
    else if (activeSource !== 'all') base = base.filter(t => t.source === activeSource);

    if (activeTimeFilter === 'all') return base;
    const now = new Date();
    return base.filter(t => {
      const dt = new Date(t.date);
      if (activeTimeFilter === 'calendar') {
        return dt.getMonth() === calendarDate.getMonth() && dt.getFullYear() === calendarDate.getFullYear();
      }
      if (activeTimeFilter === 'week') { const days = (now - dt) / 864e5; return days >= -1 && days <= 7; }
      if (activeTimeFilter === '30days') { const days = (now - dt) / 864e5; return days >= -1 && days <= 30; }
      if (activeTimeFilter === 'year') { return dt.getFullYear() === now.getFullYear(); }
      return true;
    });
  }, [trades, activeSource, activeTimeFilter, calendarDate]);

  return (
    <TradeContext.Provider value={{
      trades, settings, activeSource, activeTimeFilter, calendarDate, hlSavedAddr,
      setActiveSource, setActiveTimeFilter, setCalendarDate, saveHlAddr,
      saveTrades, addTrades, replaceTrades, getFilteredTrades,
    }}>
      {children}
    </TradeContext.Provider>
  );
}

export function useTrades() {
  return useContext(TradeContext);
}
