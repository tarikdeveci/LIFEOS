-- Migration: 023_consolidate_notifications.sql
-- Bildirim sistemini tek bir yerde (daily-digest) topla.
--
-- SORUN: send-notification'a giden üç cron job'ı da ölüydü. 004 migration'ı
-- key'i format() ile schedule anında komuta gömüyor; o an app.service_role_key
-- tanımlı olmadığı için header kalıcı olarak 'Bearer ' (boş) kaldı ve her çağrı
-- 401 döndü. Üstüne send-notification push token'ı user_profiles.preferences
-- .push_token'dan okuyordu; mobil uygulama ise push_tokens tablosuna yazıyor,
-- yani 401 düzelse bile sıfır bildirim gönderirdi.
--
-- Bu job'lar zaten çalışanların kopyasıydı:
--   morning-briefing   -> daily-digest ile aynı işi yapıyor
--   task-reminder      -> block-notifications (event-notifications) ile aynı iş
--   evening-nutrition  -> içeriği daily-digest'in akşam slotuna taşındı
--
-- hourly-email-notifications hiç çalışmadı: internal.call_edge_function diye bir
-- şey yok ("schema internal does not exist"). send-email'in kendisi de
-- RESEND_API_KEY tanımlı olmadığı için 500 veriyor. E-posta istenirse önce o
-- secret set edilmeli, sonra job yeniden kurulmalı.
--
-- daily-digest ve block-notifications job'larına DOKUNULMUYOR: ikisi de SQL
-- Editor'den key gömülü olarak kurulmuş ve 200 dönüyor.

-- 1. Öğlen ve akşam slotları (sabah = mevcut digest_hour)
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS midday_enabled  BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS midday_hour     INTEGER DEFAULT 13
    CHECK (midday_hour >= 0 AND midday_hour <= 23),
  ADD COLUMN IF NOT EXISTS evening_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS evening_hour    INTEGER DEFAULT 21
    CHECK (evening_hour >= 0 AND evening_hour <= 23);

COMMENT ON COLUMN notification_preferences.midday_hour  IS 'Öğlen kontrolü saati (kullanıcı yerel saati)';
COMMENT ON COLUMN notification_preferences.evening_hour IS 'Gün sonu özeti saati (kullanıcı yerel saati)';

-- 2. Ölü cron job'larını kaldır
DO $$
DECLARE
  dead_job TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron yok, cron temizligi atlandi.';
    RETURN;
  END IF;

  FOREACH dead_job IN ARRAY ARRAY[
    'morning-briefing',
    'evening-nutrition',
    'task-reminder',
    'hourly-email-notifications'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = dead_job) THEN
      PERFORM cron.unschedule(dead_job);
      RAISE NOTICE 'olu cron job kaldirildi: %', dead_job;
    END IF;
  END LOOP;
END;
$$;
