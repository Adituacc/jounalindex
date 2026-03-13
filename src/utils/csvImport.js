export function parseCSVTrades(text, fileName) {
  const imported = [];

  if (fileName.endsWith('.json')) {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : (data.trades || []);
    return arr.filter(t => t.date && (t.pnl !== undefined || t.symbol));
  }

  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });

    const trade = {
      symbol: (row.symbol || row.coin || row.asset || row.market || row.instrument || '').toUpperCase().replace(/-USD[C]?$/, ''),
      side: (row.side || row['buy/sell'] || row.direction || row.type || 'Long'),
      date: row.date || row['close date'] || row.closedate || row.datetime || '',
      time: row.time || row['close time'] || '12:00',
      size: parseFloat(row.size || row.quantity || row.amount || row.qty || '0'),
      entry: parseFloat(row.entry || row['entry price'] || row.entryprice || '0'),
      exit: parseFloat(row.exit || row['exit price'] || row.exitprice || row.price || '0'),
      fees: parseFloat(row.fees || row.fee || row.commission || '0'),
      pnl: parseFloat(row.pnl || row['net p&l'] || row.profit || row['realized pnl'] || row.realizedpnl || '0'),
      source: (row.source || 'import').toLowerCase(),
    };

    if (trade.date.includes('/')) {
      const parts = trade.date.split('/');
      if (parts[2] && parts[2].length === 2) parts[2] = '20' + parts[2];
      if (parts[0].length <= 2) trade.date = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }

    const sl = trade.side.toLowerCase();
    trade.side = (sl.includes('buy') || sl.includes('long')) ? 'Long' : (sl.includes('sell') || sl.includes('short')) ? 'Short' : trade.side;

    if (trade.pnl === 0 && trade.entry > 0 && trade.exit > 0 && trade.size > 0) {
      trade.pnl = trade.side === 'Long' ? (trade.exit - trade.entry) * trade.size - trade.fees : (trade.entry - trade.exit) * trade.size - trade.fees;
    }

    if (trade.date && trade.symbol) imported.push(trade);
  }
  return imported;
}

export function parseLighterCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].toLowerCase().split(',').map(h => h.replace(/[^a-z0-9]/g, ''));
  const parseNum = (val) => { if (!val) return 0; return parseFloat(String(val).replace(/[^0-9.-]/g, '')) || 0; };
  const imported = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
    if (!row.symbol && !row.market && !row.amount && !row.size && !row.baseamount) continue;

    const trade = {
      symbol: (row.symbol || row.market || row.coin || row.asset || '').toUpperCase().replace(/-USD[C]?$/, ''),
      side: (row.side || row.direction || row.type || 'Long'),
      date: '', time: '12:00',
      size: parseNum(row.size || row.amount || row.quantity || row.baseamount || row.filledbaseamount),
      entry: parseNum(row.entry || row.price || row.avgprice || row.fillprice || row.executionprice),
      exit: parseNum(row.exit || row.price || row.closeprice || row.fillprice || row.executionprice),
      fees: parseNum(row.fees || row.fee || row.commission),
      pnl: parseNum(row.pnl || row.realizedpnl || row.profit || row.netpnl || row.closedpnl),
      source: 'lighter',
    };

    let rawTime = row.timestamp || row.time || row.date || row.createdat || '';
    let dt = new Date(rawTime);
    if (!isNaN(rawTime) && String(rawTime).trim() !== '') {
      let ts = parseFloat(rawTime);
      if (ts > 1e16) ts = Math.floor(ts / 1000000);
      else if (ts > 1e14) ts = Math.floor(ts / 1000);
      else if (ts < 1e11) ts = Math.floor(ts * 1000);
      dt = new Date(ts);
    }
    if (isNaN(dt.getTime())) continue;

    trade.date = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    trade.time = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');

    const sl = trade.side.toLowerCase();
    trade.side = (sl.includes('buy') || sl.includes('long') || sl === 'b' || sl === 'ask') ? 'Long' : (sl.includes('sell') || sl.includes('short') || sl === 's' || sl === 'bid') ? 'Short' : trade.side;

    if (trade.date && trade.symbol) imported.push(trade);
  }

  // Aggregate by day/symbol/side
  const aggregated = {};
  for (const t of imported) {
    const key = `${t.date}_${t.symbol}_${t.side}`;
    if (!aggregated[key]) {
      aggregated[key] = { ...t, size: 0, fees: 0, pnl: 0, _totalVolume: 0 };
    }
    const g = aggregated[key];
    g.size += t.size; g.fees += t.fees; g.pnl += t.pnl; g._totalVolume += (t.exit * t.size);
  }
  return Object.values(aggregated).map(g => {
    if (g.size > 0) g.exit = g._totalVolume / g.size;
    delete g._totalVolume;
    return g;
  });
}
