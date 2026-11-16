-- Schedule the daily paper auto-run with Supabase Cron (pg_cron + pg_net).
-- Run ONCE in the Supabase SQL editor after the app is deployed, replacing both placeholders.
--
-- It pings the app every 5 minutes on weekday afternoons (UTC hours cover the 4pm ET close in
-- both EST and EDT, and 1pm half-days). The app checks Alpaca's market clock and trades at most
-- once per trading day, inside each user's "minutes before close" window.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Same value as CRON_SECRET in the app's environment.
select vault.create_secret('REPLACE_WITH_YOUR_CRON_SECRET', 'stock_algo_cron_secret');

select cron.schedule(
  'stock-algo-auto-run',
  '*/5 13-21 * * 1-5',
  $$
  select net.http_post(
    url := 'https://REPLACE-WITH-YOUR-APP-DOMAIN/api/cron/auto-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'stock_algo_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Recent cron runs:    select * from cron.job_run_details order by start_time desc limit 20;
-- App responses:       select status_code, content from net._http_response order by created desc limit 20;
-- Pause:               select cron.unschedule('stock-algo-auto-run');
