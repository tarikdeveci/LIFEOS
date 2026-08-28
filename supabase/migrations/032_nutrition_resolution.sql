-- Migration 032: Beslenme çözümleme altyapısı
--
-- parse-meal eskiden eşleşmeyen her parçayı modele veriyor, model de kalori/makro
-- SAYISI üretiyordu. Yani "AI kalori uydurdu" yapısal olarak mümkün bir hataydı ve
-- tek koruma 10.000 kcal üst sınırıydı. Yeni hat bu yetkiyi tamamen kaldırıyor:
-- besin değeri YALNIZCA bir veritabanı satırından (per-100g × gram / 100) hesaplanır.
-- Modelin işi tarif etmek (hangi kelime, ne kadar) ve kapalı bir listeden seçmek.
--
-- Bunun bedeli kapsama: küratörlü tablo (~220 satır) gerçek tabakları karşılamıyor.
-- Bu yüzden ikinci bir katman geliyor: food_corpus — USDA FoodData Central referans
-- satırları (public domain). Küratörlü katmanın aksine bu satırları kimse tek tek
-- okumadı, o yüzden ASLA doğrudan kabul edilmez: her korpus eşleşmesi ya bir model
-- doğrulayıcıdan ya da kullanıcının kendisinden onay almak zorundadır (uygulama
-- tarafında confidence tavanı 0.6 → otomatik loglanamaz).
--
-- Ayrıca üç küçük öğrenme tablosu: kullanıcının düzelttiği isim (food_aliases) ve
-- onayladığı porsiyon (portion_memory) bir daha modele sorulmaz; çözülemeyenler
-- food_gaps'e düşer — bu kuyruk global gıda veritabanının büyüme listesidir.

-- ============================
-- Uzantılar
-- ============================
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ============================
-- food_corpus — küratörsüz referans katmanı (per 100 g)
-- ============================
CREATE TABLE IF NOT EXISTS food_corpus (
  fdc_id        TEXT PRIMARY KEY,
  description   TEXT NOT NULL,
  -- description'ın küçük harfli, noktalamasız hali; arama bunun üstünden yapılır
  search_text   TEXT NOT NULL,
  -- sr_legacy: analiz edilmiş hammaddeler | survey (FNDDS): insanların yediği YEMEKLER
  -- | foundation: az satır, en derin analiz. Branded Foods kasıtlı olarak dışarıda:
  -- iki milyon paketli ürün, ve o soruyu etikette yazan barkod zaten cevaplıyor.
  dataset       TEXT NOT NULL CHECK (dataset IN ('sr_legacy', 'survey', 'foundation')),
  kcal          NUMERIC(7,2) NOT NULL CHECK (kcal >= 0),
  protein       NUMERIC(6,2) NOT NULL DEFAULT 0,
  carbs         NUMERIC(6,2) NOT NULL DEFAULT 0,
  fat           NUMERIC(6,2) NOT NULL DEFAULT 0,
  fiber         NUMERIC(6,2) NOT NULL DEFAULT 0,
  -- FDC'nin bildirdiği ev ölçüsü gramajları (varsa). Porsiyon merdiveninde kullanılır.
  measure_grams NUMERIC(7,1)[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE food_corpus IS
  'USDA FoodData Central referans satırları (SR Legacy + FNDDS + Foundation), 100 g başına. Public domain. Küratörsüz: doğrulayıcı onayı olmadan besin değeri üretmek için kullanılamaz.';
COMMENT ON COLUMN food_corpus.kcal IS '100 gram başına kalori';

CREATE INDEX IF NOT EXISTS idx_food_corpus_trgm
  ON food_corpus USING gin (search_text extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_food_corpus_dataset ON food_corpus(dataset);

-- ============================
-- food_aliases — kullanıcının düzelttiği isim eşleşmeleri (merdivenin 1. basamağı)
-- ============================
CREATE TABLE IF NOT EXISTS food_aliases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- normalize edilmiş ifade (küçük harf, diakritik katlanmış)
  phrase        TEXT NOT NULL,
  food_item_id  UUID REFERENCES food_items(id) ON DELETE CASCADE,
  corpus_fdc_id TEXT REFERENCES food_corpus(fdc_id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  -- tam olarak bir hedef: ya küratörlü satır ya korpus satırı
  CONSTRAINT food_aliases_one_target CHECK (num_nonnulls(food_item_id, corpus_fdc_id) = 1),
  CONSTRAINT food_aliases_unique_phrase UNIQUE (user_id, phrase)
);

CREATE INDEX IF NOT EXISTS idx_food_aliases_user ON food_aliases(user_id, phrase);

-- ============================
-- portion_memory — kullanıcının onayladığı porsiyon (merdivenin 4. basamağı)
-- ============================
CREATE TABLE IF NOT EXISTS portion_memory (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phrase     TEXT NOT NULL,
  grams      NUMERIC(8,1) NOT NULL CHECK (grams > 0),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, phrase)
);

COMMENT ON TABLE portion_memory IS
  'Kullanıcının elle girdiği gramaj, ifade bazında. Bir sonraki sefer aynı ifade modele sorulmaz.';

-- ============================
-- food_gaps — çözülemeyenlerin küratörlük kuyruğu
-- ============================
CREATE TABLE IF NOT EXISTS food_gaps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  phrase     TEXT NOT NULL,
  reason     TEXT NOT NULL CHECK (reason IN ('unresolved', 'uncurated_food', 'portion_unknown')),
  hits       INTEGER NOT NULL DEFAULT 1,
  last_seen  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT food_gaps_unique UNIQUE (user_id, phrase, reason)
);

CREATE INDEX IF NOT EXISTS idx_food_gaps_reason ON food_gaps(reason, hits DESC);

-- ============================
-- meals: çözümleme izi
-- ============================
ALTER TABLE meals ADD COLUMN IF NOT EXISTS parse_trace JSONB;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS parse_version TEXT;

COMMENT ON COLUMN meals.parse_trace IS
  'Her kalem için hangi basamağın cevapladığı, aday listesi ve güven skorları. 23 Ağustos tipi teşhisler için: neden bu sayı çıktı sorusunun cevabı.';

-- ============================
-- Korpus arama RPC'si
-- ============================
-- Aday üretimi SQL'de (13k satırı belleğe çekmek sürdürülemez), skorlama TypeScript
-- tarafında: sıralama mantığı deterministik ve test edilebilir kalmalı.
CREATE OR REPLACE FUNCTION search_food_corpus(q TEXT, lim INTEGER DEFAULT 25)
RETURNS TABLE (
  fdc_id        TEXT,
  description   TEXT,
  search_text   TEXT,
  dataset       TEXT,
  kcal          NUMERIC,
  protein       NUMERIC,
  carbs         NUMERIC,
  fat           NUMERIC,
  fiber         NUMERIC,
  measure_grams NUMERIC[],
  score         REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    c.fdc_id, c.description, c.search_text, c.dataset,
    c.kcal, c.protein, c.carbs, c.fat, c.fiber, c.measure_grams,
    GREATEST(
      extensions.similarity(c.search_text, lower(q)),
      extensions.word_similarity(lower(q), c.search_text)
    )::REAL AS score
  FROM food_corpus c
  WHERE c.search_text % lower(q)
     OR c.search_text ILIKE '%' || lower(q) || '%'
  ORDER BY score DESC, length(c.search_text) ASC
  LIMIT LEAST(GREATEST(COALESCE(lim, 25), 1), 50);
$$;

COMMENT ON FUNCTION search_food_corpus IS
  'Korpus aday üretimi. Skor yalnızca aday sıralamasıdır — kabul kriteri DEĞİLDİR; kabul için doğrulayıcı (model veya kullanıcı) şart.';

-- ============================
-- Boşluk kuyruğuna yazma
-- ============================
-- Sayaç upsert ile artırılamıyor; aynı ifade tekrar tekrar çözülemiyorsa bunu
-- bilmek istiyoruz — kuyruğun sırası küratörlük önceliğini belirliyor.
CREATE OR REPLACE FUNCTION record_food_gap(p_user UUID, p_phrase TEXT, p_reason TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO food_gaps (user_id, phrase, reason)
  VALUES (p_user, p_phrase, p_reason)
  ON CONFLICT (user_id, phrase, reason)
  DO UPDATE SET hits = food_gaps.hits + 1, last_seen = NOW();
$$;

-- ============================
-- RLS
-- ============================
ALTER TABLE food_corpus    ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_aliases   ENABLE ROW LEVEL SECURITY;
ALTER TABLE portion_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_gaps      ENABLE ROW LEVEL SECURITY;

-- Korpus herkese açık referans veri; yazma yalnızca service role (import script'i)
DROP POLICY IF EXISTS "Authenticated users can read food corpus" ON food_corpus;
CREATE POLICY "Authenticated users can read food corpus"
  ON food_corpus FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Users can CRUD own food aliases" ON food_aliases;
CREATE POLICY "Users can CRUD own food aliases"
  ON food_aliases FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can CRUD own portion memory" ON portion_memory;
CREATE POLICY "Users can CRUD own portion memory"
  ON portion_memory FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own food gaps" ON food_gaps;
CREATE POLICY "Users can read own food gaps"
  ON food_gaps FOR SELECT USING (auth.uid() = user_id);

-- ============================
-- Trigger
-- ============================
CREATE TRIGGER update_food_aliases_updated_at
  BEFORE UPDATE ON food_aliases FOR EACH ROW EXECUTE FUNCTION update_updated_at();

GRANT EXECUTE ON FUNCTION search_food_corpus(TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION record_food_gap(UUID, TEXT, TEXT) TO service_role;
