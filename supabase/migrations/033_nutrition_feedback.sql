-- ============================
-- 033 — Beslenme geri bildirimi
-- ============================
--
-- food_gaps yalnızca hattın ÇÖZEMEDİĞİ ifadeleri yakalar. Asıl kör nokta ise
-- kendinden emin ama yanlış sonuçlardır: "pilav üstü et döner" tek kaleme
-- düşüp "et döner"e oturduğunda hat soru sormaz, gap yazmaz — tabağın yarısı
-- sessizce kaybolur ve kullanıcı 850 kcal yerine 220 kcal görür. O vaka bu
-- tabloya düşer.
--
-- Kullanıcı yalnızca kendi bildirimini yazar ve okur; durum alanını (status)
-- yalnızca service role değiştirir — küratörlük kuyruğu kullanıcıya açık değil.

CREATE TABLE IF NOT EXISTS nutrition_feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Bağlam: hangi öğün, hangi ham girdi, hangi kalem
  meal_id       UUID REFERENCES meals(id) ON DELETE SET NULL,
  raw_input     TEXT,
  phrase        TEXT NOT NULL,

  -- Hattın o kalem için verdiği cevap (bildirim anındaki hâliyle dondurulur;
  -- sözlük sonradan düzelse bile neyin şikâyet edildiği kaybolmasın)
  item_label    TEXT,
  item_source   TEXT CHECK (item_source IN ('curated', 'corpus')),
  item_ref_id   TEXT,
  item_grams    NUMERIC,
  item_kcal     NUMERIC,

  -- Şikâyetin türü
  kind          TEXT NOT NULL CHECK (kind IN (
                  'wrong_food',      -- yanlış yiyeceğe eşleşti
                  'missing_item',    -- girdinin bir parçası hiç eklenmedi
                  'wrong_portion',   -- yiyecek doğru, gramaj yanlış
                  'wrong_macros',    -- yiyecek ve gramaj doğru, besin değeri yanlış
                  'other'
                )),

  -- Kullanıcının düzeltmesi — hepsi opsiyonel, hiçbiri zorunlu değil
  note          TEXT,
  expected_kcal NUMERIC CHECK (expected_kcal IS NULL OR expected_kcal >= 0),
  expected_grams NUMERIC CHECK (expected_grams IS NULL OR expected_grams >= 0),

  -- Teşhis izi: "neden bu sayı çıktı" sorusunun cevabı
  parse_version TEXT,
  trace         JSONB,

  status        TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'triaged', 'fixed', 'rejected')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE nutrition_feedback IS
  'Kullanıcının "bu yanlış" dediği çözümleme sonuçları. food_gaps çözülemeyenleri, bu tablo yanlış çözülenleri toplar.';
COMMENT ON COLUMN nutrition_feedback.trace IS
  'Bildirim anındaki parse_trace kalemi: hangi basamak cevapladı, adaylar neydi, güven neydi.';

-- Küratörlük kuyruğu sırası: önce yeni, en sık şikâyet edilen ifadeler
CREATE INDEX IF NOT EXISTS idx_nutrition_feedback_triage
  ON nutrition_feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nutrition_feedback_phrase
  ON nutrition_feedback(phrase);

-- ============================
-- RLS
-- ============================
ALTER TABLE nutrition_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own nutrition feedback" ON nutrition_feedback;
CREATE POLICY "Users can read own nutrition feedback"
  ON nutrition_feedback FOR SELECT USING (auth.uid() = user_id);

-- Yazma serbest, güncelleme değil: status alanı küratörlüğe ait.
DROP POLICY IF EXISTS "Users can submit own nutrition feedback" ON nutrition_feedback;
CREATE POLICY "Users can submit own nutrition feedback"
  ON nutrition_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
