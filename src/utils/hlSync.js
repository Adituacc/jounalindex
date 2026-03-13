export async function fetchHL(addr, st, et, perpOnly, onProgress) {
  const all = [];
  let pg = 0, cs = st;
  const totalRange = et - st;

  while (true) {
    pg++;
    const progress = Math.min(10 + Math.round(((cs - st) / totalRange) * 70), 80);
    const startD = new Date(cs).toLocaleDateString();
    onProgress?.(`Page ${pg} — from ${startD} (${all.length} fills)...`, progress);

    const r = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'userFillsByTime', user: addr, startTime: cs, endTime: et, aggregateByTime: false }),
    });
    if (!r.ok) throw new Error(`API error: ${r.status}`);
    const f = await r.json();
    if (!Array.isArray(f) || !f.length) break;
    const fi = perpOnly ? f.filter(x => !x.coin.startsWith('@')) : f;
    all.push(...fi);
    if (f.length < 2000) break;
    cs = f[f.length - 1].time + 1;

    // Small delay to avoid rate limiting on very long syncs
    if (pg % 5 === 0) await new Promise(r => setTimeout(r, 200));
  }
  return all;
}

export function processHL(fills) {
  const trades = [];
  for (const f of fills) {
    const cp = parseFloat(f.closedPnl || '0');
    if (cp === 0 && !f.dir?.includes('Close')) continue;
    if (f.dir?.includes('Open')) continue;
    const fee = parseFloat(f.fee || '0');
    const dt = new Date(f.time);
    const ds = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    const ts = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
    const cn = f.coin.replace(':', '/');
    const ib = f.side === 'B';
    trades.push({ symbol: cn, side: ib ? 'Short' : 'Long', date: ds, time: ts, size: parseFloat(f.sz), entry: 0, exit: parseFloat(f.px), fees: fee, pnl: cp - fee, source: 'hyperliquid' });
  }
  return trades;
}
