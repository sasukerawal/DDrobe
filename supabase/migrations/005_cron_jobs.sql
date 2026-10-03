-- Migration 005: Scheduled jobs
-- Requires a Vault secret named 'cron_secret' matching the CRON_SECRET Edge Function secret:
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');

-- Reset everyone's daily outfit counter at midnight UTC.
select cron.schedule(
  'daily-generation-reset',
  '0 0 * * *',
  $$ update public.users set daily_generations_used = 0 where daily_generations_used <> 0 $$
);

-- Morning reminder at 06:30 UTC. The secret is read from Vault at run time.
select cron.schedule(
  'morning-outfit-notification',
  '30 6 * * *',
  $$
  select net.http_post(
    url := 'https://yyebnxbfhsgxzdigffpp.supabase.co/functions/v1/send-morning-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5ZWJueGJmaHNneHpkaWdmZnBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MjI4NTEsImV4cCI6MjEwNDA5ODg1MX0.Hqy1rQoUMe9JSECAUDobU57vks2IfVZzQ7I4tbkbo7A',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  )
  $$
);
