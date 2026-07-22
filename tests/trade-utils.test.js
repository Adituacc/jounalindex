import test from 'node:test';
import assert from 'node:assert/strict';

import { dedupeKey, normalizeSide, normalizeTrade } from '../src/utils/formatters.js';
import { parseCSVRows, parseCSVTrades, parseLighterCSV } from '../src/utils/csvImport.js';
import { processTrades } from '../src/utils/ltSync.js';
import { createCalendarWeekBuckets, summarizeTradeOutcomes } from '../src/utils/tradeAnalytics.js';

test('normalizes every supported trade side to the canonical enum', () => {
  assert.equal(normalizeSide('long'), 'Long');
  assert.equal(normalizeSide('BUY'), 'Long');
  assert.equal(normalizeSide('short'), 'Short');
  assert.equal(normalizeSide('sell'), 'Short');
});

test('normalizes imported numeric fields and calculates missing P&L', () => {
  const trade = normalizeTrade({
    symbol: 'btcusd',
    side: 'buy',
    date: '2026-07-22',
    time: '09:15',
    size: '0.5',
    entry: '100',
    exit: '110',
    fees: '1',
    pnl: 'not-a-number',
  });

  assert.equal(trade.symbol, 'BTCUSD');
  assert.equal(trade.side, 'Long');
  assert.equal(trade.pnl, 4);
});

test('normalizes account and review metadata without duplicating tags', () => {
  const trade = normalizeTrade({
    symbol: 'eth', side: 'short', date: '2026-07-22', pnl: 12,
    accountId: 'lighter_7', strategy: 'Breakout', setup: 'Range failure',
    tags: ['A-Plus', 'a-plus', ' London '], reviewed: 1,
  });

  assert.equal(trade.accountId, 'lighter_7');
  assert.equal(trade.strategy, 'Breakout');
  assert.deepEqual(trade.tags, ['a-plus', 'london']);
  assert.equal(trade.reviewed, true);
});

test('dedupe key keeps distinct trades that share timestamp and P&L', () => {
  const base = { date: '2026-07-22', time: '12:00', symbol: 'BTC', side: 'Long', size: 1, entry: 100, exit: 110, fees: 0, pnl: 10, source: 'manual' };
  assert.notEqual(dedupeKey(base), dedupeKey({ ...base, side: 'Short' }));
  assert.notEqual(dedupeKey(base), dedupeKey({ ...base, size: 2 }));
  assert.notEqual(dedupeKey(base), dedupeKey({ ...base, source: 'lighter' }));
});

test('CSV parser supports quoted commas, escaped quotes, and CRLF', () => {
  const rows = parseCSVRows('symbol,comment,pnl\r\nBTC,"Scaled, then closed",10\r\nETH,"He said ""done""",5');
  assert.deepEqual(rows[1], ['BTC', 'Scaled, then closed', '10']);
  assert.deepEqual(rows[2], ['ETH', 'He said "done"', '5']);
});

test('trade import validates JSON records and canonicalizes CSV data', () => {
  const json = JSON.stringify([
    { symbol: 'BTC', side: 'Long', date: '2026-07-22', pnl: '12.5' },
    { symbol: '', side: 'Long', date: 'bad-date', pnl: 1 },
  ]);
  assert.equal(parseCSVTrades(json, 'backup.json').length, 1);

  const csv = 'Date,Time,Symbol,Side,Size,Entry,Exit,Fees,PnL\n07/22/26,12:30,eth,SELL,1,100,90,1,9';
  const [trade] = parseCSVTrades(csv, 'trades.csv');
  assert.equal(trade.date, '2026-07-22');
  assert.equal(trade.symbol, 'ETH');
  assert.equal(trade.side, 'Short');
  assert.equal(trade.pnl, 9);
});

test('analytics exclude breakeven trades from win/loss rates', () => {
  const summary = summarizeTradeOutcomes([{ pnl: 10 }, { pnl: -5 }, { pnl: 0 }]);
  assert.equal(summary.wins, 1);
  assert.equal(summary.losses, 1);
  assert.equal(summary.breakeven, 1);
  assert.equal(summary.winRate, 50);
  assert.equal(summary.profitFactor, 2);
});

test('calendar analytics include fifth and sixth calendar rows', () => {
  const weeks = createCalendarWeekBuckets(2026, 7, {
    '2026-08-31': { pnl: 42 },
  });
  assert.equal(weeks.length, 6);
  assert.deepEqual(weeks[5], { pnl: 42, days: 1 });
});

test('Lighter TWAP fills become one trade per completed position cycle', () => {
  const account = 7;
  const startedAt = new Date(2026, 6, 22, 9, 0, 0).getTime();
  const fill = (tradeId, offsetSeconds, side, size, price) => ({
    trade_id: tradeId,
    market_id: 1,
    timestamp: startedAt + offsetSeconds * 1000,
    size: String(size),
    price: String(price),
    ask_account_id: side === 'sell' ? account : 99,
    bid_account_id: side === 'buy' ? account : 99,
    is_maker_ask: side === 'buy',
  });

  const rawFills = [
    ...[100, 101, 102, 103].map((price, index) => fill(index + 1, index * 30, 'buy', 0.25, price)),
    ...[110, 111, 112, 113].map((price, index) => fill(index + 5, 300 + index * 30, 'sell', 0.25, price)),
    fill(9, 900, 'buy', 0.5, 120),
    fill(10, 960, 'sell', 0.5, 125),
  ];

  const { trades, stats } = processTrades(rawFills, account, { 1: 'BTC-USD' });
  assert.equal(trades.length, 2, 'separate same-day round trips must not be merged');
  assert.equal(stats.accountFills, 10);
  assert.equal(trades[0].fillCount, 8);
  assert.equal(trades[0].side, 'Long');
  assert.equal(trades[0].size, 1);
  assert.equal(trades[0].entry, 101.5);
  assert.equal(trades[0].exit, 111.5);
  assert.equal(trades[0].pnl, 10);
  assert.equal(trades[1].pnl, 2.5);
});

test('Lighter position-before fields recover a cycle opened before the fetch window', () => {
  const timestamp = new Date(2026, 6, 22, 12, 0, 0).getTime();
  const { trades } = processTrades([{
    trade_id: 50,
    market_id: 2,
    timestamp,
    size: '2',
    price: '110',
    ask_account_id: 7,
    bid_account_id: 8,
    is_maker_ask: false,
    taker_position_size_before: '2',
    taker_entry_quote_before: '200',
  }], 7, { 2: 'ETH-USD' });

  assert.equal(trades.length, 1);
  assert.equal(trades[0].entry, 100);
  assert.equal(trades[0].exit, 110);
  assert.equal(trades[0].pnl, 20);
});

test('Lighter position flips close one cycle and open the opposite cycle', () => {
  const timestamp = new Date(2026, 6, 22, 14, 0, 0).getTime();
  const makeFill = (tradeId, side, size, price) => ({
    trade_id: tradeId,
    market_id: 1,
    timestamp: timestamp + tradeId * 1000,
    size: String(size),
    price: String(price),
    ask_account_id: side === 'sell' ? 7 : 8,
    bid_account_id: side === 'buy' ? 7 : 8,
    is_maker_ask: side === 'buy',
  });

  const { trades } = processTrades([
    makeFill(1, 'buy', 1, 100),
    makeFill(2, 'sell', 2, 110),
    makeFill(3, 'buy', 1, 100),
  ], 7, { 1: 'BTC-USD' });

  assert.equal(trades.length, 2);
  assert.deepEqual(trades.map(trade => trade.side), ['Long', 'Short']);
  assert.deepEqual(trades.map(trade => trade.pnl), [10, 10]);
});

test('Lighter CSV groups fills by TWAP parent order when available', () => {
  const csv = [
    'Symbol,Side,Timestamp,Size,Entry,Exit,PnL,Parent Order ID',
    'BTC,Long,2026-07-22T09:00:00,0.25,100,110,2.5,twap-42',
    'BTC,Long,2026-07-22T09:00:30,0.25,101,111,2.5,twap-42',
    'BTC,Long,2026-07-22T09:01:00,0.25,102,112,2.5,twap-42',
  ].join('\n');

  const trades = parseLighterCSV(csv);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].fillCount, 3);
  assert.equal(trades[0].size, 0.75);
  assert.equal(trades[0].entry, 101);
  assert.equal(trades[0].exit, 111);
  assert.equal(trades[0].pnl, 7.5);
});
