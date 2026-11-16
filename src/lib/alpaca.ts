// Minimal Alpaca Trading API client. Paper and live accounts share the same API;
// only the base URL and keys differ. Keys are read from server-side env vars only.

export type Mode = "paper" | "live";

const BASE: Record<Mode, string> = {
  paper: "https://paper-api.alpaca.markets",
  live: "https://api.alpaca.markets",
};

/** Every order this app places carries this client_order_id prefix: sa:<algoId>:<symbol>:<ts>. */
export const ORDER_PREFIX = "sa:";

export function isConfigured(mode: Mode) {
  const p = mode.toUpperCase();
  return Boolean(process.env[`ALPACA_${p}_KEY_ID`] && process.env[`ALPACA_${p}_SECRET_KEY`]);
}

export function liveTradingEnabled() {
  return process.env.ALPACA_LIVE_TRADING_ENABLED === "true";
}

async function call<T>(mode: Mode, path: string, init?: RequestInit): Promise<T> {
  const p = mode.toUpperCase();
  const key = process.env[`ALPACA_${p}_KEY_ID`];
  const secret = process.env[`ALPACA_${p}_SECRET_KEY`];
  if (!key || !secret) throw new Error(`Alpaca ${mode} keys are not set in .env.local`);
  const res = await fetch(BASE[mode] + path, {
    ...init,
    headers: {
      "APCA-API-KEY-ID": key,
      "APCA-API-SECRET-KEY": secret,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Alpaca ${mode} ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

export interface AlpacaAccount {
  account_number: string;
  status: string;
  currency: string;
  equity: string;
  last_equity: string;
  cash: string;
  buying_power: string;
  portfolio_value: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  side: string;
}

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  symbol: string;
  side: "buy" | "sell";
  type: string;
  qty: string | null;
  filled_qty: string;
  filled_avg_price: string | null;
  status: string;
  submitted_at: string;
  filled_at: string | null;
}

export interface PortfolioHistory {
  timestamp: number[];
  equity: (number | null)[];
  profit_loss: (number | null)[];
}

export interface AlpacaClock {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string; // accounts for early-close days
}

export const getClock = (m: Mode) => call<AlpacaClock>(m, "/v2/clock");
export const getAccount = (m: Mode) => call<AlpacaAccount>(m, "/v2/account");
export const getPositions = (m: Mode) => call<AlpacaPosition[]>(m, "/v2/positions");
export const getOrders = (m: Mode, limit = 500) =>
  call<AlpacaOrder[]>(m, `/v2/orders?status=all&limit=${limit}&direction=desc&nested=false`);
/**
 * Every order, newest first, paging back through history (500 per page). Per-algorithm
 * holdings are rebuilt from tagged orders, so they need the full history, not just the last page.
 */
export async function getAllOrders(m: Mode, maxPages = 40): Promise<AlpacaOrder[]> {
  const out: AlpacaOrder[] = [];
  const seen = new Set<string>();
  let until: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const q = new URLSearchParams({ status: "all", limit: "500", direction: "desc", nested: "false" });
    if (until) q.set("until", until);
    const batch = await call<AlpacaOrder[]>(m, `/v2/orders?${q}`);
    let added = 0;
    for (const o of batch) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      out.push(o);
      added++;
    }
    if (batch.length < 500 || added === 0) break;
    until = batch[batch.length - 1].submitted_at;
  }
  return out;
}

export const getHistory = (m: Mode, period = "3M") =>
  call<PortfolioHistory>(m, `/v2/account/portfolio/history?period=${period}&timeframe=1D`);

export function submitMarketOrder(m: Mode, o: { symbol: string; qty: number; side: "buy" | "sell"; clientOrderId: string }) {
  return call<AlpacaOrder>(m, "/v2/orders", {
    method: "POST",
    body: JSON.stringify({
      symbol: o.symbol,
      qty: String(o.qty),
      side: o.side,
      type: "market",
      time_in_force: "day",
      client_order_id: o.clientOrderId,
    }),
  });
}

export function algoOf(order: Pick<AlpacaOrder, "client_order_id">): string | null {
  if (!order.client_order_id?.startsWith(ORDER_PREFIX)) return null;
  return order.client_order_id.split(":")[1] ?? null;
}

const OPEN = new Set(["new", "accepted", "pending_new", "partially_filled", "accepted_for_bidding", "held", "calculated"]);

export interface AlgoHolding {
  algo: string;
  symbol: string;
  qty: number; // filled shares held by this algo's sleeve
  pendingQty: number; // signed shares in open orders not yet filled
  avgCost: number;
  realizedPL: number;
  orders: number;
}

/** Reconstruct each algo's sleeve (per symbol) from its tagged orders. */
export function algoBook(orders: AlpacaOrder[]): AlgoHolding[] {
  const book = new Map<string, AlgoHolding>();
  const chrono = [...orders].sort((a, b) => (a.filled_at ?? a.submitted_at).localeCompare(b.filled_at ?? b.submitted_at));
  for (const o of chrono) {
    const algo = algoOf(o);
    if (!algo) continue;
    const key = `${algo}|${o.symbol}`;
    const h = book.get(key) ?? { algo, symbol: o.symbol, qty: 0, pendingQty: 0, avgCost: 0, realizedPL: 0, orders: 0 };
    h.orders++;
    const sign = o.side === "buy" ? 1 : -1;
    const filled = Number(o.filled_qty || 0);
    const px = Number(o.filled_avg_price || 0);
    if (filled > 0) {
      if (sign > 0) {
        h.avgCost = (h.avgCost * h.qty + px * filled) / (h.qty + filled);
        h.qty += filled;
      } else {
        h.realizedPL += (px - h.avgCost) * filled;
        h.qty -= filled;
        if (h.qty <= 1e-9) { h.qty = 0; h.avgCost = 0; }
      }
    }
    if (OPEN.has(o.status)) h.pendingQty += sign * (Number(o.qty || 0) - filled);
    book.set(key, h);
  }
  return [...book.values()];
}
