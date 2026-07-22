function reportingCurrencyPrefix() {
  if (typeof localStorage === 'undefined') return '$';
  try {
    const currency = JSON.parse(localStorage.getItem('tz_settings') || '{}').baseCurrency || 'USD';
    return { USD: '$', USDC: 'USDC ', EUR: '€', GBP: '£', INR: '₹' }[currency] || `${currency} `;
  } catch {
    return '$';
  }
}

export const formatMoney = (a) => {
  const prefix = reportingCurrencyPrefix();
  const abs = Math.abs(a);
  if (abs >= 1000) return (a < 0 ? '-' : '') + prefix + (abs / 1000).toFixed(1) + 'K';
  return (a < 0 ? '-' : '') + prefix + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatMoneyFull = (a) => {
  const prefix = reportingCurrencyPrefix();
  const abs = Math.abs(a).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return a < 0 ? `-${prefix}${abs}` : `${prefix}${abs}`;
};

export function createTradeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `trade_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeSide(value) {
  const side = String(value || '').trim().toLowerCase();
  if (side === 'b' || side === 'buy' || side.includes('long')) return 'Long';
  if (side === 's' || side === 'sell' || side.includes('short')) return 'Short';
  return null;
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeTrade(raw, defaults = {}) {
  if (!raw || typeof raw !== 'object') return null;

  const symbol = String(raw.symbol || raw.coin || raw.asset || '').trim().toUpperCase();
  const date = String(raw.date || '').trim();
  const time = String(raw.time || '12:00').trim().slice(0, 5);
  const side = normalizeSide(raw.side) || 'Long';
  const size = finiteNumber(raw.size);
  const entry = finiteNumber(raw.entry);
  const exit = finiteNumber(raw.exit);
  const fees = finiteNumber(raw.fees);
  let pnl = Number(raw.pnl);

  if (!Number.isFinite(pnl) && size > 0 && entry > 0 && exit > 0) {
    pnl = side === 'Long' ? (exit - entry) * size - fees : (entry - exit) * size - fees;
  }

  if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(pnl)) return null;

  return {
    ...raw,
    id: String(raw.id || raw.tradeId || raw.hash || createTradeId()),
    symbol,
    side,
    date,
    time: /^\d{2}:\d{2}$/.test(time) ? time : '12:00',
    size,
    entry,
    exit,
    fees,
    pnl,
    source: String(raw.source || defaults.source || 'manual').trim().toLowerCase(),
    accountId: String(raw.accountId || defaults.accountId || '').trim(),
    strategy: String(raw.strategy || '').trim(),
    setup: String(raw.setup || '').trim(),
    mistake: String(raw.mistake || '').trim(),
    notes: String(raw.notes || '').trim(),
    tags: Array.isArray(raw.tags)
      ? [...new Set(raw.tags.map(tag => String(tag).trim().toLowerCase()).filter(Boolean))]
      : String(raw.tags || '').split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean),
    reviewed: Boolean(raw.reviewed),
    journalNoteId: String(raw.journalNoteId || '').trim(),
  };
}

export function dedupeKey(t) {
  const normalized = normalizeTrade(t);
  if (!normalized) return `invalid|${JSON.stringify(t)}`;
  const numberKey = value => Number(value || 0).toFixed(8);
  return [
    normalized.source,
    normalized.date,
    normalized.time,
    normalized.symbol,
    normalized.side,
    numberKey(normalized.size),
    numberKey(normalized.entry),
    numberKey(normalized.exit),
    numberKey(normalized.fees),
    numberKey(normalized.pnl),
  ].join('|');
}
