# Stock Algo Lab

A mobile-first Next.js app to **backtest 17 trading algorithms** (10 rule-based, 7 machine learning) on any stock or ETF, then **run them on your Alpaca paper or live account** with one tap, and track each algorithm's trades and P&L.

- **Backtest:** walk-forward ML (logistic regression, k-NN, naive Bayes, decision tree, random forest, gradient boosting, ensemble) next to classic strategies (SMA/EMA crossovers, MACD, momentum, Donchian breakout, volatility targeting, RSI, RSI(2), Bollinger). Equity curves, Sharpe, drawdown, hit rate, and each algorithm's signal for the next session.
- **Trade:** each selected algorithm manages its own dollar sleeve of a symbol. Preview the orders, then confirm them in a bottom sheet. Orders are tagged `sa:<algo>:…` so every fill is attributed to its algorithm.
- **Account:** switch between **Paper** and **Live** in the header. Shows equity, P&L by algorithm, positions, orders and run history, refreshed every 15 seconds.
- **Daily auto-run:** optionally rebalance your algorithms on the **paper** account every trading day, a few minutes before the close, scheduled by Supabase Cron. It runs even when the app is closed.
- **Installable:** add it to your phone's home screen (web manifest and icons included).

## Stack

| Layer | What |
|---|---|
| UI | Next.js 16 (App Router), React 19, Tailwind 4, Recharts |
| API | Next.js route handlers in `src/app/api/*` (algorithms run server-side) |
| Auth + DB | Supabase (email/password auth, Postgres with row-level security) |
| Scheduler | Supabase Cron (`pg_cron` + `pg_net`) → `/api/cron/auto-run` |
| Market data | Yahoo Finance via `yahoo-finance2` (daily, split/dividend adjusted) |
| Broker | Alpaca Trading API (paper + live) |

ML models are implemented from scratch in TypeScript (`src/lib/ml.ts`), so there are no native dependencies.

## Setup

1. **Install:** `npm install`
2. **Supabase:** create a project at supabase.com, open the SQL editor and run both migrations in order: [`20261115000000_init.sql`](supabase/migrations/20261115000000_init.sql), then [`20261116000000_auto_run.sql`](supabase/migrations/20261116000000_auto_run.sql). Or use `supabase db push`.
3. **Keys:** fill in `.env.local` (template: `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API)
   - `ALLOWED_EMAILS`: your login email. Only these accounts can see Alpaca data or place orders.
   - `ALPACA_PAPER_KEY_ID`, `ALPACA_PAPER_SECRET_KEY` (and optionally the `ALPACA_LIVE_*` pair)
4. **Run:** `npm run dev` and open http://localhost:3000, then create your account on the login screen.
5. **Lock it down:** after creating your account, turn off new sign-ups in Supabase (Authentication → Sign In / Providers → "Allow new users to sign up").

Without Supabase keys, `npm run dev` still runs with auth turned off so you can try the backtester. Production builds refuse to run without Supabase.

### Using it on your phone

- On the same Wi-Fi: run `npm run dev -- -H 0.0.0.0` and open `http://<your-computer's-LAN-IP>:3000`.
- Anywhere: deploy it (see [Deploy to Vercel](#deploy-to-vercel)).

Either way, use your browser's **Add to Home Screen** to install it as an app.

## Deploy to Vercel

1. **Sign in and link:** `npx vercel login`, then `npx vercel link`. This creates the Vercel project and connects this GitHub repo, so every push to `main` redeploys.
2. **Env vars:** `npm run vercel:env` copies every non-empty value from `.env.local` to the Production environment. Values go through stdin, and secrets are stored as sensitive. You can also add them in Vercel → Project → Settings → Environment Variables.
3. **Deploy:** `npx vercel deploy --prod`. `NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing them. Until they're set, the site shows a checklist of missing variables.
4. **Supabase auth URLs:** in Supabase → Authentication → URL Configuration, set **Site URL** to your Vercel URL and add `https://<your-app>/auth/callback` to **Redirect URLs** so email confirmation links work.
5. **Daily auto-run:** put the URL into [`supabase/schedule_auto_run.sql`](supabase/schedule_auto_run.sql) and run it once.

## Safety rails

- Alpaca keys live only in server env vars and are never sent to the browser.
- Every API route checks the Supabase session. Alpaca routes also require an `ALLOWED_EMAILS` match.
- **Live orders** need all of: `ALPACA_LIVE_TRADING_ENABLED=true`, a real Supabase login (never the dev bypass), and typing `LIVE` in the confirmation sheet. The header turns red whenever Live is selected.
- Previews never place orders. Orders are market/day, whole shares, and long-only.
- The daily auto-run is hard-wired to the paper account. Its endpoint requires `CRON_SECRET`, and it only trades for users in `ALLOWED_EMAILS`.

## Daily auto-run (paper only)

Once per trading day, inside the window you pick (5–60 minutes before the close), the app rebalances every algorithm sleeve in your auto-run settings on the **paper** account. The automation can never place live orders.

**How it decides when to run:** Supabase Cron pings `/api/cron/auto-run` every 5 minutes on weekday afternoons. Each ping asks Alpaca's market clock how long until the close (so holidays, half-days and daylight saving are handled), and only trades inside your window. Before ordering, it claims the day in `auto_trade_configs` with a conditional update, so overlapping pings can't double-trade. Open orders also count toward each sleeve.

**Setup:**

1. Run the second migration (above).
2. Add to your environment (`.env.local` locally, and your host's env vars when deployed):
   - `SUPABASE_SECRET_KEY`: Supabase → Project Settings → API Keys → Secret keys. Server-only.
   - `CRON_SECRET`: a random string. Your local `.env.local` already has a generated one; use the same value everywhere.
3. Deploy the app (for example to Vercel) so Supabase can reach it.
4. In the Supabase SQL editor, open [`supabase/schedule_auto_run.sql`](supabase/schedule_auto_run.sql), replace the `CRON_SECRET` placeholder (the app URL is already set to the production domain), and run it once.
5. In the app, open **Trade** (Paper), pick a symbol, budget and algorithms, and turn on **Daily auto-run**. Its card shows the last result, and runs appear in **Recent runs** with an "Auto" badge.

**Test it any time** without placing orders (shows what each schedule would trade right now):

```bash
npm run auto-run -- --dry-run
```

**Not deployed yet?** `npm run auto-run` runs the same job from your machine. Schedule it with cron every 5 minutes during the last hour of trading. It's safe to call repeatedly: it only trades inside the window, once per day.

## How the algorithms trade

Each algorithm outputs a target position from 0 to 1 at the close. For a sleeve budget `B` and price `P`, it targets `floor(B × position / P)` shares. The app diffs that against the shares the algorithm already holds (rebuilt from its tagged orders, including open ones) and sends the difference. Run it once a day, ideally near the close, to match the backtest's assumptions.

## Project layout

```
src/lib/        indicators, features, ml, strategies, backtest, trading, autorun, alpaca, db, auth, supabase/*
src/app/api/    backtest(s), strategies, settings, trade, runs, account, autorun, cron/auto-run
src/components/ AppShell (tabs + Paper/Live), BacktestLab, TradePanel, AutoRunCard, AccountView, LoginForm
scripts/        auto-run.ts (npm run auto-run)
supabase/       migrations (tables + RLS) and schedule_auto_run.sql (Supabase Cron)
```

> Backtests are hypothetical and ignore slippage beyond the cost setting. Past performance does not predict future results. This is not investment advice.
