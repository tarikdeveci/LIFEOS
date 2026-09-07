-- 042 — Semantik (vektörel) yiyecek araması
--
-- Neden gerekti: arama katmanı bugüne kadar tamamen YÜZEYSEL. Trigram ve token
-- örtüşmesi iki kelimenin harflerini karşılaştırır, anlamını değil. Ölçülen
-- sonuç (food_gaps kayıtları, 6 Eylül):
--
--   "pişi"       → korpusta 0 aday. Doughnut, fry bread, fried dough satırları
--                  duruyor; "pisi" ile aralarındaki trigram benzerliği sıfır.
--   "hamur işi"  → 0 aday, aynı sebeple.
--   "roka"       → yalnızca TR_EN_BRIDGE sözlüğünde elle "arugula" yazdığımız
--                  için bulunuyor. Sözlükte olmayan her kelime kör nokta.
--
-- Yani kapsama, elle yazılmış ~150 satırlık bir çeviri sözlüğünün boyu kadar.
-- Gömme vektörleri bu tavanı kaldırıyor: "pişi" ile "fried dough" arasındaki
-- yakınlık sözlükten değil modelin kendisinden geliyor.
--
-- Model: OpenAI text-embedding-3-small, 512 boyuta indirgenmiş (Matryoshka).
-- 1536 yerine 512 seçildi çünkü 14.5k korpus satırı için 89 MB yerine 30 MB
-- yer tutuyor ve geri getirme kalitesindeki kayıp ölçülebilir düzeyde değil.
--
-- KRİTİK: bu katman yeni bir KABUL yetkisi getirmiyor. Semantik yakınlık da
-- tıpkı trigram skoru gibi yalnızca ADAY ÜRETİR; kabul için yine doğrulayıcı
-- (model) veya kullanıcı onayı şart. 032'nin kurduğu güvenlik sözleşmesi aynen
-- geçerli: besin değeri yalnızca bir veritabanı satırından hesaplanır.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ============================
-- Gömme sütunları
-- ============================
-- embedding_text: vektörü ÜRETEN metin. Satır adı/alias'ı değişirse vektör
-- bayatlar; hangi metnin gömüldüğünü saklamadan bunu anlamanın yolu yok.
ALTER TABLE food_items
  ADD COLUMN IF NOT EXISTS embedding      extensions.vector(512),
  ADD COLUMN IF NOT EXISTS embedding_text TEXT;

ALTER TABLE food_corpus
  ADD COLUMN IF NOT EXISTS embedding      extensions.vector(512),
  ADD COLUMN IF NOT EXISTS embedding_text TEXT;

COMMENT ON COLUMN food_items.embedding IS
  'text-embedding-3-small (512d) — embedding_text sütunundaki metnin vektörü. Yalnızca aday üretimi için; kabul kriteri DEĞİL.';
COMMENT ON COLUMN food_items.embedding_text IS
  'Vektörü üreten metin. NULL ya da güncel metinden farklıysa satır yeniden gömülmelidir (scripts/embed-foods.mjs).';

-- ============================
-- İndeksler
-- ============================
-- HNSW + kosinüs. Korpus 14.5k satır: sıralı tarama da çalışır ama her öğün
-- kaleminde bir kez sorgulanıyor, gecikme kalem sayısıyla çarpılıyor.
CREATE INDEX IF NOT EXISTS idx_food_corpus_embedding
  ON food_corpus USING hnsw (embedding extensions.vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_food_items_embedding
  ON food_items USING hnsw (embedding extensions.vector_cosine_ops);

-- ============================
-- Bayatlama koruması
-- ============================
-- Ad, İngilizce ad veya alias değiştiğinde vektör artık o satırı temsil etmiyor.
-- Sessizce eski vektörle aramaya devam etmek, arama sonucunun neden bozulduğunu
-- teşhis edilemez kılar; vektör silinir ve satır backfill kuyruğuna düşer.
CREATE OR REPLACE FUNCTION invalidate_food_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.name_en IS DISTINCT FROM OLD.name_en
     OR NEW.aliases IS DISTINCT FROM OLD.aliases THEN
    NEW.embedding := NULL;
    NEW.embedding_text := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS food_items_embedding_invalidate ON food_items;
CREATE TRIGGER food_items_embedding_invalidate
  BEFORE UPDATE ON food_items
  FOR EACH ROW EXECUTE FUNCTION invalidate_food_embedding();

-- ============================
-- Semantik arama RPC'si
-- ============================
-- İki katman tek çağrıda taranıyor: küratörlü satırlar (kullanıcının kendi
-- kayıtları dahil) ve USDA/OFF korpusu. Sonuç TEK listede dönüyor ki çağıran
-- taraf "önce şuraya bak, bulamazsan şuraya" gibi bir sıra uydurmak zorunda
-- kalmasın — hangi katmanın daha yakın olduğuna benzerlik karar versin.
--
-- Kolonlar iki tablonun BİRLEŞİMİ: korpus satırlarında serving_size/aliases
-- NULL, küratörlü satırlarda dataset/measure_grams NULL. Çağıran taraf `source`
-- alanına bakıp doğru şekli kuruyor (repo.ts).
--
-- Makro sözleşmesi katmana göre değişiyor ve bu BİLEREK korunuyor:
--   curated → makrolar serving_size başına (refs.ts per100gFromCurated çevirir)
--   corpus  → makrolar 100 g başına
-- Burada normalize etmek, 100 g'a çevirme aritmetiğini iki yere kopyalamak
-- olurdu; tek yerde (refs.ts) kalması daha güvenli.
CREATE OR REPLACE FUNCTION search_food_semantic(
  query_embedding extensions.vector(512),
  p_user          UUID DEFAULT NULL,
  lim             INTEGER DEFAULT 12,
  min_similarity  REAL DEFAULT 0.25
)
RETURNS TABLE (
  source        TEXT,
  id            TEXT,
  name          TEXT,
  name_en       TEXT,
  aliases       TEXT[],
  serving_size  NUMERIC,
  serving_unit  TEXT,
  calories      NUMERIC,
  protein       NUMERIC,
  carbs         NUMERIC,
  fat           NUMERIC,
  fiber         NUMERIC,
  category      TEXT,
  is_countable  BOOLEAN,
  dataset       TEXT,
  measure_grams NUMERIC[],
  similarity    REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH capped AS (
    SELECT LEAST(GREATEST(COALESCE(lim, 12), 1), 40) AS n
  ),
  curated AS (
    SELECT
      'curated'::TEXT              AS source,
      f.id::TEXT                   AS id,
      f.name                       AS name,
      f.name_en                    AS name_en,
      f.aliases                    AS aliases,
      f.serving_size::NUMERIC      AS serving_size,
      f.serving_unit               AS serving_unit,
      f.calories::NUMERIC          AS calories,
      f.protein::NUMERIC           AS protein,
      f.carbs::NUMERIC             AS carbs,
      f.fat::NUMERIC               AS fat,
      f.fiber::NUMERIC             AS fiber,
      f.category                   AS category,
      f.is_countable               AS is_countable,
      NULL::TEXT                   AS dataset,
      NULL::NUMERIC[]              AS measure_grams,
      (1 - (f.embedding <=> query_embedding))::REAL AS similarity
    FROM food_items f, capped
    WHERE f.embedding IS NOT NULL
      AND (f.user_id IS NULL OR f.user_id = p_user)
    ORDER BY f.embedding <=> query_embedding
    LIMIT (SELECT n FROM capped)
  ),
  corpus AS (
    SELECT
      'corpus'::TEXT               AS source,
      c.fdc_id                     AS id,
      c.description                AS name,
      NULL::TEXT                   AS name_en,
      NULL::TEXT[]                 AS aliases,
      NULL::NUMERIC                AS serving_size,
      'g'::TEXT                    AS serving_unit,
      c.kcal::NUMERIC              AS calories,
      c.protein::NUMERIC           AS protein,
      c.carbs::NUMERIC             AS carbs,
      c.fat::NUMERIC               AS fat,
      c.fiber::NUMERIC             AS fiber,
      NULL::TEXT                   AS category,
      FALSE                        AS is_countable,
      c.dataset                    AS dataset,
      c.measure_grams::NUMERIC[]   AS measure_grams,
      (1 - (c.embedding <=> query_embedding))::REAL AS similarity
    FROM food_corpus c, capped
    WHERE c.embedding IS NOT NULL
    ORDER BY c.embedding <=> query_embedding
    LIMIT (SELECT n FROM capped)
  )
  SELECT * FROM (
    SELECT * FROM curated
    UNION ALL
    SELECT * FROM corpus
  ) merged
  WHERE merged.similarity >= COALESCE(min_similarity, 0.25)
  ORDER BY merged.similarity DESC
  LIMIT (SELECT n FROM capped);
$$;

COMMENT ON FUNCTION search_food_semantic IS
  'Anlamsal aday üretimi (küratörlü + korpus, tek liste). Benzerlik yalnızca SIRALAMADIR — kabul kriteri değildir; kabul için doğrulayıcı veya kullanıcı onayı şart.';

GRANT EXECUTE ON FUNCTION search_food_semantic(extensions.vector, UUID, INTEGER, REAL)
  TO authenticated, service_role;

-- ============================
-- Toplu gömme yazma
-- ============================
-- 14.5k satırı tek tek PATCH etmek dakikalar sürer ve yarıda kalırsa hangi
-- satırların yazıldığı belirsizleşir. Bu iki fonksiyon backfill script'inin
-- (scripts/embed-foods.mjs) partiler hâlinde yazmasını sağlar; her parti tek
-- işlemdir, ya tamamı yazılır ya hiçbiri.
--
-- p_rows biçimi: [{"id": "...", "text": "...", "embedding": [0.1, ...]}]
-- JSON dizisi ->> ile metne çevrildiğinde "[0.1,0.2]" olur; bu zaten pgvector'ın
-- giriş biçimi, ayrıca dönüşüm gerekmiyor.

CREATE OR REPLACE FUNCTION set_food_item_embeddings(p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE food_items f
     SET embedding      = (r->>'embedding')::extensions.vector,
         embedding_text = r->>'text'
    FROM jsonb_array_elements(p_rows) AS r
   WHERE f.id = (r->>'id')::UUID;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION set_food_corpus_embeddings(p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE food_corpus c
     SET embedding      = (r->>'embedding')::extensions.vector,
         embedding_text = r->>'text'
    FROM jsonb_array_elements(p_rows) AS r
   WHERE c.fdc_id = (r->>'id');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION set_food_item_embeddings(JSONB)   TO service_role;
GRANT EXECUTE ON FUNCTION set_food_corpus_embeddings(JSONB) TO service_role;
