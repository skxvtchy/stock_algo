-- Stock Algo Lab schema. Run in the Supabase SQL editor, or `supabase db push`.
-- Every table is private to its owner via row-level security.

-- Last-used Trade tab settings (one row per user).
create table if not exists public.trade_settings (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  symbol          text not null default 'SPY',
  budget_per_algo numeric not null default 1000 check (budget_per_algo > 0),
  algo_ids        text[] not null default '{}',
  updated_at      timestamptz not null default now()
);

-- Immutable log of every order batch placed through the app.
create table if not exists public.trade_runs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mode            text not null check (mode in ('paper', 'live')),
  symbol          text not null,
  price           numeric not null,
  as_of           date not null,
  budget_per_algo numeric not null,
  orders_placed   integer not null default 0,
  plan            jsonb not null,
  results         jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists trade_runs_user_created_idx on public.trade_runs (user_id, created_at desc);

-- Backtest summaries (metrics per algorithm, without the full equity curves).
create table if not exists public.backtests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ticker       text not null,
  start_date   date not null,
  cost_bps     numeric not null,
  period_start date not null,
  period_end   date not null,
  summary      jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists backtests_user_created_idx on public.backtests (user_id, created_at desc);

alter table public.trade_settings enable row level security;
alter table public.trade_runs     enable row level security;
alter table public.backtests      enable row level security;

drop policy if exists "own settings" on public.trade_settings;
create policy "own settings" on public.trade_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "read own runs" on public.trade_runs;
create policy "read own runs" on public.trade_runs
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "insert own runs" on public.trade_runs;
create policy "insert own runs" on public.trade_runs
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "read own backtests" on public.backtests;
create policy "read own backtests" on public.backtests
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "insert own backtests" on public.backtests;
create policy "insert own backtests" on public.backtests
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "delete own backtests" on public.backtests;
create policy "delete own backtests" on public.backtests
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Expose to the Data API for signed-in users only (RLS still applies).
revoke all on public.trade_settings, public.trade_runs, public.backtests from anon;
grant select, insert, update, delete on public.trade_settings to authenticated;
grant select, insert on public.trade_runs to authenticated;
grant select, insert, delete on public.backtests to authenticated;
