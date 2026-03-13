// Lighter (zkLighter) Sync Utility
// Requires API token from Lighter app settings for trade history access.
// API docs: The Lighter API uses `auth` query param for authentication.

const LT_BASE = 'https://mainnet.zklighter.elliot.ai';
const DEV_PROXY = '/lighter-api'; // Vite dev proxy to avoid CORS

async function ltFetch(path, timeoutMs = 30000) {
  const errors = [];

  // In dev mode, try the Vite proxy first (no CORS issues)
  const isDev = typeof window !== 'undefined' && window.location?.hostname === 'localhost';
  if (isDev) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const r = await fetch(DEV_PROXY + path, { signal: controller.signal });
        clearTimeout(timer);
        if (r.ok) return await r.json();
        if (r.status === 429 && attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 2000));
          continue;
        }
        errors.push(`dev-proxy: HTTP ${r.status}`);
        break;
      } catch (e) {
        errors.push(`dev-proxy: ${e.message}`);
        break;
      }
    }
  }

  // Direct call — Lighter API sends Access-Control-Allow-Origin: *
  const directUrl = LT_BASE + path;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const r = await fetch(directUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (r.ok) return await r.json();
      if (r.status === 429 && attempt < 3) {
        const wait = (attempt + 1) * 2000;
        await new Promise(resolve => setTimeout(resolve, wait));
        continue;
      }
      const body = await r.text().catch(() => '');
      errors.push(`HTTP ${r.status}: ${body.slice(0, 200)}`);
      break;
    } catch (e) {
      errors.push(e.name === 'AbortError' ? `timeout after ${timeoutMs / 1000}s` : e.message);
      break;
    }
  }

  // CORS proxy fallback
  try {
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(directUrl)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const r = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (r.ok) return await r.json();
    errors.push(`proxy: HTTP ${r.status}`);
  } catch (e) {
    errors.push(`proxy: ${e.message}`);
  }

  throw new Error(errors.join(' | '));
}

// Look up account index from wallet address (public, no auth needed)
export async function ltLookupAccount(addr) {
  const d = await ltFetch(`/api/v1/account?by=l1_address&value=${encodeURIComponent(addr)}`);
  if (d?.accounts?.length > 0) return d.accounts[0].account_index ?? d.accounts[0].index;
  throw new Error('No Lighter account found for this address. Have you deposited on Lighter?');
}

// Fetch market symbol map (public, no auth needed)
export async function ltFetchOrderbooks() {
  try {
    const d = await ltFetch('/api/v1/orderBooks');
    const map = {};
    const books = d.order_books || [];
    for (const ob of books) {
      map[ob.market_id] = ob.symbol || `MKT-${ob.market_id}`;
    }
    return map;
  } catch { return {}; }
}

// Convert Lighter microsecond timestamps to milliseconds
function toMs(rawTs) {
  if (!rawTs && rawTs !== 0) return 0;
  const n = Number(rawTs);
  if (isNaN(n)) return 0;
  if (n > 1e15) return Math.floor(n / 1000000); // nanoseconds (18+ digits)
  if (n > 1e13) return Math.floor(n / 1000);     // microseconds (14-15 digits, Lighter transaction_time)
  if (n < 1e11) return Math.floor(n * 1000);     // seconds (10 digits)
  return n; // milliseconds (13 digits, Lighter timestamp)
}

/**
 * Fetch trades via /api/v1/trades with cursor-based pagination.
 * API returns newest-first. We stop once we've passed the start date
 * (with a lookback buffer to capture position opens before the window).
 */
async function fetchTradesAuth(accIdx, authToken, startMs, onProgress) {
  const PAGE_SIZE = 100;
  // Lookback 14 days before start date to capture positions opened just before
  const stopAt = startMs ? startMs - 14 * 86400000 : 0;
  let allTrades = [];
  let cursor = null;
  let page = 0;

  while (true) {
    page++;
    let url = `/api/v1/trades?account_index=${accIdx}&sort_by=timestamp&sort_dir=desc&limit=${PAGE_SIZE}&auth=${encodeURIComponent(authToken)}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

    const pct = 15 + Math.min(Math.round(page * 2), 55);
    onProgress?.(`Fetching fills (page ${page}, ${allTrades.length.toLocaleString()} so far)...`, pct);

    const d = await ltFetch(url);
    const trades = d.trades || (Array.isArray(d) ? d : []);

    if (!Array.isArray(trades) || trades.length === 0) break;
    allTrades.push(...trades);

    // Check if oldest trade on this page is before our lookback window
    if (stopAt > 0) {
      const oldestTs = toMs(trades[trades.length - 1].timestamp || 0);
      if (oldestTs > 0 && oldestTs < stopAt) break;
    }

    cursor = d.next_cursor;
    if (!cursor || trades.length < PAGE_SIZE) break;
    if (page >= 500) break;

    // Adaptive delay: slower every 20 pages to avoid 429 rate limits
    const delay = page < 20 ? 150 : page < 50 ? 250 : 400;
    await new Promise(r => setTimeout(r, delay));
  }

  return allTrades;
}

/**
 * Process raw trades using FIFO position tracking to compute realized P&L.
 * 
 * TWAP orders generate many small fills — simple grouping produces $0 PnL
 * because the Lighter API only provides PnL on ~1% of fills. Instead, we:
 * 1. Sort all fills chronologically (oldest first)
 * 2. Track running position per symbol using a FIFO queue
 * 3. When a fill reduces position (opposite direction), compute realized P&L
 * 4. Aggregate realized trades by day + symbol + side
 * 5. Filter to the user's selected date range
 */
export function processTrades(rawTrades, accIdx, marketMap, startMs, endMs) {
  if (!Array.isArray(rawTrades) || rawTrades.length === 0) return [];
  const accStr = String(accIdx);

  // Sort chronologically (oldest first) for correct FIFO matching
  const sorted = rawTrades
    .map(t => ({ ...t, _ms: toMs(t.timestamp || t.transaction_time || 0) }))
    .filter(t => t._ms > 0)
    .sort((a, b) => a._ms - b._ms);

  // FIFO position tracking per symbol
  const positions = {}; // symbol -> { side, queue: [{price, size}], totalSize }
  const realized = [];

  for (const fill of sorted) {
    const isAsk = String(fill.ask_account_id) === accStr;
    const isBid = String(fill.bid_account_id) === accStr;
    if (!isAsk && !isBid) continue;

    const fillSide = isAsk ? 'sell' : 'buy';
    const price = parseFloat(fill.price || '0');
    const size = parseFloat(fill.size || '0');
    if (size === 0 || price === 0) continue;

    const sym = marketMap[fill.market_id] || `MKT-${fill.market_id || 0}`;
    const cleanSym = sym.replace(/-USD[C]?$/i, '').replace(/_USD[C]?$/i, '');
    const ts = fill._ms;

    if (!positions[cleanSym]) {
      positions[cleanSym] = { side: null, queue: [], totalSize: 0 };
    }
    const pos = positions[cleanSym];

    if (pos.totalSize === 0 || pos.side === fillSide) {
      // Same direction or new position — add to FIFO queue
      pos.side = fillSide;
      pos.queue.push({ price, size });
      pos.totalSize += size;
    } else {
      // Opposite direction — realize P&L by matching against FIFO queue
      let remaining = size;
      let entryVol = 0;
      let entrySize = 0;
      let realizedPnl = 0;

      while (remaining > 0 && pos.queue.length > 0) {
        const oldest = pos.queue[0];
        const matchSize = Math.min(remaining, oldest.size);

        if (pos.side === 'buy') {
          // Closing a long: sold at price, bought at oldest.price
          realizedPnl += (price - oldest.price) * matchSize;
        } else {
          // Closing a short: bought at price, sold at oldest.price
          realizedPnl += (oldest.price - price) * matchSize;
        }

        entryVol += oldest.price * matchSize;
        entrySize += matchSize;
        oldest.size -= matchSize;
        remaining -= matchSize;
        pos.totalSize -= matchSize;
        if (oldest.size <= 0) pos.queue.shift();
      }

      if (entrySize > 0) {
        realized.push({
          symbol: cleanSym,
          side: pos.side === 'buy' ? 'Long' : 'Short',
          _ts: ts,
          size: entrySize,
          entry: entryVol / entrySize,
          exit: price,
          pnl: realizedPnl,
        });
      }

      // If remaining > 0, start new position in opposite direction
      if (remaining > 0) {
        pos.side = fillSide;
        pos.queue = [{ price, size: remaining }];
        pos.totalSize = remaining;
      } else if (pos.totalSize <= 0) {
        pos.side = null;
        pos.queue = [];
        pos.totalSize = 0;
      }
    }
  }

  // Aggregate realized trades by day + symbol + side, filtered to date range
  const aggregated = {};
  for (const r of realized) {
    if (startMs && r._ts < startMs) continue;
    if (endMs && r._ts > endMs) continue;

    const dt = new Date(r._ts);
    const ds = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    const tm = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');

    const groupKey = `${ds}_${r.symbol}_${r.side}`;
    if (!aggregated[groupKey]) {
      aggregated[groupKey] = { symbol: r.symbol, side: r.side, date: ds, time: tm, size: 0, entry: 0, exit: 0, fees: 0, pnl: 0, source: 'lighter', _entryVol: 0, _exitVol: 0 };
    }
    const g = aggregated[groupKey];
    g.size += r.size;
    g.pnl += r.pnl;
    g._entryVol += r.entry * r.size;
    g._exitVol += r.exit * r.size;
  }

  return Object.values(aggregated).map(g => {
    if (g.size > 0) {
      g.entry = g._entryVol / g.size;
      g.exit = g._exitVol / g.size;
    }
    delete g._entryVol;
    delete g._exitVol;
    return g;
  });
}

export async function syncLighter(addrRaw, startDate, endDate, authToken, onProgress) {
  const st = new Date(startDate).getTime();
  const et = new Date(endDate).getTime() + 86400000;

  if (!authToken) {
    throw new Error('API token required. Generate one in Lighter app → Settings → API Tokens.');
  }

  // Resolve account index
  let accIdx;
  if (/^\d+$/.test(addrRaw)) {
    accIdx = parseInt(addrRaw);
    onProgress?.(`Using account #${accIdx}`, 10);
  } else if (addrRaw.startsWith('0x')) {
    onProgress?.('Looking up account...', 5);
    accIdx = await ltLookupAccount(addrRaw);
    onProgress?.(`Found account #${accIdx}`, 12);
  } else {
    throw new Error('Enter a 0x wallet address or numeric account index');
  }

  // Fetch market names
  const marketMap = await ltFetchOrderbooks();
  onProgress?.('Fetching trade history...', 15);

  // Fetch fills around the date range (with 14-day lookback for position opens)
  const rawTrades = await fetchTradesAuth(accIdx, authToken, st, onProgress);
  const totalFills = rawTrades.length;

  if (totalFills === 0) {
    throw new Error('API returned 0 fills. Check that your API token is valid and not expired.');
  }

  onProgress?.(`Processing ${totalFills.toLocaleString()} fills (FIFO matching)...`, 75);
  const nt = processTrades(rawTrades, accIdx, marketMap, st, et);

  if (nt.length === 0) {
    throw new Error(
      `Fetched ${totalFills.toLocaleString()} fills but 0 matched the date range ` +
      `${startDate} to ${endDate}. Try "All Time" or adjust dates.`
    );
  }

  onProgress?.(`Done — ${nt.length} trades (from ${totalFills.toLocaleString()} fills)`, 95);
  return { trades: nt, accIdx };
}
