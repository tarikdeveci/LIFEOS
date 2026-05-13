-- Migration: 004_fix_pg_cron.sql
-- 003'teki hatalı cron job'larını sil, doğru URL ile yeniden oluştur

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Eski job'ları temizle (current_setting kullanan hatalı versiyonlar)
    PERFORM cron.unschedule('morning-briefing')  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'morning-briefing');
    PERFORM cron.unschedule('evening-nutrition') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evening-nutrition');
    PERFORM cron.unschedule('task-reminder')     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'task-reminder');

    -- Sabah briefing: 08:00 İstanbul = 05:00 UTC
    PERFORM cron.schedule(
      'morning-briefing',
      '0 5 * * *',
      format(
        $job$
          SELECT net.http_post(
            url     := 'https://ulmwvssyyfmuqxrgaewe.supabase.co/functions/v1/send-notification',
            headers := '{"Content-Type":"application/json","Authorization":"Bearer %s"}'::jsonb,
            body    := '{"type":"morning_briefing"}'::jsonb
          );
        $job$,
        current_setting('app.service_role_key', true)
      )
    );

    -- Akşam beslenme: 21:00 İstanbul = 18:00 UTC
    PERFORM cron.schedule(
      'evening-nutrition',
      '0 18 * * *',
      format(
        $job$
          SELECT net.http_post(
            url     := 'https://ulmwvssyyfmuqxrgaewe.supabase.co/functions/v1/send-notification',
            headers := '{"Content-Type":"application/json","Authorization":"Bearer %s"}'::jsonb,
            body    := '{"type":"evening_nutrition"}'::jsonb
          );
        $job$,
        current_setting('app.service_role_key', true)
      )
    );

    -- Görev hatırlatıcı: her 15 dakika
    PERFORM cron.schedule(
      'task-reminder',
      '*/15 * * * *',
      format(
        $job$
          SELECT net.http_post(
            url     := 'https://ulmwvssyyfmuqxrgaewe.supabase.co/functions/v1/send-notification',
            headers := '{"Content-Type":"application/json","Authorization":"Bearer %s"}'::jsonb,
            body    := '{"type":"task_reminder"}'::jsonb
          );
        $job$,
        current_setting('app.service_role_key', true)
      )
    );

    RAISE NOTICE 'pg_cron job''ları güncellendi.';
    RAISE NOTICE 'Son adım: ALTER DATABASE postgres SET app.service_role_key = ''YOUR_KEY''; komutunu Supabase SQL Editor''da çalıştırın.';

  ELSE
    RAISE NOTICE 'pg_cron yok, atlandı.';
  END IF;
END;
$$;
