-- Migration: 003_pg_cron_notifications.sql
-- pg_cron + pg_net ile bildirim zamanlaması
--
-- KURULUM GEREKSİNİMLERİ:
-- 1. Supabase Dashboard > Database > Extensions:
--    - pg_cron → Etkinleştir
--    - pg_net  → Etkinleştir
-- 2. Aşağıdaki SQL'i Supabase SQL Editor'da çalıştırın (service_role_key yerine gerçek değeri koyun):
--    ALTER DATABASE postgres SET app.supabase_url = 'https://ulmwvssyyfmuqxrgaewe.supabase.co';
--    ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
--
-- Bu migration sadece fonksiyon tanımlarını yapar (extension yoksa sessizce geçer).

-- -------------------------------------------------------
-- Helper fonksiyon: edge function çağır
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.call_edge_function(
  function_name TEXT,
  payload JSONB DEFAULT '{}'::JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  v_url := current_setting('app.supabase_url', true);
  v_key := current_setting('app.service_role_key', true);

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'app.supabase_url veya app.service_role_key ayarlanmamış, bildirim atlandı';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := payload
  );
END;
$$;

-- -------------------------------------------------------
-- pg_cron job'ları (extension mevcutsa çalışır)
-- -------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Sabah briefing: 08:00 İstanbul = 05:00 UTC
    PERFORM cron.schedule(
      'morning-briefing',
      '0 5 * * *',
      $job$ SELECT internal.call_edge_function('send-notification', '{"type":"morning_briefing"}'); $job$
    );

    -- Akşam beslenme: 21:00 İstanbul = 18:00 UTC
    PERFORM cron.schedule(
      'evening-nutrition',
      '0 18 * * *',
      $job$ SELECT internal.call_edge_function('send-notification', '{"type":"evening_nutrition"}'); $job$
    );

    -- Görev hatırlatıcı: her 15 dakika
    PERFORM cron.schedule(
      'task-reminder',
      '*/15 * * * *',
      $job$ SELECT internal.call_edge_function('send-notification', '{"type":"task_reminder"}'); $job$
    );

    RAISE NOTICE 'pg_cron job''ları oluşturuldu: morning-briefing, evening-nutrition, task-reminder';
  ELSE
    RAISE NOTICE 'pg_cron extension bulunamadı — job''lar oluşturulmadı. Dashboard > Extensions > pg_cron etkinleştirin.';
  END IF;
END;
$$;
