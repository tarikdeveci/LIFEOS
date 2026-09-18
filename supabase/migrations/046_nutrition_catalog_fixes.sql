-- ============================
-- 046: Beslenme kataloğu düzeltmeleri ve kalemsiz öğün engeli
-- ============================
--
-- Prod verisinde (14-15 Eylül öğünleri, nutrition_feedback) ölçülen hatalar.
-- Her bölüm kendi kanıtını taşıyor; hepsi tekrar çalıştırılabilir.


-- ----------------------------
-- 1) 008 partisinin kalan porsiyon/100 g karışması
-- ----------------------------
--
-- 039 bu sınıfın yalnızca FİZİKSEL OLARAK İMKÂNSIZ görünen satırlarını
-- düzeltti (makro toplamı porsiyonu aşıyor, ya da 900 kcal/100 g üstü). Aynı
-- partide porsiyonu 100 g'dan BÜYÜK olan satırlar hiçbir sınıra takılmıyor:
-- hata ters yönde, kalori EKSİK çıkıyor ve sayı yine makul görünüyor.
--
-- Prod örneği: "basmati pirinç pilavı" 150 g = 130 kcal yazıldı. Pişmiş beyaz
-- pirincin 100 g değeri 130 kcal; 150 g = 195 kcal olmalıydı. Süt, yoğurt,
-- meyve, balık, et ve pişmiş tahılların hepsi gerçeğin %50-67'si okunuyordu.
--
-- KANIT: aşağıdaki her satırın calories değeri, yiyeceğin yaygın referans
-- tablolarındaki 100 g (sıvılarda 100 ml) değeriyle birebir örtüşüyor ve 008'deki
-- ilk değerinden hiç değişmemiş:
--   Beyaz Pirinç (pişmiş) 130, Esmer Pirinç (pişmiş) 111, Bulgur (pişmiş) 83,
--   Süt (yarım yağlı) 46, Süt (yağsız) 35, Yoğurt (tam) 61, Kefir 41,
--   Armut 57, Kavun 34, Şeftali 39, Kayısı 48, İncir 74, Kivi 61, Ananas 50,
--   Avokado 160, Somon 208, Levrek 124, Dana Antrikot 271, Patates (haşlanmış) 86,
--   Brokoli 34, Kabak 17, Patlıcan 25, Domates 18, Portakal suyu 45, Elma suyu 46.
-- Levrek için ikinci kanıt katalogdaki doğru ikizi: "Balık (levrek, ızgara)"
-- 100 g = 124 kcal.
--
-- LİSTEDE OLMAYANLAR bilerek dışarıda: Beyaz Ekmek (dilim) 79/30 g, Çavdar
-- Ekmeği 65/30 g, Tortilla 146/45 g, Latte 120/240 ml, Protein Shake 120/300 ml,
-- Protein Bar, Rulo Sandviç, Dürüm, Pide gerçekten porsiyon değeri (ekmeğin 100 g
-- değeri 79 olamaz). Türk Kahvesi 15/60 ml belirsiz, dokunulmadı.
--
-- Koşuldaki eski kalori + eski porsiyon eşleşmesi migration'ı tekrar
-- çalıştırılabilir kılar: ölçeklenmiş satır koşulu artık sağlamaz.

UPDATE food_items AS f SET
  calories = GREATEST(round(f.calories * f.serving_size / 100.0)::int, 1),
  protein  = round(f.protein * f.serving_size / 100.0, 1),
  carbs    = round(f.carbs   * f.serving_size / 100.0, 1),
  fat      = round(f.fat     * f.serving_size / 100.0, 1),
  fiber    = round(f.fiber   * f.serving_size / 100.0, 1)
FROM (VALUES
  ('Süt (yarım yağlı)',      46, 200),
  ('Süt (yağsız)',           35, 200),
  ('Yoğurt (tam)',           61, 150),
  ('Yoğurt (light)',         42, 150),
  ('Labne',                 175,  50),
  ('Kefir',                  41, 200),
  ('Armut',                  57, 150),
  ('Kavun',                  34, 200),
  ('Şeftali',                39, 150),
  ('Kayısı',                 48,  80),
  ('İncir',                  74,  80),
  ('Kivi',                   61,  80),
  ('Ananas',                 50, 150),
  ('Avokado',               160,  80),
  ('Hindi Göğsü (ızgara)',  135, 150),
  ('Somon',                 208, 150),
  ('Levrek',                124, 150),
  ('Çipura',                112, 150),
  ('Dana Antrikot',         271, 150),
  ('Tavuk But',             215, 150),
  ('Beyaz Pirinç (pişmiş)', 130, 150),
  ('Esmer Pirinç (pişmiş)', 111, 150),
  ('Bulgur (pişmiş)',        83, 150),
  ('Tam Buğday Makarna',    149, 150),
  ('Patates (haşlanmış)',    86, 150),
  ('Tatlı Patates',          90, 150),
  ('Brokoli',                34, 150),
  ('Kabak',                  17, 150),
  ('Patlıcan',               25, 150),
  ('Domates (büyük)',        18, 150),
  ('Portakal Suyu (taze)',   45, 200),
  ('Elma Suyu',              46, 200)
) AS v(name, old_calories, old_serving)
WHERE f.user_id IS NULL
  AND f.name = v.name
  AND f.calories = v.old_calories
  AND f.serving_size = v.old_serving;


-- ----------------------------
-- 2) "protein tozu" iki satırda alias'tı
-- ----------------------------
--
-- Prod (14 Eylül): "26g protein tozu" → 10 kcal, 2.2 g protein. Alias hem toz
-- satırında ("Protein shake", 30 g = 120 kcal) hem 300 ml içecek satırında
-- ("Protein Shake", 40 kcal/100 ml) vardı. Sözlük indeksi eşit ağırlıkta id
-- sırasına bakıyor ve içecek satırı kazanıyordu.
--
-- Toz satırının adı da yanıltıcıydı; listede "Protein shake" görünen şey tozun
-- kendisi. İçecek satırı "protein shake" adıyla kalıyor.

UPDATE food_items SET
  name = 'Protein tozu (whey)',
  name_en = 'Whey protein powder',
  aliases = ARRAY['protein tozu', 'whey', 'whey protein', 'protein', 'protein tozu whey']
WHERE user_id IS NULL
  AND name = 'Protein shake'
  AND serving_unit = 'g';

UPDATE food_items SET
  aliases = array_remove(aliases, 'protein tozu')
WHERE user_id IS NULL
  AND name = 'Protein Shake'
  AND serving_unit = 'ml';


-- ----------------------------
-- 3) Eksik ev yemekleri
-- ----------------------------
--
-- Prod (14 Eylül): "etli yeşil fasulye" katalogda karşılığı olmadığı için soruya
-- düştü; kullanıcı eldeki en yakın satırı (kuru fasulye değeri, 127 kcal/100 g,
-- 9 g protein) seçti ve bu seçim alias olarak kalıcılaştı. "pastırmalı tost" da
-- aynı yoldan kaşarlı tosta bağlandı.
--
-- Değerler bileşenlerden hesaplandı (TürKomp KULLANILMADI, lisans):
--
-- Etli taze fasulye, pişmiş ~1150 g tencere:
--   500 g taze fasulye (31 kcal/100 g), 250 g dana kuşbaşı (180), 150 g soğan (40),
--   150 g domates (18), 30 g salça (82), 27 g zeytinyağı (884)
--   = 956 kcal, P 63.5, K 60.3, Y 56.2, lif 19.1  →  100 g: 83 kcal
--   Porsiyon 250 g (bir kase).
--
-- Zeytinyağlı taze fasulye, pişmiş ~950 g tencere:
--   500 g taze fasulye, 150 g soğan, 300 g domates, 54 g zeytinyağı, 5 g şeker
--   = 766 kcal, P 13.5, K 65.6, Y 55.9, lif 19.7  →  100 g: 81 kcal
--   Porsiyon 200 g.
--
-- Pastırmalı tost, 1 adet 117 g:
--   50 g tost ekmeği (268 kcal/100 g), 30 g kaşar (390), 30 g pastırma (260),
--   7 g tereyağı (717)
--   = 379 kcal, P 25.7, K 26.3, Y 18.7, lif 1.2

INSERT INTO food_items (name, name_en, calories, protein, carbs, fat, fiber, serving_size, serving_unit, category, aliases, is_countable)
SELECT v.name, v.name_en, v.calories, v.protein, v.carbs, v.fat, v.fiber, v.serving_size, v.serving_unit, v.category, v.aliases, v.is_countable
FROM (VALUES
  ('Etli taze fasulye', 'Green beans with beef', 208, 13.8, 13.1, 12.2, 4.1, 250, 'g', 'protein',
    ARRAY['etli taze fasulye', 'etli yeşil fasulye', 'etli taze fasulye yemeği'], false),
  ('Zeytinyağlı taze fasulye', 'Green beans in olive oil', 161, 2.8, 13.8, 11.8, 4.1, 200, 'g', 'vegetable',
    ARRAY['zeytinyağlı taze fasulye', 'zeytinyağlı fasulye', 'taze fasulye', 'yeşil fasulye', 'green beans'], false),
  ('Pastırmalı tost', 'Toast with pastrami and cheese', 379, 25.7, 26.3, 18.7, 1.2, 117, 'g', 'grain',
    ARRAY['pastırmalı tost', 'pastırmalı kaşarlı tost', 'kaşarlı pastırmalı tost'], true)
) AS v(name, name_en, calories, protein, carbs, fat, fiber, serving_size, serving_unit, category, aliases, is_countable)
WHERE NOT EXISTS (
  SELECT 1 FROM food_items fi WHERE fi.name = v.name AND fi.user_id IS NULL
);


-- ----------------------------
-- 4) Porsiyon başına adet
-- ----------------------------
--
-- Prod (15 Eylül, wrong_macros): "Dolma ve yoğurt" → dolma 120 g / 160 kcal.
-- Sayılabilir satırlarda serving_size TEK PARÇAYI tutuyor ("3 dolma" = 3 × 120 g
-- doğru çıksın diye). Ama miktar yazılmadığında ya da "1 porsiyon" dendiğinde
-- aynı değer porsiyon sayılıyordu: bir tabak dolma tek biber, bir porsiyon sarma
-- tek yaprak (25 g) oluyordu.
--
-- portion_count: miktarsız ya da "porsiyon/tabak" ile yazılan kalemde kaç parça
-- varsayılacağı. NULL = 1, yani mevcut satırların davranışı değişmez. Adetle
-- yazılan kalem ("5 sarma") bu kolonu hiç okumaz.

ALTER TABLE food_items
  ADD COLUMN IF NOT EXISTS portion_count SMALLINT
  CHECK (portion_count IS NULL OR portion_count > 0);

COMMENT ON COLUMN food_items.portion_count IS
  'Sayılabilir satırda bir porsiyonun kaç parça olduğu. NULL = 1.';

UPDATE food_items AS f SET portion_count = v.pieces
FROM (VALUES
  ('Biber dolması (etli)', 3),
  ('Kabak dolması',        3),
  ('Yaprak sarma',         6),
  ('Midye dolma',          6),
  ('Lokma tatlısı',        6),
  ('Sigara böreği',        3),
  ('Tulumba tatlısı',      4),
  ('Mercimek köftesi',     4),
  ('Kuru köfte',           4),
  ('Şekerpare',            2)
) AS v(name, pieces)
WHERE f.user_id IS NULL
  AND f.name = v.name
  AND f.is_countable = true;


-- ----------------------------
-- 5) Kalemsiz öğün engeli
-- ----------------------------
--
-- Prod'da 12 öğün items = [] ve 0 kcal ile kayıtlı (son örnek 3 Eylül). Kaynak
-- App Store'daki 1.0 mobil sürüm: "Kaydet" butonu koşulsuzdu, çözümleme Pro'ya
-- kilitliydi, ücretsiz kullanıcının yazdığı metin kalemsiz kaydediliyordu.
-- Güncel istemciler butonu kilitliyor ama eski sürümler hâlâ yazabiliyor.
--
-- Sessizce 0 kcal yazmak, hata göstermekten kötü: kullanıcı öğünü girdiğini
-- sanıyor, günlük toplam yanlış. NOT VALID: mevcut 12 satır silinmiyor ve
-- doğrulanmıyor, kural yalnızca yeni yazımlara uygulanıyor.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meals_items_not_empty'
  ) THEN
    ALTER TABLE meals
      ADD CONSTRAINT meals_items_not_empty
      CHECK (
        CASE WHEN jsonb_typeof(items) = 'array'
          THEN jsonb_array_length(items) > 0
          ELSE false
        END
      ) NOT VALID;
  END IF;
END $$;
