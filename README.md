# Stock Algo Lab

A mobile-first Next.js app to **backtest 17 trading algorithms** (10 rule-based, 7 machine learning) on any stock or ETF, then **run them on your Alpaca paper or live account** with one tap, and track each algorithm's trades and P&L.

- **Backtest:** walk-forward ML (logistic regression, k-NN, naive Bayes, decision tree, random forest, gradient boosting, ensemble) next to classic strategies (SMA/EMA crossovers, MACD, momentum, Donchian breakout, volatility targeting, RSI, RSI(2), Bollinger). Equity curves, Sharpe, drawdown, hit rate, and each algorithm's signal for the next session.
- **Trade:** each selected algorithm manages its own dollar sleeve of a symbol. Preview the orders, then confirm them in a bottom sheet. Orders are tagged `sa:<algo>:…` so every fill is attributed to its algorithm.
- **Account:** switch between **Paper** and **Live** in the header. Shows equity, P&L by algorithm, positions, orders and run history, refreshed every 15 seconds.
- **Installable:** add it to your phone's home screen (web manifest and icons included).

## Stack

| Layer | What |
|---|---|
| UI | Next.js 16 (App Router), React 19, Tailwind 4, Recharts |
| API | Next.js route handlers in `src/app/api/*` (algorithms run server-side) |
| Auth + DB | Supabase (email/password auth, Postgres with row-level security) |
| Market data | Yahoo Finance via `yahoo-finance2` (daily, split/dividend adjusted) |
| Broker | Alpaca Trading API (paper + live) |

ML models are implemented from scratch in TypeScript (`src/lib/ml.ts`), so there are no native dependencies.

## Setup

1. **Install:** `npm install`
2. **Supabase:** create a project at supabase.com, open the SQL editor and run [`supabase/migrations/20261115000000_init.sql`](supabase/migrations/20261115000000_init.sql).
3. **Keys:** fill in `.env.local` (template: `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API)
   - `ALLOWED_EMAILS`: your login email. Only these accounts can see Alpaca data or place orders.
   - `ALPACA_PAPER_KEY_ID`, `ALPACA_PAPER_SECRET_KEY` (and optionally the `ALPACA_LIVE_*` pair)
4. **Run:** `npm run dev` and open http://localhost:3000, then create your account on the login screen.
5. **Lock it down:** after creating your account, turn off new sign-ups in Supabase (Authentication → Sign In / Providers → "Allow new users to sign up").

Without Supabase keys, `npm run dev` still runs with auth turned off so you can try the backtester. Production builds refuse to run without Supabase.

### Using it on your phone

- On the same Wi-Fi: run `npm run dev -- -H 0.0.0.0` and open `http://<your-computer's-LAN-IP>:3000`.
- Anywhere: deploy (for example to Vercel), set the same env vars there, and add the deployed URL to Supabase → Authentication → URL Configuration.

Either way, use your browser's **Add to Home Screen** to install it as an app.

## Safety rails

- Alpaca keys live only in server env vars and are never sent to the browser.
- Every API route checks the Supabase session. Alpaca routes also require an `ALLOWED_EMAILS` match.
- **Live orders** need all of: `ALPACA_LIVE_TRADING_ENABLED=true`, a real Supabase login (never the dev bypass), and typing `LIVE` in the confirmation sheet. The header turns red whenever Live is selected.
- Previews never place orders. Orders are market/day, whole shares, and long-only.

## How the algorithms trade

Each algorithm outputs a target position from 0 to 1 at the close. For a sleeve budget `B` and price `P`, it targets `floor(B × position / P)` shares. The app diffs that against the shares the algorithm already holds (rebuilt from its tagged orders, including open ones) and sends the difference. Run it once a day, ideally near the close, to match the backtest's assumptions.

## Project layout

```
src/lib/        indicators, features, ml, strategies, backtest, alpaca, db, auth, supabase/*
src/app/api/    backtest, backtests, strategies, settings, trade, runs, account
src/components/ AppShell (tabs + Paper/Live), BacktestLab, TradePanel, AccountView, LoginForm
supabase/       SQL migration (tables + RLS)
```

> Backtests are hypothetical and ignore slippage beyond the cost setting. Past performance does not predict future results. This is not investment advice.
