-- supabase/migrations/002_nutrition_schema.sql
-- LifeOS Beslenme: hedefler, öğünler, yiyecek veritabanı

-- ============================
-- Beslenme hedefleri
-- ============================
CREATE TABLE nutrition_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calories INTEGER NOT NULL DEFAULT 2500,
  protein_g INTEGER NOT NULL DEFAULT 150,
  carbs_g INTEGER NOT NULL DEFAULT 300,
  fat_g INTEGER NOT NULL DEFAULT 80,
  fiber_g INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN DEFAULT TRUE,
  -- Spor günü override
  workout_day_calories INTEGER,
  workout_day_protein_g INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kullanıcı başına tek aktif hedef — partial unique index
CREATE UNIQUE INDEX idx_nutrition_targets_active
  ON nutrition_targets(user_id) WHERE is_active = TRUE;

-- ============================
-- Öğün tipi
-- ============================
CREATE TYPE meal_type AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');

-- ============================
-- Öğün kaydı
-- ============================
CREATE TABLE meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type meal_type NOT NULL,
  raw_input TEXT, -- Kullanıcının yazdığı ham metin (AI parse için)

  -- Öğün detayları (AI veya manuel tarafından doldurulan)
  items JSONB DEFAULT '[]'::jsonb,
  -- items format: [{"name": "yumurta", "amount": 2, "unit": "adet",
  --   "calories": 155, "protein": 13, "carbs": 1.1, "fat": 11, "fiber": 0}]

  -- Toplam makro değerler (items'dan hesaplanan)
  total_calories INTEGER DEFAULT 0,
  total_protein NUMERIC(6,1) DEFAULT 0,
  total_carbs NUMERIC(6,1) DEFAULT 0,
  total_fat NUMERIC(6,1) DEFAULT 0,
  total_fiber NUMERIC(6,1) DEFAULT 0,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================
-- Sık kullanılan yiyecekler (kişisel veritabanı)
-- ============================
CREATE TABLE food_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = global
  name TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}', -- Alternatif isimler: ["beyaz peynir", "peynir"]
  serving_size NUMERIC(8,1) NOT NULL DEFAULT 100,
  serving_unit TEXT NOT NULL DEFAULT 'g',
  calories INTEGER NOT NULL,
  protein NUMERIC(6,1) NOT NULL DEFAULT 0,
  carbs NUMERIC(6,1) NOT NULL DEFAULT 0,
  fat NUMERIC(6,1) NOT NULL DEFAULT 0,
  fiber NUMERIC(6,1) NOT NULL DEFAULT 0,
  category TEXT, -- "protein", "carb", "fat", "vegetable", "fruit", "dairy", "grain", "beverage"
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================
-- İndeksler
-- ============================
CREATE INDEX idx_meals_user_date ON meals(user_id, date);
CREATE INDEX idx_food_items_name ON food_items USING gin(to_tsvector('turkish', name));
CREATE INDEX idx_food_items_user ON food_items(user_id);

-- ============================
-- RLS
-- ============================
ALTER TABLE nutrition_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own nutrition targets"
  ON nutrition_targets FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own meals"
  ON meals FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can read global and own food items"
  ON food_items FOR SELECT
  USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users can insert own food items"
  ON food_items FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own food items"
  ON food_items FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own food items"
  ON food_items FOR DELETE
  USING (user_id = auth.uid());

-- ============================
-- Triggers
-- ============================
CREATE TRIGGER update_nutrition_targets_updated_at
  BEFORE UPDATE ON nutrition_targets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_meals_updated_at
  BEFORE UPDATE ON meals FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================
-- Realtime aktif et
-- ============================
ALTER PUBLICATION supabase_realtime ADD TABLE meals;
