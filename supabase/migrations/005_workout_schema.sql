-- Migration: 005_workout_schema.sql
-- Spor/Fitness modülü: egzersiz kütüphanesi, antrenman kaydı, set takibi

-- -------------------------------------------------------
-- 1. Kas grupları referans tablosu
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS muscle_groups (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,   -- "Göğüs", "Sırt", "Omuz", vb.
  name_en     TEXT NOT NULL UNIQUE,   -- "Chest", "Back", "Shoulder"
  body_region TEXT NOT NULL           -- 'upper' | 'lower' | 'core' | 'full'
);

-- -------------------------------------------------------
-- 2. Egzersiz kütüphanesi (global + kişisel)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercises (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = global
  name         TEXT NOT NULL,
  name_en      TEXT,
  category     TEXT NOT NULL DEFAULT 'strength',  -- strength | cardio | flexibility | mobility
  muscle_group_id  INT REFERENCES muscle_groups(id),
  secondary_muscle_group_ids INT[] DEFAULT '{}',
  instructions TEXT,                 -- Egzersiz açıklaması / form ipuçları
  met_value    DECIMAL(4,1),         -- MET (metabolik eşdeğer) — kalori hesabı için
  is_bodyweight BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS exercises_category_idx ON exercises(category);
CREATE INDEX IF NOT EXISTS exercises_muscle_group_idx ON exercises(muscle_group_id);

-- -------------------------------------------------------
-- 3. Antrenman seansları
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS workouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  name         TEXT,                 -- "Üst Vücut A", "Bacak Günü", vb.
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'planned', -- planned | in_progress | completed | skipped
  duration_minutes INT,              -- Toplam süre (tamamlandıktan sonra doldurulur)
  total_calories_burned INT,         -- Yakılan kalori tahmini
  ai_plan      JSONB DEFAULT '[]',   -- AI antrenör önerileri
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workouts_user_date_idx ON workouts(user_id, date);

-- -------------------------------------------------------
-- 4. Antrenman setleri (her egzersizin her seti)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS workout_sets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id    UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id   UUID NOT NULL REFERENCES exercises(id),
  set_number    INT NOT NULL DEFAULT 1,
  reps          INT,                  -- Tekrar sayısı (kuvvet egzersizleri)
  weight_kg     DECIMAL(5,2),         -- Ağırlık (0 = vücut ağırlığı)
  duration_seconds INT,               -- Süre (kardiyo / plank vb. için)
  distance_m    INT,                  -- Mesafe (koşu/bisiklet için)
  rest_seconds  INT DEFAULT 60,
  notes         TEXT,
  completed     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workout_sets_workout_idx ON workout_sets(workout_id);

-- -------------------------------------------------------
-- 5. RLS Politikaları
-- -------------------------------------------------------

-- muscle_groups: herkes okuyabilir
ALTER TABLE muscle_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "muscle_groups_public_read" ON muscle_groups FOR SELECT USING (TRUE);

-- exercises: global (user_id NULL) herkes okur, kişisel olanı sadece sahibi
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exercises_read" ON exercises FOR SELECT
  USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "exercises_insert" ON exercises FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "exercises_update" ON exercises FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY "exercises_delete" ON exercises FOR DELETE
  USING (user_id = auth.uid());

-- workouts: sadece sahibi
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workouts_own" ON workouts FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- workout_sets: workout üzerinden kontrol
ALTER TABLE workout_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workout_sets_own" ON workout_sets FOR ALL
  USING (
    workout_id IN (SELECT id FROM workouts WHERE user_id = auth.uid())
  )
  WITH CHECK (
    workout_id IN (SELECT id FROM workouts WHERE user_id = auth.uid())
  );

-- -------------------------------------------------------
-- 6. Realtime
-- -------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE workouts;
ALTER PUBLICATION supabase_realtime ADD TABLE workout_sets;

-- -------------------------------------------------------
-- 7. Updated_at trigger (workouts)
-- -------------------------------------------------------
CREATE TRIGGER workouts_updated_at
  BEFORE UPDATE ON workouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
