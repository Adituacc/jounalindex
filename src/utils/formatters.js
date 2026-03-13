export const formatMoney = (a) => {
  const abs = Math.abs(a);
  if (abs >= 1000) return (a < 0 ? '-' : '') + '$' + (abs / 1000).toFixed(1) + 'K';
  return (a < 0 ? '-' : '') + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatMoneyFull = (a) => {
  const abs = Math.abs(a).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return a < 0 ? `-$${abs}` : `$${abs}`;
};

export function dedupeKey(t) {
  return `${t.date}|${t.time}|${t.symbol}|${(t.pnl || 0).toFixed(4)}`;
}
