-- 043 — Model tahminli yiyecekler ve kişisel sözlük
--
-- 032 modelin besin değeri ÜRETMESİNİ yapısal olarak yasakladı: kalori yalnızca
-- bir veritabanı satırından hesaplanabiliyor. Bu yasak "AI kalori uydurdu"
-- hatasını gerçekten bitirdi ama bir maliyeti vardı: sözlükte olmayan yiyecek
-- hiç kaydedilemiyor. Ölçülen sonuç — "pişi" yazan kullanıcı bir soru alıyor,
-- soruya verecek doğru cevabı da yok, çünkü kapalı listede pişi YOK.
--
-- Bu migration yasağı kaldırmıyor, yasağın kapsamını daraltıyor. Yeni kural:
--
--   Model hâlâ bir ÖĞÜN KALEMİNİN kalorisini yazamaz. Yazabildiği tek şey, bir
--   YİYECEĞİN 100 gramının referans değeridir — ve o değer öğüne doğrudan
--   gitmez, önce bu tabloya bir SATIR olarak yazılır. Öğün kalemi yine
--   satırdan hesaplanır (per100g × gram / 100).
--
-- Kazanç sadece kapsama değil, izlenebilirlik: tahmin bir kez yapılır, nereden
-- geldiği (model, tarih, gerekçe, güven) satırda durur, kullanıcı düzeltebilir,
-- ve aynı kelime bir daha modele sorulmaz. Serbest üretimle farkı bu: uydurulan
-- sayı kaybolur, satır hesap verir.
--
-- Provenans zorunlu. source alanı olmadan bir gün "bu 340 kcal nereden geldi?"
-- sorusunun cevabı olmaz; küratörlü satırla model tahmini aynı görünür.

-- ============================
-- Provenans
-- ============================
ALTER TABLE food_items
  ADD COLUMN IF NOT EXISTS source              TEXT NOT NULL DEFAULT 'curated',
  ADD COLUMN IF NOT EXISTS estimate_model      TEXT,
  ADD COLUMN IF NOT EXISTS estimate_note       TEXT,
  ADD COLUMN IF NOT EXISTS estimate_confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS estimated_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at        TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'food_items_source_check'
  ) THEN
    ALTER TABLE food_items ADD CONSTRAINT food_items_source_check
      CHECK (source IN ('curated', 'user', 'ai_estimate'));
  END IF;
END
$$;

COMMENT ON COLUMN food_items.source IS
  'curated = elle gözden geçirilmiş global satır | user = kullanıcının kendi girdiği | ai_estimate = model tahmini, kullanıcı onaylayana kadar geçici.';
COMMENT ON COLUMN food_items.estimate_note IS
  'Modelin tahmini neye dayandırdığı (benzer yiyecek, pişirme biçimi). "Bu sayı nereden geldi" sorusunun cevabı.';
COMMENT ON COLUMN food_items.confirmed_at IS
  'Kullanıcı bu satırı öğününde onayladığı an. NULL ise tahmin hâlâ doğrulanmamıştır.';

-- Kişisel sözlükte aynı isim iki kez olmamalı: ikinci "pişi" kaydı, ilkinin
-- düzeltilmesini sessizce etkisiz kılar.
CREATE UNIQUE INDEX IF NOT EXISTS food_items_user_name_key
  ON food_items (user_id, name)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_food_items_source
  ON food_items (source)
  WHERE source = 'ai_estimate';

-- ============================
-- food_gaps: eksik sebepler
-- ============================
-- 'item_limit' kodda ÜRETİLİYOR (index.ts, MAX_ITEMS taşması) ama CHECK
-- listesinde yoktu: record_food_gap her seferinde patlıyor, çağrı try/catch
-- içinde olduğu için de sessizce yutuluyordu. Yani 30 kalemi aşan öğünlerin
-- düşen kalemleri hiçbir kuyruğa yazılmamış.
ALTER TABLE food_gaps DROP CONSTRAINT IF EXISTS food_gaps_reason_check;
ALTER TABLE food_gaps ADD CONSTRAINT food_gaps_reason_check
  CHECK (reason IN (
    'unresolved',      -- hiçbir katmanda aday yok
    'uncurated_food',  -- yalnızca korpus adayı var, küratörlük bekliyor
    'portion_unknown', -- yiyecek belli, gramaj belli değil
    'item_limit',      -- kalem sınırını aştı, öğüne girmedi
    'ai_estimated'     -- model tahmin etti; insan gözden geçirmeli
  ));

-- ============================
-- Tahmini satır yazma
-- ============================
-- RPC olmasının sebebi: parse-meal'ın veri katmanı (repo.ts) bilerek yalnızca
-- select + rpc arayüzüne sahip — böylece Node tarafındaki eval sahte bir repo
-- geçebiliyor ve çekirdek hat Supabase istemcisine bağlanmıyor. Tek bir insert
-- için o arayüzü genişletmek yerine yazma işi buraya alındı.
--
-- Makul olmayan değer REDDEDİLİR, sessizce kırpılmaz. Kırpma, yanlış bir sayıyı
-- makul görünen başka bir yanlış sayıya çevirir; hata o noktadan sonra
-- teşhis edilemez. 900 kcal/100 g sınırı saf yağın (884) hemen üstünde: hiçbir
-- gerçek yiyecek bunu geçemez.
CREATE OR REPLACE FUNCTION save_estimated_food(
  p_user         UUID,
  p_name         TEXT,
  p_name_en      TEXT,
  p_aliases      TEXT[],
  p_serving_size NUMERIC,
  p_serving_unit TEXT,
  p_calories     NUMERIC,
  p_protein      NUMERIC,
  p_carbs        NUMERIC,
  p_fat          NUMERIC,
  p_fiber        NUMERIC,
  p_category     TEXT,
  p_is_countable BOOLEAN,
  p_model        TEXT,
  p_note         TEXT,
  p_confidence   NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id       UUID;
  v_per100   NUMERIC;
  v_name     TEXT := NULLIF(btrim(p_name), '');
  v_size     NUMERIC := GREATEST(COALESCE(p_serving_size, 100), 1);
BEGIN
  IF p_user IS NULL OR v_name IS NULL THEN
    RAISE EXCEPTION 'save_estimated_food: user ve name zorunlu';
  END IF;

  v_per100 := (COALESCE(p_calories, 0) * 100.0) / v_size;
  IF v_per100 < 0 OR v_per100 > 900 THEN
    RAISE EXCEPTION 'save_estimated_food: 100 g başına % kcal makul değil (%)', round(v_per100), v_name;
  END IF;

  INSERT INTO food_items (
    user_id, name, name_en, aliases, serving_size, serving_unit,
    calories, protein, carbs, fat, fiber, category,
    is_verified, is_countable,
    source, estimate_model, estimate_note, estimate_confidence, estimated_at
  )
  VALUES (
    p_user, v_name, NULLIF(btrim(COALESCE(p_name_en, '')), ''), COALESCE(p_aliases, '{}'),
    v_size, COALESCE(NULLIF(p_serving_unit, ''), 'g'),
    ROUND(COALESCE(p_calories, 0))::INTEGER,
    GREATEST(COALESCE(p_protein, 0), 0), GREATEST(COALESCE(p_carbs, 0), 0),
    GREATEST(COALESCE(p_fat, 0), 0), GREATEST(COALESCE(p_fiber, 0), 0),
    COALESCE(NULLIF(p_category, ''), 'other'),
    FALSE, COALESCE(p_is_countable, FALSE),
    'ai_estimate', p_model, p_note, p_confidence, NOW()
  )
  ON CONFLICT (user_id, name) WHERE user_id IS NOT NULL
  DO UPDATE SET
    -- Kullanıcı bir kez onayladıysa (confirmed_at dolu) tahmin ONU EZMEZ.
    -- Ezseydi, düzeltilen her gramaj bir sonraki öğünde geri alınırdı.
    name_en             = CASE WHEN food_items.confirmed_at IS NULL THEN EXCLUDED.name_en             ELSE food_items.name_en END,
    serving_size        = CASE WHEN food_items.confirmed_at IS NULL THEN EXCLUDED.serving_size        ELSE food_items.serving_size END,
    serving_unit        = CASE WHEN food_items.confirmed_at IS NULL THEN EXCLUDED.serving_unit        ELSE food_items.serving_unit END,
    calories            = CASE WHEN food_items.confirmed_at IS NULL THEN EXCLUDED.calories            ELSE food_items.calories END,
    protein             = CASE WHEN food_items.confirmed_at IS NULL THEN EXCLUDED.protein             ELSE food_items.protein END,
    carbs               = CASE WHEN food_items.confirmed_at IS NULL THEN EXCLUDED.carbs               ELSE food_items.carbs END,
    fat                 = CASE WHEN food_items.confirmed_at IS NULL THEN EXCLUDED.fat                 ELSE food_items.fat END,
    fiber               = CASE WHEN food_items.confirmed_at IS NULL THEN EXCLUDED.fiber               ELSE food_items.fiber END,
    is_countable        = CASE WHEN food_items.confirmed_at IS NULL THEN EXCLUDED.is_countable        ELSE food_items.is_countable END,
    estimate_model      = EXCLUDED.estimate_model,
    estimate_note       = EXCLUDED.estimate_note,
    estimate_confidence = EXCLUDED.estimate_confidence,
    estimated_at        = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION save_estimated_food IS
  'Model tahminli bir yiyeceği kullanıcının kişisel sözlüğüne yazar. 100 g başına 900 kcal üstü reddedilir. Kullanıcı onayladıysa (confirmed_at) tahmin üzerine yazmaz.';

GRANT EXECUTE ON FUNCTION save_estimated_food(
  UUID, TEXT, TEXT, TEXT[], NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, TEXT, BOOLEAN, TEXT, TEXT, NUMERIC
) TO service_role;

-- ============================
-- Onay işaretleme
-- ============================
-- Kullanıcı tahmini öğününde onayladığında satır "geçici" olmaktan çıkar.
-- Kendi satırı olduğu için RLS yeterli; SECURITY DEFINER'a gerek yok.
CREATE OR REPLACE FUNCTION confirm_estimated_food(p_food_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE food_items
     SET confirmed_at = NOW()
   WHERE id = p_food_id
     AND user_id = auth.uid()
     AND confirmed_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION confirm_estimated_food(UUID) TO authenticated, service_role;
