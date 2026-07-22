// Lighter (zkLighter) Sync Utility
// Requires API token from Lighter app settings for trade history access.
// API docs: The Lighter API uses `auth` query param for authentication.

const LT_BASE = 'https://mainnet.zklighter.elliot.ai';
const DEV_PROXY = '/lighter-api'; // Vite dev proxy to avoid CORS

async function ltFetch(path, { timeoutMs = 30000, authToken = '' } = {}) {
  const errors = [];
  const headers = authToken ? { Authorization: authToken } : undefined;

  const waitForRateLimit = async (response, attempt) => {
    const retryAfter = Number(response.headers.get('retry-after'));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(2000 * (2 ** attempt), 15000);
    await new Promise(resolve => setTimeout(resolve, delay));
  };

  // In dev mode, try the Vite proxy first (no CORS issues)
  const isDev = typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(window.location?.hostname);
  if (isDev) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const r = await fetch(DEV_PROXY + path, { signal: controller.signal, headers });
        clearTimeout(timer);
        if (r.ok) return await r.json();
        if ((r.status === 429 || r.status === 405) && attempt < 3) {
          await waitForRateLimit(r, attempt);
          continue;
        }
        const body = await r.text().catch(() => '');
        throw new Error(`Lighter API returned HTTP ${r.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
      } catch (e) {
        if (e.message.startsWith('Lighter API returned')) throw e;
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
      const r = await fetch(directUrl, { signal: controller.signal, headers });
      clearTimeout(timer);
      if (r.ok) return await r.json();
      if ((r.status === 429 || r.status === 405) && attempt < 3) {
        await waitForRateLimit(r, attempt);
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

  throw new Error(errors.join(' | '));
}

// Look up every account index for a wallet (public, no auth needed).
export async function ltLookupAccounts(addr) {
  const d = await ltFetch(`/api/v1/accountsByL1Address?l1_address=${encodeURIComponent(addr)}`);
  const accounts = d?.sub_accounts || d?.accounts || [];
  const normalized = accounts
    .map(account => ({
      index: account.account_index ?? account.index,
      name: String(account.name || account.account_name || account.description || '').trim(),
    }))
    .filter(account => account.index !== undefined && account.index !== null);

  if (normalized.length === 0) {
    throw new Error('No Lighter account found for this address. Have you deposited on Lighter?');
  }
  return normalized;
}

export async function ltLookupAccount(addr) {
  const accounts = await ltLookupAccounts(addr);
  if (accounts.length === 1) return accounts[0].index;
  throw new Error(`This wallet has ${accounts.length} Lighter accounts. Select an account in the sync window.`);
}

// Fetch market symbol map (public, no auth needed)
export async function ltFetchOrderbooks() {
  try {
    const d = await ltFetch('/api/v1/orderBooks');
    const map = {};
    const books = d.order_books || [];
    for (const ob of books) {
      const marketId = ob.market_id ?? ob.market_index ?? ob.index;
      map[marketId] = ob.symbol || `MKT-${marketId}`;
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
  // Position-before fields let us reconstruct a cycle that opened before this window.
  // The buffer also protects against sparse/legacy payloads that omit those fields.
  const stopAt = startMs ? startMs - 30 * 86400000 : 0;
  let allTrades = [];
  let cursor = null;
  let page = 0;
  const seenTradeIds = new Set();
  const seenCursors = new Set();

  while (true) {
    page++;
    let url = `/api/v1/trades?account_index=${accIdx}&market_type=perp&type=trade&sort_by=timestamp&sort_dir=desc&limit=${PAGE_SIZE}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

    const pct = 15 + Math.min(Math.round(page * 2), 55);
    onProgress?.(`Fetching fills (page ${page}, ${allTrades.length.toLocaleString()} so far)...`, pct);

    const d = await ltFetch(url, { authToken });
    const trades = d.trades || (Array.isArray(d) ? d : []);

    if (!Array.isArray(trades) || trades.length === 0) break;
    for (const trade of trades) {
      const identity = String(trade.trade_id ?? trade.tx_hash ?? `${trade.timestamp}:${trade.market_id}:${trade.price}:${trade.size}`);
      if (seenTradeIds.has(identity)) continue;
      seenTradeIds.add(identity);
      allTrades.push(trade);
    }

    // Check if oldest trade on this page is before our lookback window
    if (stopAt > 0) {
      const oldest = trades[trades.length - 1];
      const oldestTs = toMs(oldest.timestamp || oldest.transaction_time || 0);
      if (oldestTs > 0 && oldestTs < stopAt) break;
    }

    cursor = d.next_cursor;
    if (!cursor || seenCursors.has(cursor) || trades.length < PAGE_SIZE) break;
    seenCursors.add(cursor);
    if (page >= 500) break;

    // Standard accounts are capped at 60 REST requests/minute.
    const delay = 1100;
    await new Promise(r => setTimeout(r, delay));
  }

  return allTrades;
}

const POSITION_EPSILON = 1e-10;

function formatLocalDateTime(timestamp) {
  const date = new Date(timestamp);
  return {
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
  };
}

function getPositionBefore(fill, isAsk, isBid) {
  const makerIsAsk = fill.is_maker_ask === true || String(fill.is_maker_ask).toLowerCase() === 'true';
  const accountIsMaker = (isAsk && makerIsAsk) || (isBid && !makerIsAsk);
  const sizeRaw = accountIsMaker ? fill.maker_position_size_before : fill.taker_position_size_before;
  const quoteRaw = accountIsMaker ? fill.maker_entry_quote_before : fill.taker_entry_quote_before;
  const size = Number(sizeRaw);
  const quote = Number(quoteRaw);

  if (!Number.isFinite(size) || Math.abs(size) <= POSITION_EPSILON) return null;
  return {
    signedSize: size,
    averageEntry: Number.isFinite(quote) && Math.abs(quote) > 0 ? Math.abs(quote / size) : null,
  };
}

function createCycle(side, timestamp, tradeId, seeded = false) {
  return {
    side,
    openedAt: seeded ? null : timestamp,
    firstTradeId: String(tradeId ?? timestamp),
    fillIds: new Set(),
    entryVolume: 0,
    exitVolume: 0,
    closedSize: 0,
    pnl: 0,
    seeded,
  };
}

/**
 * Converts Lighter executions into journal trades by position lifecycle.
 * A TWAP can create hundreds of child fills, but those fills remain one trade
 * until the position for that market returns to flat or flips direction.
 */
export function processTrades(rawTrades, accIdx, marketMap, startMs = 0, endMs = 0) {
  if (!Array.isArray(rawTrades) || rawTrades.length === 0) {
    return { trades: [], stats: { accountFills: 0, completedCycles: 0, openPositions: 0 } };
  }

  const accStr = String(accIdx);
  const sorted = rawTrades
    .map(fill => ({ ...fill, _ms: toMs(fill.timestamp || fill.transaction_time || 0) }))
    .filter(fill => fill._ms > 0)
    .sort((left, right) => left._ms - right._ms || Number(left.trade_id || 0) - Number(right.trade_id || 0));

  const positions = {};
  const completed = [];
  let accountFills = 0;

  const finalizeCycle = (position, symbol, marketId, timestamp, closingTradeId) => {
    const cycle = position.cycle;
    if (!cycle || cycle.closedSize <= POSITION_EPSILON) return;

    const dateTime = formatLocalDateTime(timestamp);
    completed.push({
      id: `lighter:${accStr}:${marketId}:${cycle.firstTradeId}:${closingTradeId ?? timestamp}`,
      symbol,
      side: cycle.side === 'buy' ? 'Long' : 'Short',
      date: dateTime.date,
      time: dateTime.time,
      size: cycle.closedSize,
      entry: cycle.entryVolume / cycle.closedSize,
      exit: cycle.exitVolume / cycle.closedSize,
      fees: 0,
      pnl: cycle.pnl,
      source: 'lighter',
      fillCount: cycle.fillIds.size,
      grouping: 'position-cycle',
      openedAt: cycle.openedAt ? new Date(cycle.openedAt).toISOString() : null,
      closedAt: new Date(timestamp).toISOString(),
    });
  };

  for (const fill of sorted) {
    const isAsk = String(fill.ask_account_id) === accStr;
    const isBid = String(fill.bid_account_id) === accStr;
    if ((!isAsk && !isBid) || (isAsk && isBid)) continue;

    const price = Number(fill.price);
    const size = Math.abs(Number(fill.size));
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(size) || size <= POSITION_EPSILON) continue;

    accountFills += 1;
    const action = isAsk ? 'sell' : 'buy';
    const marketId = fill.market_id ?? 0;
    const rawSymbol = marketMap[marketId] || `MKT-${marketId}`;
    const symbol = rawSymbol.replace(/-USD[C]?$/i, '').replace(/_USD[C]?$/i, '');
    const tradeId = fill.trade_id ?? fill.tx_hash ?? `${fill._ms}-${price}-${size}`;

    if (!positions[symbol]) {
      positions[symbol] = { side: null, queue: [], totalSize: 0, cycle: null };
      const positionBefore = getPositionBefore(fill, isAsk, isBid);
      if (positionBefore) {
        const seededSide = positionBefore.signedSize > 0 ? 'buy' : 'sell';
        const seededSize = Math.abs(positionBefore.signedSize);
        const seededEntry = positionBefore.averageEntry || price;
        positions[symbol] = {
          side: seededSide,
          queue: [{ price: seededEntry, size: seededSize }],
          totalSize: seededSize,
          cycle: createCycle(seededSide, fill._ms, `before-${tradeId}`, true),
        };
      }
    }

    const position = positions[symbol];
    if (position.totalSize <= POSITION_EPSILON || position.side === action) {
      if (position.totalSize <= POSITION_EPSILON) {
        position.side = action;
        position.queue = [];
        position.totalSize = 0;
        position.cycle = createCycle(action, fill._ms, tradeId);
      }
      position.queue.push({ price, size });
      position.totalSize += size;
      position.cycle.fillIds.add(String(tradeId));
      continue;
    }

    let remaining = size;
    position.cycle.fillIds.add(String(tradeId));

    while (remaining > POSITION_EPSILON && position.queue.length > 0) {
      const oldest = position.queue[0];
      const matchedSize = Math.min(remaining, oldest.size);
      position.cycle.entryVolume += oldest.price * matchedSize;
      position.cycle.exitVolume += price * matchedSize;
      position.cycle.closedSize += matchedSize;
      position.cycle.pnl += position.side === 'buy'
        ? (price - oldest.price) * matchedSize
        : (oldest.price - price) * matchedSize;

      oldest.size -= matchedSize;
      remaining -= matchedSize;
      position.totalSize -= matchedSize;
      if (oldest.size <= POSITION_EPSILON) position.queue.shift();
    }

    if (position.totalSize <= POSITION_EPSILON) {
      finalizeCycle(position, symbol, marketId, fill._ms, tradeId);
      position.side = null;
      position.queue = [];
      position.totalSize = 0;
      position.cycle = null;
    }

    // A fill larger than the existing position closes one cycle and opens the opposite one.
    if (remaining > POSITION_EPSILON) {
      position.side = action;
      position.queue = [{ price, size: remaining }];
      position.totalSize = remaining;
      position.cycle = createCycle(action, fill._ms, tradeId);
      position.cycle.fillIds.add(String(tradeId));
    }
  }

  const trades = completed.filter(trade => {
    const closedAt = new Date(trade.closedAt).getTime();
    return (!startMs || closedAt >= startMs) && (!endMs || closedAt <= endMs);
  });
  const openPositions = Object.values(positions).filter(position => position.totalSize > POSITION_EPSILON).length;

  return {
    trades,
    stats: { accountFills, completedCycles: completed.length, openPositions },
  };
}

export async function syncLighter(addrRaw, startDate, endDate, authToken, onProgress) {
  const st = new Date(`${startDate}T00:00:00`).getTime();
  const et = new Date(`${endDate}T23:59:59.999`).getTime();

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

  onProgress?.(`Grouping ${totalFills.toLocaleString()} fills into position cycles...`, 75);
  const processed = processTrades(rawTrades, accIdx, marketMap, st, et);
  const nt = processed.trades;

  if (nt.length === 0) {
    if (processed.stats.openPositions > 0) {
      throw new Error(
        `No completed position cycles closed between ${startDate} and ${endDate}. ` +
        `${processed.stats.openPositions} position${processed.stats.openPositions === 1 ? ' is' : 's are'} still open and will be imported after returning to flat.`
      );
    }
    throw new Error(
      `Fetched ${totalFills.toLocaleString()} fills but 0 matched the date range ` +
      `${startDate} to ${endDate}. Try "All Time" or adjust dates.`
    );
  }

  onProgress?.(`Done — ${nt.length} position trades from ${totalFills.toLocaleString()} fills`, 95);
  return { trades: nt, accIdx, fillCount: totalFills, ...processed.stats };
}
