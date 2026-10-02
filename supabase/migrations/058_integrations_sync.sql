-- 058: Jira / Notion / Microsoft To Do senkronu ve Slack eşlemesi
-- 1) integrations-sync edge function'ı 15 dakikada bir (045 kalıbı: URL ve anahtar
--    çalışan bir job'un komutundan devralınır, format() ile gömülür).
-- 2) Slack komutu/kısayolu gelen isteği (team_id, Slack user_id) ile LifeOS kullanıcısına
--    eşler; bu arama için indeks.

CREATE INDEX IF NOT EXISTS idx_integrations_slack_user
  ON integrations ((settings->>'team_id'), (settings->>'slack_user_id'))
  WHERE provider = 'slack';

DO $$
DECLARE
  v_source_cmd TEXT;
  v_url        TEXT;
  v_bearer     TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '058: pg_cron yok, integrations-sync cron kurulmadı.';
    RETURN;
  END IF;

  SELECT command INTO v_source_cmd
    FROM cron.job
   WHERE jobname IN ('calendar-sync', 'daily-digest', 'block-notifications')
   ORDER BY CASE jobname WHEN 'calendar-sync' THEN 0 WHEN 'daily-digest' THEN 1 ELSE 2 END
   LIMIT 1;

  v_url    := substring(v_source_cmd FROM 'https://[a-zA-Z0-9-]+\.supabase\.co');
  v_bearer := substring(v_source_cmd FROM 'Bearer\s+([A-Za-z0-9._-]{40,})');
  IF v_url IS NULL OR v_bearer IS NULL THEN
    RAISE NOTICE '058: mevcut job komutundan URL/anahtar çıkarılamadı, integrations-sync cron kurulmadı.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'integrations-sync') THEN
    PERFORM cron.unschedule('integrations-sync');
  END IF;

  PERFORM cron.schedule(
    'integrations-sync',
    '*/15 * * * *',
    format(
      $cmd$
        SELECT net.http_post(
          url := %L,
          headers := jsonb_build_object('Authorization', %L, 'Content-Type', 'application/json'),
          body := '{}'::jsonb
        );
      $cmd$,
      v_url || '/functions/v1/integrations-sync',
      'Bearer ' || v_bearer
    )
  );
END;
$$;
