-- 051_weight_reminder_prefs.sql
-- Sabah tartı hatırlatması: daily-digest'in 'weight' slotu.
--
-- Yeni kullanıcı: açık ve 08:00 (yerel saat), sabah özetinin varsayılanıyla aynı
-- saat. daily-digest iki slot aynı saate düşünce tartı cümlesini sabah özetine
-- ekler ve tek bildirim gönderir. O gün weight_logs'ta kayıt varsa (elle ya da
-- Health senkronundan) hatırlatma hiç gitmez.
--
-- Mevcut kullanıcı: hatırlatma sabah özetinin saatine ve açık/kapalı durumuna
-- bağlanır. Sabah özetini 07:00'ye almış biri 08:00'de ikinci bir push almasın,
-- sabah özetini kapatmış biri de uygulamanın eski sürümünde kapatamayacağı yeni
-- bir bildirimle karşılaşmasın. Bildirimler ekranından ayrıca değiştirilebilir.
--
-- UPDATE yalnızca kolonlar ilk kez eklenirken çalışır: migration yeniden
-- koşarsa kullanıcıların sonradan yaptığı seçimleri ezmez.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notification_preferences'
      AND column_name = 'weight_enabled'
  ) THEN
    ALTER TABLE notification_preferences
      ADD COLUMN weight_enabled BOOLEAN DEFAULT true,
      ADD COLUMN weight_hour    INTEGER DEFAULT 8
        CHECK (weight_hour >= 0 AND weight_hour <= 23);

    UPDATE notification_preferences
    SET weight_enabled = COALESCE(digest_enabled, true),
        weight_hour    = COALESCE(digest_hour, 8);
  END IF;
END $$;

COMMENT ON COLUMN notification_preferences.weight_hour IS 'Tartı hatırlatması saati (kullanıcı yerel saati)';
