-- supabase/migrations/015_email_cron.sql
-- pg_cron: her saat başı send-email edge function'ını çağır
-- send-email, kullanıcının timezone'una göre doğru saate denk gelenlere mail gönderir.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'hourly-email-notifications',
      '0 * * * *',
      $job$ SELECT internal.call_edge_function('send-email', '{}'); $job$
    );
    RAISE NOTICE 'hourly-email-notifications cron job oluşturuldu';
  ELSE
    RAISE NOTICE 'pg_cron bulunamadı — job oluşturulmadı';
  END IF;
END;
$$;
