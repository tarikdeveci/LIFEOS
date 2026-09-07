-- 045 — send-email icin saatlik cron
--
-- Durum tespiti (7 Eylul): send-email fonksiyonu CALISIYOR. Elle cagrildiginda
-- HTTP 200 ve {"sent":0,"skipped":0,"failed":0} donuyor; RESEND_API_KEY secret'i
-- tanimli. Web ayarlar sayfasinda e-posta anahtarlari da mevcut. Eksik olan tek
-- sey buydu: fonksiyonu tetikleyen bir zamanlayici hic kurulmamisti.
--
-- 023'te kaldirilan 'hourly-email-notifications' job'i bu isi yapamiyordu:
-- internal.call_edge_function diye bir sema yok ("schema internal does not
-- exist"), yani job her calismada patliyordu.
--
-- ANAHTAR NEDEN BURADA YAZMIYOR
-- 004'un ogrettigi ders: cron.schedule komutu SCHEDULE ANINDA metne cevriliyor.
-- Icine current_setting('app.service_role_key') yazmak, o an bu ayar tanimli
-- degilse header'i kalici olarak 'Bearer ' (bos) birakiyor ve her cagri 401
-- donuyor -- cron ise job'i basarili sayiyor, yani hata sessiz kaliyor.
--
-- Servis anahtarini migration dosyasina gomek de secenek degil: dosya git'e
-- giriyor. Cozum, zaten CALISTIGI dogrulanmis bir job'in komutundan URL ve
-- Bearer degerini devralmak. Boylece anahtar depoya hic girmiyor ve yeni job,
-- calisan job'la ayni kimlik bilgisini kullanmasi garanti ediliyor.

DO $$
DECLARE
  v_source_cmd TEXT;
  v_url        TEXT;
  v_bearer     TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '045: pg_cron yok, e-posta cron kurulmadi.';
    RETURN;
  END IF;

  -- Kaynak olarak calistigi dogrulanmis job'lardan ilkini al.
  SELECT command INTO v_source_cmd
    FROM cron.job
   WHERE jobname IN ('daily-digest', 'block-notifications')
   ORDER BY CASE jobname WHEN 'daily-digest' THEN 0 ELSE 1 END
   LIMIT 1;

  IF v_source_cmd IS NULL THEN
    RAISE NOTICE '045: daily-digest/block-notifications job bulunamadi, e-posta cron kurulmadi.';
    RETURN;
  END IF;

  v_url    := substring(v_source_cmd FROM 'https://[a-zA-Z0-9-]+\.supabase\.co');
  v_bearer := substring(v_source_cmd FROM 'Bearer\s+([A-Za-z0-9._-]{40,})');

  IF v_url IS NULL OR v_bearer IS NULL THEN
    RAISE NOTICE '045: mevcut job komutundan URL/anahtar cikarilamadi, e-posta cron kurulmadi.';
    RETURN;
  END IF;

  -- Tekrar calistirilabilir olsun: varsa once kaldir.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-notifications') THEN
    PERFORM cron.unschedule('email-notifications');
  END IF;

  -- Saat basi. send-email kullanicinin yerel saatini kendisi hesaplayip
  -- yalnizca dogru saatte gonderiyor; ayrica notification_log ile ayni gun
  -- ikinci gonderimi engelliyor. Yani saat basi tetiklemek guvenli.
  PERFORM cron.schedule(
    'email-notifications',
    '0 * * * *',
    format(
      $cmd$
        SELECT net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Authorization', %L,
            'Content-Type', 'application/json'
          ),
          body := '{}'::jsonb
        );
      $cmd$,
      v_url || '/functions/v1/send-email',
      'Bearer ' || v_bearer
    )
  );

  RAISE NOTICE '045: email-notifications cron kuruldu (saat basi).';
END;
$$;
