-- pg_net extension aktif et
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Mevcut job'lar varsa temizle (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'block-notifications') THEN
    PERFORM cron.unschedule('block-notifications');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-digest') THEN
    PERFORM cron.unschedule('daily-digest');
  END IF;
END $$;

-- Her 5 dakikada block bildirimlerini kontrol et
SELECT cron.schedule(
  'block-notifications',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://ulmwvssyyfmuqxrgaewe.supabase.co/functions/v1/event-notifications',
      headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsbXd2c3N5eWZtdXF4cmdhZXdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2Mzk2OSwiZXhwIjoyMDkxODM5OTY5fQ.NojEah-bSVQjvAySS-NlyiJ4szCoxtIIcJHAenoQ2V8", "Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);

-- Her saat başı günlük digest
SELECT cron.schedule(
  'daily-digest',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://ulmwvssyyfmuqxrgaewe.supabase.co/functions/v1/daily-digest',
      headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsbXd2c3N5eWZtdXF4cmdhZXdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2Mzk2OSwiZXhwIjoyMDkxODM5OTY5fQ.NojEah-bSVQjvAySS-NlyiJ4szCoxtIIcJHAenoQ2V8", "Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);

-- Aktif job'ları listele (doğrulama)
SELECT jobname, schedule, active FROM cron.job ORDER BY jobid;
