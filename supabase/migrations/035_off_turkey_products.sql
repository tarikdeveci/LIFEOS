-- ============================
-- 035 — Open Food Facts: Türkiye paketli ürünleri
-- ============================
--
-- USDA korpusu hammadde ve yemek analizidir; paketli Türk ürünü (Sütaş yoğurt,
-- Torku salam, Migros laktozsuz süt) içermez ve içeremez. Bu boşluk Open Food
-- Facts'ten kapatılıyor.
--
-- Ayrı tablo AÇILMIYOR: satırlar food_corpus'a dataset='off' etiketiyle girer.
-- Böylece mevcut çözümleme merdiveni, search_food_corpus RPC'si ve küratörsüz
-- kaynaklar için konmuş 0.6 güven tavanı hiçbir ek iş olmadan uygulanır —
-- kitle kaynaklı veride o tavan zaten doğru davranıştır.
--
-- LİSANS — ODbL (Open Database License).
-- Open Food Facts verisi ODbL altında dağıtılır. Yükümlülükler:
--   • Atıf: veri kaynağı olarak Open Food Facts belirtilmeli (uygulama içinde).
--   • Share-alike: bu veriden türetilen veri tabanı da ODbL altında sunulmalı.
-- dataset='off' etiketi bu satırların ayrıştırılabilir kalmasını sağlar; bu,
-- yükümlülüğün hangi bölüme uygulandığını göstermek için gereklidir.
-- Kaynak: https://world.openfoodfacts.org/data — https://opendatacommons.org/licenses/odbl/

-- ----------------------------------------------------------------
-- dataset kısıtına 'off' ekle
-- ----------------------------------------------------------------
ALTER TABLE food_corpus DROP CONSTRAINT IF EXISTS food_corpus_dataset_check;
ALTER TABLE food_corpus ADD CONSTRAINT food_corpus_dataset_check
  CHECK (dataset IN ('sr_legacy', 'survey', 'foundation', 'off'));

-- ----------------------------------------------------------------
-- Barkod — ileride kamera ile okutma için
-- ----------------------------------------------------------------
ALTER TABLE food_corpus ADD COLUMN IF NOT EXISTS barcode TEXT;

CREATE INDEX IF NOT EXISTS idx_food_corpus_barcode
  ON food_corpus(barcode) WHERE barcode IS NOT NULL;

COMMENT ON COLUMN food_corpus.barcode IS
  'EAN/UPC. Yalnızca dataset=off satırlarında dolu. Paketli üründe doğru cevabı etiket verir; barkod okutma bu kolon üstünden çalışacak.';

COMMENT ON TABLE food_corpus IS
  'Küratörsüz referans katmanı, 100 g başına. dataset sr_legacy/survey/foundation = USDA FoodData Central (public domain); dataset off = Open Food Facts (ODbL, atıf + share-alike zorunlu). Doğrulayıcı onayı olmadan besin değeri üretmek için kullanılamaz.';
