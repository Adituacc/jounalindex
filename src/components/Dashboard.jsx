import { useState, useMemo, useCallback } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, RadialLinearScale, ArcElement, Filler, Tooltip } from 'chart.js';
import { Line, Bar, Scatter, Radar, Doughnut } from 'react-chartjs-2';
import { useTrades } from '../context/TradeContext';
import { formatMoney, formatMoneyFull } from '../utils/formatters';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, RadialLinearScale, ArcElement, Filler, Tooltip);

export default function Dashboard() {
  const { trades, activeSource, activeTimeFilter, calendarDate, settings, setActiveSource, setActiveTimeFilter, setCalendarDate, getFilteredTrades } = useTrades();
  const [symbolSort, setSymbolSort] = useState('pnl');

  const fTrades = useMemo(() => getFilteredTrades(), [getFilteredTrades]);

  // ---- Compute stats ----
  const stats = useMemo(() => {
    if (!fTrades.length) return null;
    const sorted = [...fTrades].sort((a, b) => new Date(a.date + ' ' + (a.time || '12:00')) - new Date(b.date + ' ' + (b.time || '12:00')));
    let tp = 0, gp = 0, gl = 0, w = 0;
    sorted.forEach(t => { tp += t.pnl; if (t.pnl > 0) { gp += t.pnl; w++; } else if (t.pnl < 0) gl += Math.abs(t.pnl); });
    const l = sorted.length - w, wr = (w / sorted.length) * 100;
    const pf = gl === 0 ? (gp > 0 ? 99 : 0) : gp / gl;
    const aw = w === 0 ? 0 : gp / w, al = l === 0 ? 0 : gl / l;
    const ar = al === 0 ? aw : aw / al;

    // Streaks
    let curStreak = 0, curStreakType = null, maxWinStreak = 0, maxLossStreak = 0, tempWin = 0, tempLoss = 0;
    sorted.forEach(t => {
      if (t.pnl > 0) {
        tempWin++; tempLoss = 0;
        if (tempWin > maxWinStreak) maxWinStreak = tempWin;
      } else if (t.pnl < 0) {
        tempLoss++; tempWin = 0;
        if (tempLoss > maxLossStreak) maxLossStreak = tempLoss;
      } else { tempWin = 0; tempLoss = 0; }
    });
    // Current streak from the end
    for (let i = sorted.length - 1; i >= 0; i--) {
      const p = sorted[i].pnl;
      if (curStreakType === null) { curStreakType = p >= 0 ? 'win' : 'loss'; curStreak = 1; }
      else if ((curStreakType === 'win' && p >= 0) || (curStreakType === 'loss' && p < 0)) curStreak++;
      else break;
    }

    // Best / worst trade
    const bestTrade = sorted.reduce((best, t) => t.pnl > best.pnl ? t : best, sorted[0]);
    const worstTrade = sorted.reduce((worst, t) => t.pnl < worst.pnl ? t : worst, sorted[0]);

    const filteredDMap = {};
    sorted.forEach(t => { if (!filteredDMap[t.date]) filteredDMap[t.date] = { pnl: 0 }; filteredDMap[t.date].pnl += t.pnl; });
    const gd = Object.values(filteredDMap).filter(d => d.pnl > 0).length;
    const rd = Object.values(filteredDMap).filter(d => d.pnl < 0).length;
    const bd = Object.values(filteredDMap).filter(d => d.pnl === 0).length;
    const totD = Object.keys(filteredDMap).length;
    const dwr = totD === 0 ? 0 : (gd / totD) * 100;

    // Chart data
    const sd = Object.keys(filteredDMap).sort();
    const labels = sd.map(d => { const [y, m, day] = d.split('-'); return `${m}/${day}/${y.slice(2)}`; });
    let cp = 0, pk = 0, maxDD = 0;
    const cumData = [], dailyData = [], ddData = [];
    sd.forEach(day => { const dp = filteredDMap[day].pnl; dailyData.push(dp); cp += dp; cumData.push(cp); if (cp > pk) pk = cp; const dd = cp - pk; ddData.push(dd); if (dd < maxDD) maxDD = dd; });
    const accData = [settings.startBalance, ...cumData.map(c => settings.startBalance + c)];
    const accLabels = ['Start', ...labels];
    const timePts = sorted.map(t => { const [h, m] = (t.time || '12:00').split(':'); return { x: parseInt(h) + parseInt(m) / 60, y: t.pnl }; });

    // Recovery factor = total P&L / max drawdown (absolute)
    const recoveryFactor = maxDD === 0 ? (tp > 0 ? 3 : 0) : Math.abs(tp / maxDD);
    // Max drawdown as % of peak equity
    const maxDDPct = pk === 0 ? 0 : Math.abs(maxDD / (settings.startBalance + pk)) * 100;
    // Consistency = % of profitable days that contributed to total profit (evenness)
    const consistency = dwr;

    const adixScore = Math.round(
      (wr * 0.15) +
      (Math.min(pf, 3) / 3 * 20) +
      (Math.min(ar, 3) / 3 * 20) +
      (Math.min(recoveryFactor, 3) / 3 * 15) +
      (Math.max(0, 100 - maxDDPct) * 0.1) +
      (dwr * 0.2)
    );

    // Symbol performance
    const symbolMap = {};
    sorted.forEach(t => {
      const sym = (t.symbol || 'Unknown').toUpperCase();
      if (!symbolMap[sym]) symbolMap[sym] = { symbol: sym, pnl: 0, count: 0, wins: 0 };
      symbolMap[sym].pnl += t.pnl;
      symbolMap[sym].count++;
      if (t.pnl > 0) symbolMap[sym].wins++;
    });
    const symbols = Object.values(symbolMap);

    // Side distribution
    let longCount = 0, shortCount = 0, longPnl = 0, shortPnl = 0;
    sorted.forEach(t => {
      if (t.side === 'long' || t.side === 'buy') { longCount++; longPnl += t.pnl; }
      else { shortCount++; shortPnl += t.pnl; }
    });

    return {
      tp, wr, pf, dwr, ar, aw, al, w, l, gd, rd, bd, adixScore: Math.min(100, Math.max(0, adixScore)),
      labels, cumData, dailyData, ddData, accData, accLabels, timePts, sorted,
      maxDD, maxDDPct, recoveryFactor,
      curStreak, curStreakType, maxWinStreak, maxLossStreak,
      bestTrade, worstTrade,
      symbols, longCount, shortCount, longPnl, shortPnl,
      radarData: [
        wr,
        Math.min(pf / 3, 1) * 100,
        Math.min(ar / 3, 1) * 100,
        Math.min(recoveryFactor / 3, 1) * 100,
        Math.max(0, 100 - maxDDPct),
        dwr,
      ],
    };
  }, [fTrades, settings.startBalance]);

  // ---- Calendar data ----
  const calData = useMemo(() => {
    const y = calendarDate.getFullYear(), m = calendarDate.getMonth();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const fd = new Date(y, m, 1).getDay(), dm = new Date(y, m + 1, 0).getDate();
    const td = new Date().toISOString().split('T')[0];

    let calBase = trades;
    if (activeSource === 'manual') calBase = calBase.filter(t => !t.source || t.source === 'manual');
    else if (activeSource !== 'all') calBase = calBase.filter(t => t.source === activeSource);

    const dMap = {};
    calBase.forEach(t => { if (!dMap[t.date]) dMap[t.date] = { pnl: 0, count: 0, wins: 0 }; dMap[t.date].pnl += t.pnl; dMap[t.date].count++; if (t.pnl > 0) dMap[t.date].wins++; });
    let mp = 0, tDays = 0;
    const ws = [{ pnl: 0, days: 0 }, { pnl: 0, days: 0 }, { pnl: 0, days: 0 }, { pnl: 0, days: 0 }];

    const days = [];
    for (let i = 0; i < fd; i++) days.push({ empty: true });
    for (let d = 1; d <= dm; d++) {
      const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = ds === td;
      const wn = Math.floor((d + fd - 1) / 7);
      const s = dMap[ds];
      if (s) { mp += s.pnl; tDays++; if (wn < 4) { ws[wn].pnl += s.pnl; ws[wn].days++; } }
      days.push({ day: d, ds, isToday, data: s || null });
    }

    return { title: `${months[m]} ${y}`, days, mp, tDays, ws };
  }, [calendarDate, trades, activeSource]);

  // ---- Heatmap data ----
  const heatmapData = useMemo(() => {
    const today = new Date();
    const weeks = [];
    const ws = new Date(today);
    ws.setDate(ws.getDate() - ws.getDay() - 7 * 7);
    for (let w = 0; w < 8; w++) {
      const wk = [];
      for (let d = 0; d < 7; d++) {
        const dt = new Date(ws);
        dt.setDate(dt.getDate() + w * 7 + d);
        wk.push(dt.toISOString().split('T')[0]);
      }
      weeks.push(wk);
    }
    const tc = {};
    fTrades.forEach(t => { tc[t.date] = (tc[t.date] || 0) + 1; });
    return { weeks, tc };
  }, [fTrades]);

  // ---- Trades table ----
  const tableRows = useMemo(() => {
    if (!fTrades.length) return [];
    return [...fTrades].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50);
  }, [fTrades]);

  // ---- Export ----
  const handleExport = useCallback(() => {
    if (!fTrades.length) return;
    const h = 'Date,Time,Symbol,Side,Size,Entry,Exit,Fees,PnL,Source';
    const rows = fTrades.map(t => `${t.date},${t.time || '12:00'},${t.symbol},${t.side},${t.size},${t.entry},${t.exit},${t.fees},${t.pnl.toFixed(4)},${t.source || 'manual'}`);
    const csv = [h, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `adixtrade_${activeSource}_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [fTrades, activeSource]);

  const srcColors = { hyperliquid: 'bg-hl/20 text-hl', lighter: 'bg-[#4fc3f7]/20 text-[#4fc3f7]', manual: 'bg-accent/20 text-accent', import: 'bg-yellow-500/20 text-yellow-400' };

  // Chart configs
  const cumChartData = useMemo(() => {
    if (!stats) return { labels: [], datasets: [{ data: [] }] };
    const lp = stats.cumData[stats.cumData.length - 1] || 0;
    return {
      labels: stats.labels,
      datasets: [{ data: stats.cumData, borderColor: lp < 0 ? '#ef4444' : '#22c55e', borderWidth: 2, fill: true, backgroundColor: lp < 0 ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)', tension: 0.4, pointRadius: 0 }],
    };
  }, [stats]);

  const dailyChartData = useMemo(() => {
    if (!stats) return { labels: [], datasets: [{ data: [] }] };
    return { labels: stats.labels, datasets: [{ data: stats.dailyData, backgroundColor: stats.dailyData.map(v => v < 0 ? '#ef4444' : '#22c55e'), borderRadius: 2 }] };
  }, [stats]);

  const accChartData = useMemo(() => {
    if (!stats) return { labels: [], datasets: [{ data: [] }] };
    return { labels: stats.accLabels, datasets: [{ data: stats.accData, borderColor: '#7c5cfc', borderWidth: 2, fill: false, tension: 0.1, pointRadius: 0 }] };
  }, [stats]);

  const ddChartData = useMemo(() => {
    if (!stats) return { labels: [], datasets: [{ data: [] }] };
    return { labels: stats.labels, datasets: [{ data: stats.ddData, borderColor: '#ef4444', borderWidth: 2, fill: true, backgroundColor: 'rgba(239,68,68,0.15)', tension: 0.4, pointRadius: 0 }] };
  }, [stats]);

  const timeChartData = useMemo(() => {
    if (!stats) return { datasets: [{ data: [] }] };
    return { datasets: [{ data: stats.timePts, pointBackgroundColor: stats.timePts.map(p => p.y < 0 ? '#ef4444' : '#22c55e'), pointRadius: 6 }] };
  }, [stats]);

  const radarChartData = useMemo(() => ({
    labels: ['Win %', 'Profit factor', 'Avg win/loss', 'Recovery factor', 'Drawdown resist.', 'Consistency'],
    datasets: [{ data: stats?.radarData || [0, 0, 0, 0, 0, 0], backgroundColor: 'rgba(124,92,252,0.2)', borderColor: '#7c5cfc', borderWidth: 2, pointBackgroundColor: '#7c5cfc', pointRadius: 3 }],
  }), [stats]);

  const sideChartData = useMemo(() => {
    if (!stats) return { labels: [], datasets: [{ data: [] }] };
    return {
      labels: ['Long', 'Short'],
      datasets: [{
        data: [stats.longCount, stats.shortCount],
        backgroundColor: ['#22c55e', '#ef4444'],
        borderWidth: 0,
        cutout: '70%',
      }],
    };
  }, [stats]);

  const sortedSymbols = useMemo(() => {
    if (!stats?.symbols) return [];
    return [...stats.symbols].sort((a, b) => {
      if (symbolSort === 'pnl') return b.pnl - a.pnl;
      if (symbolSort === 'trades') return b.count - a.count;
      return (b.wins / b.count) - (a.wins / a.count);
    });
  }, [stats, symbolSort]);

  const lineOpts = (yRight = false, fmt = true) => ({
    responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
    scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 5 } }, y: { position: yRight ? 'right' : 'left', grid: { color: '#1e1e2a' }, ticks: fmt ? { callback: v => formatMoney(v) } : {} } },
  });
  const barOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 5 } }, y: { grid: { color: '#1e1e2a' }, ticks: { callback: v => formatMoney(v) } } } };
  const scatterOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { type: 'linear', min: 0, max: 24, grid: { color: '#1e1e2a' }, ticks: { stepSize: 2, callback: v => v + ':00' } }, y: { grid: { color: '#1e1e2a' }, ticks: { callback: v => formatMoney(v) } } } };
  const radarOpts = { responsive: false, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { r: { beginAtZero: true, max: 100, ticks: { display: false, stepSize: 20 }, grid: { color: '#1e1e2a' }, angleLines: { color: '#1e1e2a' }, pointLabels: { color: '#6b7280', font: { size: 10 } } } } };

  const s = stats;
  const heatClasses = ['heat-0', 'heat-1', 'heat-2', 'heat-3', 'heat-4'];
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Empty state
  if (!trades.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md animate-fade-in-up">
          <div className="w-20 h-20 bg-dark-700 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <i className="fa-solid fa-chart-line text-3xl text-accent" />
          </div>
          <h2 className="text-2xl font-bold mb-3">Welcome to adixTRADE</h2>
          <p className="text-neutral mb-6 leading-relaxed">Start by adding your first trade or syncing your exchange account to see your performance dashboard come alive.</p>
          <div className="flex gap-3 justify-center">
            <span className="px-3 py-1.5 bg-dark-700 rounded-lg text-xs text-neutral"><kbd className="text-white">Ctrl+N</kbd> to add a trade</span>
            <span className="px-3 py-1.5 bg-dark-700 rounded-lg text-xs text-neutral"><kbd className="text-white">1</kbd> / <kbd className="text-white">2</kbd> switch views</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-dark-600 bg-dark-800/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          {s && <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${s.tp >= 0 ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>{formatMoneyFull(s.tp)}</span>}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={activeTimeFilter} onChange={e => setActiveTimeFilter(e.target.value)} className="bg-dark-700 text-neutral hover:text-white text-xs font-medium px-3 py-2 rounded-lg border border-dark-600 outline-none cursor-pointer transition-colors">
            <option value="all">All Time</option>
            <option value="calendar">Sync with Calendar</option>
            <option value="week">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="year">This Year</option>
          </select>
          <div className="flex bg-dark-700 rounded-lg p-1">
            {[{ key: 'all', label: 'All Sources' }, { key: 'hyperliquid', label: 'Hyperliquid', dot: 'bg-hl' }, { key: 'lighter', label: 'Lighter', dot: 'bg-[#4fc3f7]' }, { key: 'manual', label: 'Manual', dot: 'bg-accent' }].map(src => (
              <button key={src.key} onClick={() => setActiveSource(src.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-1.5 ${activeSource === src.key ? 'bg-dark-600 text-white' : 'text-neutral hover:text-white'}`}>
                {src.dot && <span className={`w-2 h-2 rounded-full ${src.dot} inline-block`} />}
                {src.label}
              </button>
            ))}
          </div>
          <button onClick={handleExport} className="px-3 py-1.5 text-xs font-medium text-neutral hover:text-white border border-dark-600 rounded-lg flex items-center gap-1.5">
            <i className="fa-solid fa-download" />Export
          </button>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <div className="card p-5 hover:border-dark-500 transition-colors animate-fade-in-up">
            <div className="flex items-center gap-2 mb-2"><i className="fa-solid fa-dollar-sign text-xs text-accent" /><span className="text-neutral text-xs">Net P&L</span></div>
            <span className={`text-3xl font-bold ${!s ? '' : s.tp < 0 ? 'text-loss' : s.tp > 0 ? 'text-profit' : ''}`}>{s ? formatMoneyFull(s.tp) : '$0.00'}</span>
            {s && <div className="flex items-center gap-2 mt-2 text-xs text-neutral">
              <span>{fTrades.length} trades</span>
              <span className="w-1 h-1 bg-dark-400 rounded-full" />
              <span>{s.curStreak} {s.curStreakType} streak</span>
            </div>}
          </div>
          <div className="card p-5 hover:border-dark-500 transition-colors animate-fade-in-up" style={{ animationDelay: '50ms' }}>
            <div className="flex items-center gap-2 mb-2"><i className="fa-solid fa-bullseye text-xs text-profit" /><span className="text-neutral text-xs">Trade win %</span></div>
            <div className="flex items-center gap-4">
              <span className="text-3xl font-bold">{s ? s.wr.toFixed(2) + '%' : '0.00%'}</span>
              <div className="gauge-container">
                <svg viewBox="0 0 120 70" className="w-full h-full">
                  <defs><linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style={{ stopColor: '#ef4444' }} /><stop offset="50%" style={{ stopColor: '#eab308' }} /><stop offset="100%" style={{ stopColor: '#22c55e' }} /></linearGradient></defs>
                  <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke="#1e1e2a" strokeWidth="8" strokeLinecap="round" />
                  <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke="url(#gaugeGradient)" strokeWidth="8" strokeLinecap="round" strokeDasharray="157" strokeDashoffset={157 - ((s?.wr || 0) / 100 * 157)} />
                </svg>
                <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[10px] text-neutral px-1">
                  <span className="text-profit">{s?.w || 0}</span><span className="text-neutral">0</span><span className="text-loss">{s?.l || 0}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="card p-5 hover:border-dark-500 transition-colors animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center gap-2 mb-2"><i className="fa-solid fa-scale-balanced text-xs text-yellow-400" /><span className="text-neutral text-xs">Profit factor</span></div>
            <div className="flex items-center gap-4">
              <span className="text-3xl font-bold">{s ? s.pf.toFixed(2) : '0.00'}</span>
              <div className="gauge-container">
                <svg viewBox="0 0 120 70" className="w-full h-full">
                  <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke="#1e1e2a" strokeWidth="8" strokeLinecap="round" />
                  <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke={s && s.pf >= 1.5 ? '#22c55e' : s && s.pf >= 1 ? '#eab308' : '#ef4444'} strokeWidth="8" strokeLinecap="round" strokeDasharray="157" strokeDashoffset={157 - (Math.min((s?.pf || 0) / 3, 1) * 157)} />
                </svg>
              </div>
            </div>
          </div>
          <div className="card p-5 hover:border-dark-500 transition-colors animate-fade-in-up" style={{ animationDelay: '150ms' }}>
            <div className="flex items-center gap-2 mb-2"><i className="fa-solid fa-calendar-check text-xs text-blue-400" /><span className="text-neutral text-xs">Day win %</span></div>
            <div className="flex items-center gap-4">
              <span className="text-3xl font-bold">{s ? s.dwr.toFixed(0) + '%' : '0%'}</span>
              <div className="gauge-container">
                <svg viewBox="0 0 120 70" className="w-full h-full">
                  <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke="#1e1e2a" strokeWidth="8" strokeLinecap="round" />
                  <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke="url(#gaugeGradient)" strokeWidth="8" strokeLinecap="round" strokeDasharray="157" strokeDashoffset={157 - ((s?.dwr || 0) / 100 * 157)} />
                </svg>
                <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[10px] text-neutral px-1">
                  <span className="text-profit">{s?.gd || 0}</span><span className="text-neutral">{s?.bd || 0}</span><span className="text-loss">{s?.rd || 0}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="card p-5 hover:border-dark-500 transition-colors animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center gap-2 mb-2"><i className="fa-solid fa-chart-bar text-xs text-orange-400" /><span className="text-neutral text-xs">Avg win/loss trade</span></div>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold">{s ? s.ar.toFixed(2) : '0.00'}</span>
              <div className="flex-1">
                <div className="flex gap-1 mb-2">
                  <div className="h-3 bg-profit rounded-sm" style={{ width: s ? `${(s.aw / (s.aw + s.al || 1)) * 100}%` : '50%' }} />
                  <div className="h-3 bg-loss rounded-sm" style={{ width: s ? `${(s.al / (s.aw + s.al || 1)) * 100}%` : '50%' }} />
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-profit">{formatMoney(s?.aw || 0)}</span>
                  <span className="text-loss">{formatMoney(-(s?.al || 0))}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick stats row */}
        {s && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4 hover:border-dark-500 transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-profit/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <i className="fa-solid fa-fire text-profit" />
                </div>
                <div>
                  <div className="text-xs text-neutral">Max win streak</div>
                  <div className="text-xl font-bold text-profit">{s.maxWinStreak}</div>
                </div>
              </div>
            </div>
            <div className="card p-4 hover:border-dark-500 transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-loss/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <i className="fa-solid fa-arrow-trend-down text-loss" />
                </div>
                <div>
                  <div className="text-xs text-neutral">Max loss streak</div>
                  <div className="text-xl font-bold text-loss">{s.maxLossStreak}</div>
                </div>
              </div>
            </div>
            <div className="card p-4 hover:border-dark-500 transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-profit/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <i className="fa-solid fa-trophy text-yellow-400" />
                </div>
                <div>
                  <div className="text-xs text-neutral">Best trade</div>
                  <div className="text-lg font-bold text-profit">{formatMoney(s.bestTrade.pnl)}</div>
                  <div className="text-[10px] text-neutral uppercase">{s.bestTrade.symbol}</div>
                </div>
              </div>
            </div>
            <div className="card p-4 hover:border-dark-500 transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-loss/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <i className="fa-solid fa-skull-crossbones text-loss" />
                </div>
                <div>
                  <div className="text-xs text-neutral">Worst trade</div>
                  <div className="text-lg font-bold text-loss">{formatMoney(s.worstTrade.pnl)}</div>
                  <div className="text-[10px] text-neutral uppercase">{s.worstTrade.symbol}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Row 2: Radar, Heatmap, Cumulative P&L */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4"><span className="font-medium">adixScore</span></div>
            <div className="flex justify-center mb-4">
              <Radar data={radarChartData} options={radarOpts} width={220} height={200} />
            </div>
            <div className="border-t border-dark-600 pt-4">
              <div className="flex items-center justify-between mb-2"><span className="text-sm text-neutral">Your adixScore</span></div>
              <div className="flex items-center gap-4">
                <span className="text-3xl font-bold">{s?.adixScore || 0}</span>
                <div className="flex-1">
                  <div className="h-2 bg-dark-600 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-loss via-yellow-500 to-profit rounded-full transition-all" style={{ width: `${s?.adixScore || 0}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-neutral mt-1"><span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span></div>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4"><span className="font-medium">Progress tracker</span></div>
            {/* Heatmap */}
            <div className="mb-6">
              <div className="flex gap-1">
                <div className="flex flex-col gap-1 text-[10px] text-neutral mr-1 mt-5">
                  {dayLabels.map(d => <div key={d} className="h-3 flex items-center">{d}</div>)}
                </div>
                <div className="flex-1">
                  <div className="flex gap-1">
                    {heatmapData.weeks.map((wk, wi) => (
                      <div key={wi} className="flex flex-col gap-1 flex-1">
                        {wk.map(d => {
                          const cnt = heatmapData.tc[d] || 0;
                          const hc = cnt >= 5 ? 4 : cnt >= 3 ? 3 : cnt >= 2 ? 2 : cnt >= 1 ? 1 : 0;
                          return <div key={d} className={`h-3 rounded-sm ${heatClasses[hc]}`} title={`${d}: ${cnt} trades`} />;
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end items-center gap-2 text-[10px] text-neutral mb-6">
              <span>Less</span>
              <div className="flex gap-0.5">{heatClasses.map(c => <div key={c} className={`w-3 h-3 rounded-sm ${c}`} />)}</div>
              <span>More</span>
            </div>
            <div className="border-t border-dark-600 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-neutral">Max drawdown</span><br />
                  <span className="text-2xl font-bold text-loss">{s ? formatMoney(s.maxDD) : '$0'}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm text-neutral">Recovery factor</span><br />
                  <span className="text-2xl font-bold">{s ? s.recoveryFactor.toFixed(2) : '0.00'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-4"><span className="font-medium">Daily net cumulative P&L</span></div>
            <div className="flex-1 relative min-h-[200px]"><Line data={cumChartData} options={lineOpts(true)} /></div>
          </div>
        </div>

        {/* Row 3: Daily P&L, Recent trades, Account balance */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-4"><span className="font-medium">Net daily P&L</span></div>
            <div className="flex-1 relative min-h-[200px]"><Bar data={dailyChartData} options={barOpts} /></div>
          </div>

          <div className="card flex flex-col overflow-hidden">
            <div className="flex border-b border-dark-600">
              <button className="tab-active px-6 py-3 text-sm font-medium">Recent trades</button>
              <button className="px-6 py-3 text-sm font-medium text-neutral hover:text-white">Open positions</button>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[280px]">
              <table className="w-full text-sm">
                <thead className="bg-dark-700 text-neutral sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Close Date</th>
                    <th className="px-4 py-3 text-center font-medium">Symbol</th>
                    <th className="px-4 py-3 text-center font-medium">Source</th>
                    <th className="px-4 py-3 text-right font-medium">Net P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-600">
                  {tableRows.length === 0 ? (
                    <tr><td colSpan="4" className="px-4 py-12 text-center text-neutral">
                      <div className="flex flex-col items-center gap-2">
                        <i className="fa-solid fa-inbox text-2xl text-dark-500 mb-1" />
                        <span>No trades match current filters</span>
                      </div>
                    </td></tr>
                  ) : tableRows.map((t, i) => {
                    const [y, m, d] = t.date.split('-');
                    const src = t.source || 'manual';
                    const sc = srcColors[src] || srcColors.manual;
                    return (
                      <tr key={i} className="hover:bg-dark-700">
                        <td className="px-4 py-3 text-neutral">{m}/{d}/{y}</td>
                        <td className="px-4 py-3 text-center font-medium uppercase">{t.symbol}</td>
                        <td className="px-4 py-3 text-center"><span className={`text-[10px] px-1.5 py-0.5 rounded ${sc}`}>{src}</span></td>
                        <td className={`px-4 py-3 text-right font-medium ${t.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{formatMoneyFull(t.pnl)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-4"><span className="font-medium">Account balance</span></div>
            <div className="flex-1 relative min-h-[180px]"><Line data={accChartData} options={lineOpts(true)} /></div>
          </div>
        </div>

        {/* Row 4: Calendar + Drawdown/Time */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setCalendarDate(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; })} className="w-8 h-8 flex items-center justify-center text-neutral hover:text-white"><i className="fa-solid fa-chevron-left" /></button>
                <span className="font-semibold text-lg min-w-[150px] text-center">{calData.title}</span>
                <button onClick={() => setCalendarDate(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; })} className="w-8 h-8 flex items-center justify-center text-neutral hover:text-white"><i className="fa-solid fa-chevron-right" /></button>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-neutral">Monthly stats:</span>
                <span className={`px-2 py-1 rounded text-sm font-medium ${calData.mp < 0 ? 'bg-loss text-white' : calData.mp > 0 ? 'bg-profit text-white' : 'bg-dark-600 text-white'}`}>{formatMoney(calData.mp)}</span>
                <span className="px-2 py-1 bg-dark-600 rounded text-sm font-medium">{calData.tDays} days</span>
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex-1">
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="text-center text-neutral text-xs py-2">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {calData.days.map((cell, i) => {
                    if (cell.empty) return <div key={i} className="cal-empty rounded-lg p-2 min-h-[80px]" />;
                    const d = cell.data;
                    if (d) {
                      const bg = d.pnl > 0 ? 'cal-profit' : d.pnl < 0 ? 'cal-loss' : 'cal-neutral';
                      const wp = ((d.wins / d.count) * 100).toFixed(1);
                      return (
                        <div key={i} className={`${bg} rounded-lg p-2 min-h-[80px] flex flex-col`}>
                          <div className="flex justify-between items-start mb-1">
                            <i className="fa-regular fa-calendar text-[10px] text-neutral" />
                            <span className={`text-xs text-neutral ${cell.isToday ? 'bg-accent text-white px-1.5 py-0.5 rounded-full' : ''}`}>{cell.day}</span>
                          </div>
                          <div className="flex-1 flex flex-col justify-center items-center">
                            <div className={`font-bold text-sm ${d.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{formatMoney(d.pnl)}</div>
                            <div className="text-[10px] text-neutral">{d.count} trade{d.count > 1 ? 's' : ''}</div>
                            <div className={`text-[10px] ${d.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{wp}%</div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={i} className="cal-empty rounded-lg p-2 min-h-[80px]">
                        <div className="flex justify-between items-start">
                          <i className="fa-regular fa-calendar text-[10px] text-neutral" />
                          <span className={`text-xs text-neutral ${cell.isToday ? 'bg-accent text-white px-1.5 py-0.5 rounded-full' : ''}`}>{cell.day}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="w-48 space-y-3">
                {calData.ws.map((w, i) => (
                  <div key={i} className="bg-dark-700 rounded-lg p-3">
                    <div className="text-xs text-neutral mb-1">Week {i + 1}</div>
                    <div className={`text-xl font-bold ${w.pnl < 0 ? 'text-loss' : w.pnl > 0 ? 'text-profit' : ''}`}>{formatMoney(w.pnl)}</div>
                    <div className={`text-xs ${w.days > 0 ? 'bg-dark-600 text-white' : 'text-neutral'} inline-block px-1.5 py-0.5 rounded mt-1`}>{w.days} days</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4"><span className="font-medium">Drawdown</span></div>
              <div className="h-[140px] relative"><Line data={ddChartData} options={{ ...lineOpts(), scales: { ...lineOpts().scales, y: { max: 0, grid: { color: '#1e1e2a' }, ticks: { callback: v => formatMoney(v) } } } }} /></div>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4"><span className="font-medium">Trade time performance</span></div>
              <div className="h-[140px] relative"><Scatter data={timeChartData} options={scatterOpts} /></div>
            </div>
          </div>
        </div>

        {/* Row 5: Symbol Performance + Side Distribution */}
        {s && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 card p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="font-medium">Symbol performance</span>
                <div className="flex bg-dark-700 rounded-lg p-0.5">
                  {[{ key: 'pnl', label: 'P&L' }, { key: 'trades', label: 'Trades' }, { key: 'winrate', label: 'Win %' }].map(opt => (
                    <button key={opt.key} onClick={() => setSymbolSort(opt.key)}
                      className={`px-2.5 py-1 text-xs font-medium rounded ${symbolSort === opt.key ? 'bg-dark-600 text-white' : 'text-neutral hover:text-white'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {sortedSymbols.map((sym, i) => {
                  const wr = sym.count > 0 ? (sym.wins / sym.count * 100) : 0;
                  const maxPnl = Math.max(...sortedSymbols.map(s => Math.abs(s.pnl)), 1);
                  const barWidth = Math.abs(sym.pnl) / maxPnl * 100;
                  return (
                    <div key={sym.symbol} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-dark-700 transition-colors group">
                      <span className="text-sm font-bold w-6 text-neutral">{i + 1}</span>
                      <span className="text-sm font-semibold uppercase w-24">{sym.symbol}</span>
                      <div className="flex-1 relative h-6">
                        <div className={`absolute top-0 h-full rounded ${sym.pnl >= 0 ? 'bg-profit/20' : 'bg-loss/20'}`}
                          style={{ width: `${barWidth}%`, transition: 'width 0.5s ease' }} />
                        <div className="absolute inset-0 flex items-center px-2">
                          <span className={`text-xs font-medium ${sym.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{formatMoney(sym.pnl)}</span>
                        </div>
                      </div>
                      <span className="text-xs text-neutral w-16 text-right">{sym.count} trade{sym.count !== 1 ? 's' : ''}</span>
                      <span className={`text-xs font-medium w-14 text-right ${wr >= 50 ? 'text-profit' : 'text-loss'}`}>{wr.toFixed(0)}% W</span>
                    </div>
                  );
                })}
                {sortedSymbols.length === 0 && <div className="text-center text-neutral py-8 text-sm">No symbol data</div>}
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4"><span className="font-medium">Side distribution</span></div>
              <div className="flex justify-center mb-4">
                <div className="relative w-[160px] h-[160px]">
                  <Doughnut data={sideChartData} options={{ responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, cutout: '70%' }} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold">{fTrades.length}</span>
                    <span className="text-xs text-neutral">Total</span>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-dark-700 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-profit" />
                    <span className="text-sm">Long</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold">{s.longCount}</span>
                    <span className={`text-xs ml-2 ${s.longPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{formatMoney(s.longPnl)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-dark-700 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-loss" />
                    <span className="text-sm">Short</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold">{s.shortCount}</span>
                    <span className={`text-xs ml-2 ${s.shortPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{formatMoney(s.shortPnl)}</span>
                  </div>
                </div>
              </div>
              <div className="border-t border-dark-600 mt-4 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-neutral">Long bias</span>
                  <span className="text-xs font-medium">{((s.longCount / (s.longCount + s.shortCount || 1)) * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-dark-600 rounded-full overflow-hidden">
                  <div className="h-full bg-profit rounded-full transition-all" style={{ width: `${(s.longCount / (s.longCount + s.shortCount || 1)) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
