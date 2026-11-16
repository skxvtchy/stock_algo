-- Daily paper auto-run: per-user schedule + a source column on trade_runs.

create table if not exists public.auto_trade_configs (
  user_id              uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled              boolean not null default false,
  symbol               text not null,
  budget_per_algo      numeric not null check (budget_per_algo > 0 and budget_per_algo <= 1000000),
  algo_ids             text[] not null default '{}',
  minutes_before_close integer not null default 15 check (minutes_before_close between 5 and 60),
  last_run_on          date,         -- New York trading day of the last claimed run (once-per-day guard)
  last_run_at          timestamptz,
  last_status          text check (last_status in ('running', 'ok', 'partial', 'error', 'skipped')),
  last_message         text,
  updated_at           timestamptz not null default now()
);

alter table public.auto_trade_configs enable row level security;

drop policy if exists "own auto config" on public.auto_trade_configs;
create policy "own auto config" on public.auto_trade_configs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.auto_trade_configs from anon;
grant select, insert, update, delete on public.auto_trade_configs to authenticated;

-- Manual (Trade tab) vs scheduled runs.
alter table public.trade_runs add column if not exists source text not null default 'manual';
alter table public.trade_runs drop constraint if exists trade_runs_source_check;
alter table public.trade_runs add constraint trade_runs_source_check check (source in ('manual', 'auto'));

-- The scheduler uses the service role (bypasses RLS) to read schedules and log runs.
grant select, update on public.auto_trade_configs to service_role;
grant select, insert on public.trade_runs to service_role;
