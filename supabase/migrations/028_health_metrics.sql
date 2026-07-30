-- 028_health_metrics.sql
-- Apple Health (HealthKit) ve Android Health Connect'ten okunan günlük sağlık
-- özetleri. Ham örnekler cihazda kalır; buraya sadece gün başına toplanmış
-- değerler yazılır (adım, mesafe, aktif kalori, uyku, nabız).
--
-- Metriklerin hepsi NULL olabilir: kullanıcının saati yoksa nabız/uyku hiç
-- gelmez, 0 yazmak "sıfır adım attı" gibi yanlış bir bilgi üretir. Sorgular ve
-- UI NULL'ı "veri yok" olarak ele almalı.

-- ============================
-- Günlük sağlık özeti
-- ============================
CREATE TABLE IF NOT EXISTS health_daily (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Hareket
  steps INTEGER CHECK (steps IS NULL OR steps >= 0),
  distance_m NUMERIC(10, 2) CHECK (distance_m IS NULL OR distance_m >= 0),
  active_energy_kcal NUMERIC(8, 2) CHECK (active_energy_kcal IS NULL OR active_energy_kcal >= 0),
  exercise_minutes INTEGER CHECK (exercise_minutes IS NULL OR exercise_minutes >= 0),
  workout_count INTEGER CHECK (workout_count IS NULL OR workout_count >= 0),

  -- Uyku (gece o tarihe ait uyanışla biten uyku olarak kaydedilir)
  sleep_minutes INTEGER CHECK (sleep_minutes IS NULL OR sleep_minutes BETWEEN 0 AND 1440),
  sleep_start TIMESTAMPTZ,
  sleep_end TIMESTAMPTZ,

  -- Nabız
  resting_heart_rate NUMERIC(5, 1) CHECK (resting_heart_rate IS NULL OR resting_heart_rate BETWEEN 20 AND 220),
  avg_heart_rate NUMERIC(5, 1) CHECK (avg_heart_rate IS NULL OR avg_heart_rate BETWEEN 20 AND 250),

  source TEXT NOT NULL CHECK (source IN ('apple_health', 'health_connect', 'manual')),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, date)
);

-- Son N günü çekmek en sık sorgu
CREATE INDEX IF NOT EXISTS idx_health_daily_user_date
  ON health_daily (user_id, date DESC);

-- ============================
-- Sağlık ayarları / hedefler
-- ============================
CREATE TABLE IF NOT EXISTS health_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Kullanıcı senkronu açık mı (izin verilse bile kapatabilir)
  enabled BOOLEAN NOT NULL DEFAULT FALSE,

  step_goal INTEGER NOT NULL DEFAULT 8000
    CHECK (step_goal BETWEEN 1000 AND 100000),
  sleep_goal_minutes INTEGER NOT NULL DEFAULT 450
    CHECK (sleep_goal_minutes BETWEEN 120 AND 900),

  -- Aktif kaloriyi günlük yemek bütçesine ekle (yediğin - yaktığın mantığı)
  add_active_energy_to_budget BOOLEAN NOT NULL DEFAULT FALSE,

  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================
-- updated_at trigger'ları (update_updated_at() 001'de tanımlı)
-- ============================
DROP TRIGGER IF EXISTS update_health_daily_updated_at ON health_daily;
CREATE TRIGGER update_health_daily_updated_at
  BEFORE UPDATE ON health_daily
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_health_settings_updated_at ON health_settings;
CREATE TRIGGER update_health_settings_updated_at
  BEFORE UPDATE ON health_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================
-- RLS — kullanıcı sadece kendi sağlık verisini görür
-- ============================
ALTER TABLE health_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "health_daily_own" ON health_daily;
CREATE POLICY "health_daily_own" ON health_daily
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "health_settings_own" ON health_settings;
CREATE POLICY "health_settings_own" ON health_settings
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
