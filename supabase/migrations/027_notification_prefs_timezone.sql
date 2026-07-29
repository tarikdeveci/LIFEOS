-- 027_notification_prefs_timezone.sql
-- notification_preferences.timezone hiçbir zaman doldurulmuyordu: trigger sadece
-- (user_id) insert ediyor, kolon DEFAULT 'Europe/Istanbul' değerinde kalıyordu.
-- Mobil uygulama kayıt sırasında cihazın IANA timezone'unu auth metadata'ya
-- yazıyor ama oradan buraya taşınmıyordu. Sonuç: Türkiye dışındaki her kullanıcı
-- sessizce İstanbul saatine göre bildirim alıyordu (Berlin 1 saat, New York
-- 7 saat kayma). Bildirim saatleri sunucuda bu kolona göre hesaplandığı için
-- kayma doğrudan kullanıcıya yansıyor.

-- ============================================================
-- 1. Geçerli IANA timezone mu? (pg_timezone_names sistem view'ı)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_valid_timezone(tz TEXT)
RETURNS BOOLEAN AS $$
  SELECT tz IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = tz);
$$ LANGUAGE sql STABLE;

-- ============================================================
-- 2. Trigger artık kayıt sırasındaki timezone'u kullanıyor
-- ============================================================
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
DECLARE
  v_tz TEXT;
BEGIN
  v_tz := NEW.raw_user_meta_data->>'timezone';
  IF NOT public.is_valid_timezone(v_tz) THEN
    v_tz := 'Europe/Istanbul';
  END IF;

  INSERT INTO public.notification_preferences (user_id, timezone)
  VALUES (NEW.id, v_tz)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'create_default_notification_preferences error: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 3. Mevcut kullanıcıları auth metadata'daki gerçek timezone'a çek
--    (sadece hâlâ varsayılanda olanlar; kullanıcı kendi seçtiyse dokunma)
-- ============================================================
UPDATE notification_preferences p
SET timezone = u.raw_user_meta_data->>'timezone'
FROM auth.users u
WHERE u.id = p.user_id
  AND p.timezone = 'Europe/Istanbul'
  AND public.is_valid_timezone(u.raw_user_meta_data->>'timezone')
  AND u.raw_user_meta_data->>'timezone' <> 'Europe/Istanbul';

-- ============================================================
-- 4. Bozuk/boş değerler edge function'da Intl'i patlatmasın
-- ============================================================
UPDATE notification_preferences
SET timezone = 'Europe/Istanbul'
WHERE NOT public.is_valid_timezone(timezone);

ALTER TABLE notification_preferences
  ALTER COLUMN timezone SET NOT NULL;

ALTER TABLE notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_timezone_valid;

ALTER TABLE notification_preferences
  ADD CONSTRAINT notification_preferences_timezone_valid
  CHECK (public.is_valid_timezone(timezone));
