import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { normalizeTrade, createTradeId } from '../utils/formatters';

const TradeContext = createContext();

export const DEFAULT_SETTINGS = {
  startBalance: 2000,
  baseCurrency: 'USD',
  timezone: 'UTC',
  tradingDayCutoff: '00:00',
  twapGrouping: 'position-cycle',
  skipDuplicates: true,
  autoBackup: true,
  onboardingComplete: false,
};

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function loadTrades() {
  const parsed = readJson('tz_trades', []);
  return Array.isArray(parsed) ? parsed.map(trade => normalizeTrade(trade)).filter(Boolean) : [];
}

function loadSettings() {
  const stored = readJson('tz_settings', {});
  const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return { ...DEFAULT_SETTINGS, timezone: detectedTimezone, ...stored };
}

function loadAccounts() {
  const stored = readJson('tz_sync_accounts', []);
  if (Array.isArray(stored) && stored.length) return stored;
  const accounts = [];
  const hlAddress = localStorage.getItem('tz_hl_addr');
  const ltAddress = localStorage.getItem('tz_lt_addr');
  if (hlAddress) accounts.push({ id: `hyperliquid_${hlAddress}`, source: 'hyperliquid', label: 'Hyperliquid', address: hlAddress, status: 'ready' });
  if (ltAddress) accounts.push({ id: `lighter_${ltAddress}`, source: 'lighter', label: 'Lighter', address: ltAddress, status: 'ready' });
  return accounts;
}

function persist(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  return value;
}

export function TradeProvider({ children }) {
  const [trades, setTrades] = useState(loadTrades);
  const [settings, setSettings] = useState(loadSettings);
  const [syncAccounts, setSyncAccounts] = useState(loadAccounts);
  const [importHistory, setImportHistory] = useState(() => readJson('tz_import_history', []));
  const [tradeTrash, setTradeTrash] = useState(() => readJson('tz_trade_trash', []));
  const [tradeVersions, setTradeVersions] = useState(() => readJson('tz_trade_versions', []));
  const [activeSource, setActiveSource] = useState('all');
  const [activeTimeFilter, setActiveTimeFilter] = useState('all');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [hlSavedAddr, setHlSavedAddr] = useState(localStorage.getItem('tz_hl_addr') || '');

  const createTradeSnapshot = useCallback((currentTrades, reason) => {
    if (!settings.autoBackup || !currentTrades.length) return;
    const snapshot = { id: createTradeId(), createdAt: new Date().toISOString(), reason, trades: currentTrades };
    setTradeVersions(prev => persist('tz_trade_versions', [snapshot, ...prev].slice(0, 10)));
  }, [settings.autoBackup]);

  const saveTrades = useCallback((newTrades) => {
    createTradeSnapshot(trades, 'Before import replacement');
    const normalized = newTrades.map(trade => normalizeTrade(trade)).filter(Boolean);
    setTrades(persist('tz_trades', normalized));
  }, [createTradeSnapshot, trades]);

  const addTrades = useCallback((newEntries) => {
    setTrades(prev => {
      const normalized = newEntries.map(trade => normalizeTrade(trade)).filter(Boolean);
      return persist('tz_trades', [...prev, ...normalized]);
    });
  }, []);

  const replaceTrades = saveTrades;

  const updateTrade = useCallback((id, patch) => {
    setTrades(prev => persist('tz_trades', prev.map(trade => {
      if (trade.id !== id) return trade;
      return normalizeTrade({ ...trade, ...patch, id: trade.id }) || trade;
    })));
  }, []);

  const deleteTrades = useCallback((ids) => {
    const targets = new Set(Array.isArray(ids) ? ids : [ids]);
    const deletedAt = new Date().toISOString();
    const removed = trades.filter(trade => targets.has(trade.id)).map(trade => ({ ...trade, deletedAt }));
    if (!removed.length) return;
    createTradeSnapshot(trades, `Before deleting ${removed.length} trade${removed.length === 1 ? '' : 's'}`);
    setTradeTrash(old => persist('tz_trade_trash', [...removed, ...old].slice(0, 200)));
    setTrades(persist('tz_trades', trades.filter(trade => !targets.has(trade.id))));
  }, [createTradeSnapshot, trades]);

  const deleteTrade = useCallback((id) => deleteTrades([id]), [deleteTrades]);

  const mergeTrades = useCallback((ids) => {
    const targets = new Set(ids);
    const selected = trades.filter(trade => targets.has(trade.id));
    if (selected.length < 2) return { ok: false, message: 'Select at least two trades to merge.' };
    if (new Set(selected.map(trade => trade.symbol)).size > 1 || new Set(selected.map(trade => trade.side)).size > 1) {
      return { ok: false, message: 'Only trades with the same symbol and side can be merged.' };
    }
    const totalSize = selected.reduce((sum, trade) => sum + trade.size, 0);
    const sameValue = field => new Set(selected.map(trade => trade[field]).filter(Boolean)).size === 1 ? selected.find(trade => trade[field])?.[field] || '' : '';
    const merged = normalizeTrade({
      ...selected[0],
      id: createTradeId(),
      date: [...selected].sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))[0].date,
      time: [...selected].sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))[0].time,
      size: totalSize,
      entry: totalSize ? selected.reduce((sum, trade) => sum + trade.entry * trade.size, 0) / totalSize : 0,
      exit: totalSize ? selected.reduce((sum, trade) => sum + trade.exit * trade.size, 0) / totalSize : 0,
      fees: selected.reduce((sum, trade) => sum + trade.fees, 0),
      pnl: selected.reduce((sum, trade) => sum + trade.pnl, 0),
      fillCount: selected.reduce((sum, trade) => sum + (trade.fillCount || 1), 0),
      strategy: sameValue('strategy'), setup: sameValue('setup'), mistake: sameValue('mistake'),
      accountId: sameValue('accountId'), source: sameValue('source') || 'merged',
      tags: [...new Set(selected.flatMap(trade => trade.tags || []))],
      notes: selected.map(trade => trade.notes).filter(Boolean).join('\n\n'),
      reviewed: selected.every(trade => trade.reviewed),
      mergedTradeIds: selected.map(trade => trade.id),
    });
    if (!merged) return { ok: false, message: 'These trades could not be merged.' };
    createTradeSnapshot(trades, `Before merging ${selected.length} trades`);
    const deletedAt = new Date().toISOString();
    setTradeTrash(old => persist('tz_trade_trash', [...selected.map(trade => ({ ...trade, deletedAt })), ...old].slice(0, 200)));
    setTrades(persist('tz_trades', [...trades.filter(trade => !targets.has(trade.id)), merged]));
    return { ok: true, trade: merged };
  }, [createTradeSnapshot, trades]);

  const restoreTrade = useCallback((id) => {
    const item = tradeTrash.find(trade => trade.id === id);
    if (!item) return;
    const trade = { ...item };
    delete trade.deletedAt;
    setTrades(current => persist('tz_trades', current.some(existing => existing.id === id) ? current : [...current, trade]));
    setTradeTrash(prev => persist('tz_trade_trash', prev.filter(deleted => deleted.id !== id)));
  }, [tradeTrash]);

  const emptyTradeTrash = useCallback(() => {
    setTradeTrash(persist('tz_trade_trash', []));
  }, []);

  const restoreTradeVersion = useCallback((id) => {
    const version = tradeVersions.find(snapshot => snapshot.id === id);
    if (!version || !Array.isArray(version.trades)) return;
    createTradeSnapshot(trades, 'Before restoring an older version');
    const normalized = version.trades.map(trade => normalizeTrade(trade)).filter(Boolean);
    setTrades(persist('tz_trades', normalized));
  }, [createTradeSnapshot, tradeVersions, trades]);

  const clearTradeVersions = useCallback(() => setTradeVersions(persist('tz_trade_versions', [])), []);

  const updateSettings = useCallback((patch) => {
    setSettings(prev => persist('tz_settings', { ...prev, ...patch }));
  }, []);

  const upsertSyncAccount = useCallback((account) => {
    const normalized = {
      ...account,
      id: account.id || `${account.source}_${account.accountIndex || account.address || createTradeId()}`,
      updatedAt: new Date().toISOString(),
    };
    setSyncAccounts(prev => {
      const index = prev.findIndex(item => item.id === normalized.id);
      const next = index >= 0 ? prev.map((item, i) => i === index ? { ...item, ...normalized } : item) : [...prev, normalized];
      return persist('tz_sync_accounts', next);
    });
    return normalized.id;
  }, []);

  const removeSyncAccount = useCallback((id) => {
    setSyncAccounts(prev => persist('tz_sync_accounts', prev.filter(account => account.id !== id)));
  }, []);

  const recordImport = useCallback((entry) => {
    const record = { id: createTradeId(), createdAt: new Date().toISOString(), status: 'success', ...entry };
    setImportHistory(prev => persist('tz_import_history', [record, ...prev].slice(0, 100)));
    if (entry.accountId) {
      setSyncAccounts(prev => persist('tz_sync_accounts', prev.map(account => account.id === entry.accountId ? {
        ...account,
        status: entry.status === 'error' ? 'error' : 'synced',
        lastSync: record.createdAt,
        lastError: entry.status === 'error' ? entry.message : '',
        lastImported: entry.added || 0,
      } : account)));
    }
    return record;
  }, []);

  const clearImportHistory = useCallback(() => setImportHistory(persist('tz_import_history', [])), []);

  const rollbackImport = useCallback((id) => {
    const entry = importHistory.find(item => item.id === id);
    if (!entry?.tradeIds?.length || entry.status === 'rolled-back') return 0;
    const existingIds = entry.tradeIds.filter(tradeId => trades.some(trade => trade.id === tradeId));
    if (existingIds.length) deleteTrades(existingIds);
    setImportHistory(prev => persist('tz_import_history', prev.map(item => item.id === id ? { ...item, status: 'rolled-back', rolledBackAt: new Date().toISOString() } : item)));
    return existingIds.length;
  }, [deleteTrades, importHistory, trades]);

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
      const dt = new Date(`${t.date}T12:00:00`);
      if (activeTimeFilter === 'calendar') return dt.getMonth() === calendarDate.getMonth() && dt.getFullYear() === calendarDate.getFullYear();
      if (activeTimeFilter === 'week') { const days = (now - dt) / 864e5; return days >= 0 && days <= 7; }
      if (activeTimeFilter === '30days') { const days = (now - dt) / 864e5; return days >= 0 && days <= 30; }
      if (activeTimeFilter === 'year') return dt.getFullYear() === now.getFullYear();
      return true;
    });
  }, [trades, activeSource, activeTimeFilter, calendarDate]);

  const accountTradeCounts = useMemo(() => {
    const counts = {};
    trades.forEach(trade => { if (trade.accountId) counts[trade.accountId] = (counts[trade.accountId] || 0) + 1; });
    return counts;
  }, [trades]);

  return (
    <TradeContext.Provider value={{
      trades, settings, syncAccounts, importHistory, tradeTrash, tradeVersions, accountTradeCounts,
      activeSource, activeTimeFilter, calendarDate, hlSavedAddr,
      setActiveSource, setActiveTimeFilter, setCalendarDate, saveHlAddr,
      saveTrades, addTrades, replaceTrades, updateTrade, deleteTrade, deleteTrades, mergeTrades, restoreTrade, emptyTradeTrash, restoreTradeVersion, clearTradeVersions,
      updateSettings, upsertSyncAccount, removeSyncAccount, recordImport, clearImportHistory, rollbackImport, getFilteredTrades,
    }}>
      {children}
    </TradeContext.Provider>
  );
}

export function useTrades() {
  return useContext(TradeContext);
}
