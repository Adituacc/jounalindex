export function summarizeTradeOutcomes(trades) {
  let totalPnl = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  let losses = 0;
  let breakeven = 0;

  for (const trade of trades) {
    totalPnl += trade.pnl;
    if (trade.pnl > 0) {
      grossProfit += trade.pnl;
      wins++;
    } else if (trade.pnl < 0) {
      grossLoss += Math.abs(trade.pnl);
      losses++;
    } else {
      breakeven++;
    }
  }

  const decidedTrades = wins + losses;
  return {
    totalPnl,
    grossProfit,
    grossLoss,
    wins,
    losses,
    breakeven,
    winRate: decidedTrades === 0 ? 0 : (wins / decidedTrades) * 100,
    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? Number.POSITIVE_INFINITY : 0) : grossProfit / grossLoss,
  };
}

export function createCalendarWeekBuckets(year, month, dayMap) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) }, () => ({ pnl: 0, days: 0 }));

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const summary = dayMap[date];
    if (!summary) continue;
    const weekIndex = Math.floor((day + firstWeekday - 1) / 7);
    weeks[weekIndex].pnl += summary.pnl;
    weeks[weekIndex].days++;
  }

  return weeks;
}
