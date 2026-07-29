-- Bildirim cron job'larını kurar (daily-digest + block-notifications).
--
-- KULLANIM
--   1. Supabase Dashboard → Settings → API → service_role key'i kopyala
--   2. Aşağıdaki v_key satırında BURAYA_SERVICE_ROLE_KEY_YAPISTIR yerine yapıştır
--   3. Bu dosyayı Supabase SQL Editor'da çalıştır
--   4. Anahtarı dosyadan tekrar SİL, kaydetme, commit etme
--
-- ⚠️  service_role anahtarı tüm RLS'i bypass eder — tüm kullanıcıların verisine
--     tam erişim demektir. Bu dosyaya gerçek anahtar YAZILI HALDE BIRAKILMAZ.
--     (Anahtar bir kez sızdıysa önce Dashboard'dan rotate et, sonra burayı çalıştır.)
--
-- NOT: Anahtar cron komutuna kurulum anında gömülür. Çalışma anında
--      current_setting('app.service_role_key') okumak denendi ve başarısız oldu:
--      ayar tanımlı olmadığı için header kalıcı olarak boş kaldı ve her çağrı 401
--      döndü (bkz. migrations/023_consolidate_notifications.sql).
--      Anahtarı rotate ettiğinde bu script'i yeniden çalıştırman gerekir —
--      yoksa cron'lar eski anahtarla 401 almaya başlar.

CREATE EXTENSION IF NOT EXISTS pg_net;

DO $setup$
DECLARE
  v_key TEXT := 'BURAYA_SERVICE_ROLE_KEY_YAPISTIR';
  v_base TEXT := 'https://ulmwvssyyfmuqxrgaewe.supabase.co/functions/v1/';
  v_headers TEXT;
BEGIN
  IF v_key IS NULL OR v_key = '' OR v_key = 'BURAYA_SERVICE_ROLE_KEY_YAPISTIR' THEN
    RAISE EXCEPTION 'v_key degiskenine gercek service_role anahtarini yapistirmadan calistirma.';
  END IF;

  v_headers := json_build_object(
    'Authorization', 'Bearer ' || v_key,
    'Content-Type', 'application/json'
  )::text;

  -- Mevcut job'lar varsa temizle (idempotent)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'block-notifications') THEN
    PERFORM cron.unschedule('block-notifications');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-digest') THEN
    PERFORM cron.unschedule('daily-digest');
  END IF;

  -- Her 5 dakikada yaklaşan block bildirimlerini kontrol et
  PERFORM cron.schedule(
    'block-notifications',
    '*/5 * * * *',
    format(
      $job$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$job$,
      v_base || 'event-notifications',
      v_headers
    )
  );

  -- Her saat başı günlük digest
  PERFORM cron.schedule(
    'daily-digest',
    '0 * * * *',
    format(
      $job$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$job$,
      v_base || 'daily-digest',
      v_headers
    )
  );
END
$setup$;

-- Aktif job'ları listele (doğrulama)
SELECT jobname, schedule, active FROM cron.job ORDER BY jobid;
