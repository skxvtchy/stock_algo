import YahooFinance from "yahoo-finance2";

export interface Bar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number; // split/dividend-adjusted close
  volume: number;
}

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const cache = new Map<string, { at: number; bars: Bar[] }>();
const TTL_MS = 60 * 60 * 1000;

/** Daily OHLCV from Yahoo Finance, with OHLC scaled to the adjusted close. */
export async function fetchBars(ticker: string, start: string): Promise<Bar[]> {
  const key = `${ticker}|${start}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.bars;

  const res = await yf.chart(ticker, { period1: start, interval: "1d" });
  const bars: Bar[] = [];
  for (const q of res.quotes) {
    if (q.close == null || q.open == null || q.high == null || q.low == null) continue;
    const adj = q.adjclose ?? q.close;
    const k = adj / q.close;
    bars.push({
      date: q.date.toISOString().slice(0, 10),
      open: q.open * k,
      high: q.high * k,
      low: q.low * k,
      close: adj,
      volume: q.volume ?? 0,
    });
  }
  cache.set(key, { at: Date.now(), bars });
  return bars;
}
