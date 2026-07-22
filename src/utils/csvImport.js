import { normalizeTrade, normalizeSide } from './formatters.js';

export function parseCSVRows(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const input = String(text || '').replace(/^\uFEFF/, '');

  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') {
        value += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') index++;
      row.push(value.trim());
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some(cell => cell !== '')) rows.push(row);
  return rows;
}

function rowsToObjects(text, normalizeHeader = value => value.toLowerCase().trim()) {
  const rows = parseCSVRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function normalizeDate(rawDate) {
  const input = String(rawDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const slashMatch = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!slashMatch) return '';
  const [, month, day, rawYear] = slashMatch;
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function parseCSVTrades(text, fileName) {
  if (String(fileName || '').toLowerCase().endsWith('.json')) {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : (data.trades || []);
    if (!Array.isArray(arr)) return [];
    return arr.map(trade => normalizeTrade(trade, { source: 'import' })).filter(Boolean);
  }

  return rowsToObjects(text).map(row => {
    const rawTrade = {
      symbol: (row.symbol || row.coin || row.asset || row.market || row.instrument || '').toUpperCase().replace(/-USD[C]?$/, ''),
      side: normalizeSide(row.side || row['buy/sell'] || row.direction || row.type) || 'Long',
      date: normalizeDate(row.date || row['close date'] || row.closedate || row.datetime),
      time: row.time || row['close time'] || '12:00',
      size: parseFloat(row.size || row.quantity || row.amount || row.qty || '0'),
      entry: parseFloat(row.entry || row['entry price'] || row.entryprice || '0'),
      exit: parseFloat(row.exit || row['exit price'] || row.exitprice || row.price || '0'),
      fees: parseFloat(row.fees || row.fee || row.commission || '0'),
      pnl: parseFloat(row.pnl || row['net p&l'] || row.profit || row['realized pnl'] || row.realizedpnl || '0'),
      source: (row.source || 'import').toLowerCase(),
    };

    if ((!Number.isFinite(rawTrade.pnl) || rawTrade.pnl === 0) && rawTrade.entry > 0 && rawTrade.exit > 0 && rawTrade.size > 0) {
      rawTrade.pnl = rawTrade.side === 'Long'
        ? (rawTrade.exit - rawTrade.entry) * rawTrade.size - rawTrade.fees
        : (rawTrade.entry - rawTrade.exit) * rawTrade.size - rawTrade.fees;
    }
    return normalizeTrade(rawTrade, { source: 'import' });
  }).filter(Boolean);
}

export function parseLighterCSV(text) {
  const parseNum = (val) => { if (!val) return 0; return parseFloat(String(val).replace(/[^0-9.-]/g, '')) || 0; };
  const imported = [];

  const rows = rowsToObjects(text, header => header.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const row of rows) {
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
      _groupId: row.parentorderid || row.twaporderid || row.parentorderindex || '',
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
    trade._timestamp = dt.getTime();

    const rawSide = String(trade.side || '').trim().toLowerCase();
    trade.side = rawSide === 'ask' ? 'Long' : rawSide === 'bid' ? 'Short' : (normalizeSide(rawSide) || 'Long');

    const normalized = normalizeTrade(trade, { source: 'lighter' });
    if (normalized) imported.push(normalized);
  }

  // Prefer Lighter's TWAP parent ID. Older CSV formats omit it, so fall back
  // to execution sessions separated by a 10-minute gap.
  const SESSION_GAP_MS = 10 * 60 * 1000;
  const aggregated = new Map();
  const sessionState = new Map();

  for (const t of imported.sort((left, right) => left._timestamp - right._timestamp)) {
    const streamKey = `${t.symbol}_${t.side}`;
    let key;
    if (t._groupId) {
      key = `${streamKey}_parent_${t._groupId}`;
    } else {
      const state = sessionState.get(streamKey);
      const session = !state || t._timestamp - state.lastTimestamp > SESSION_GAP_MS
        ? (state?.session || 0) + 1
        : state.session;
      sessionState.set(streamKey, { session, lastTimestamp: t._timestamp });
      key = `${streamKey}_session_${session}`;
    }

    if (!aggregated.has(key)) {
      aggregated.set(key, { ...t, size: 0, fees: 0, pnl: 0, fillCount: 0, grouping: t._groupId ? 'twap-order' : 'execution-session', _entryVolume: 0, _exitVolume: 0 });
    }
    const group = aggregated.get(key);
    group.size += t.size;
    group.fees += t.fees;
    group.pnl += t.pnl;
    group.fillCount += 1;
    group._entryVolume += t.entry * t.size;
    group._exitVolume += t.exit * t.size;
    if (t._timestamp > group._timestamp) {
      group.date = t.date;
      group.time = t.time;
      group._timestamp = t._timestamp;
    }
  }

  return Array.from(aggregated.values()).map(g => {
    if (g.size > 0) {
      g.entry = g._entryVolume / g.size;
      g.exit = g._exitVolume / g.size;
    }
    delete g._entryVolume;
    delete g._exitVolume;
    delete g._timestamp;
    delete g._groupId;
    return g;
  });
}
