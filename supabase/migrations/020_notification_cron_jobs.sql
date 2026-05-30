-- supabase/migrations/020_notification_cron_jobs.sql
-- pg_cron ile bildirim fonksiyonlarını zamanla.
-- NOT: <project-ref> kısmını kendi Supabase proje ref'iniz ile değiştirin.
-- Supabase Dashboard → Settings → API → Reference ID

-- pg_cron ve pg_net extension'ları aktif et
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Her 5 dakikada block bildirimlerini kontrol et
SELECT cron.schedule(
  'block-notifications',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/event-notifications',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Her saat başı günlük digest bildirimini gönder
SELECT cron.schedule(
  'daily-digest',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/daily-digest',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);

-- NOT: current_setting('app.*') yerine doğrudan URL yazabilirsiniz.
-- Supabase SQL Editor'de çalıştırırken:
-- SELECT cron.schedule('block-notifications', '*/5 * * * *', $$
--   SELECT net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/event-notifications',
--     headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
--   );
-- $$);
