-- ============================
-- 034 — Kurate yiyecek verisi düzeltmeleri
-- ============================
--
-- seed.sql yalnızca `db:reset` ile uygulanır, canlı satırlara dokunmaz. Bu
-- yüzden düzeltmeler burada UPDATE olarak yazılıyor. Hiçbir satır SİLİNMİYOR:
-- meals.items içindeki food_item_id referansları kırılmasın.
--
-- Denetim 63 kurate satırın tamamı üzerinde yapıldı. Kalori değerlerinin büyük
-- çoğunluğu USDA ile örtüşüyor (domates 18, brokoli 35, muz 89, badem 577 ...).
-- Aşağıdakiler kanıtlanabilir hatalardı.

-- ----------------------------------------------------------------
-- 1) Pilav — sade pirincin değeri girilmiş, tereyağı hesaba katılmamış
-- ----------------------------------------------------------------
-- USDA FNDDS "Rice, white, cooked, fat added" = 148 kcal/100g (P2.6 C27.2 F2.8).
-- Kayıtlı değer 130 kcal/100g ile sade haşlanmış pirinçti. Türk pilavı yağla
-- yapılır; bu fark "pilav üstü döner" gibi tabaklarda toplamı sistematik olarak
-- düşük gösteriyordu.
UPDATE food_items SET
  calories = 222, protein = 3.9, carbs = 40.8, fat = 4.2, fiber = 0.6
WHERE user_id IS NULL AND name = 'Pilav (pirinç)';

-- ----------------------------------------------------------------
-- 2) Yumurta (haşlanmış) — porsiyon ile değerler tutarsızdı
-- ----------------------------------------------------------------
-- 78 kcal ve 6.3 g protein tam olarak 50 g'lık (bir adet iri) yumurtanın
-- değerleri; porsiyon 60 g yazıldığı için satır kendi içinde %16 çelişiyordu.
-- USDA "Egg, whole, cooked, hard-boiled" = 155 kcal/100g ile doğrulandı.
UPDATE food_items SET serving_size = 50
WHERE user_id IS NULL AND name = 'Yumurta (haşlanmış)';

-- ----------------------------------------------------------------
-- 3) "Mango" aslında bir içecek
-- ----------------------------------------------------------------
-- Satır 330 ml / 150 kcal ve alias'ları arasında 'fusetea mango' var: bu bir
-- Fuse Tea Mango. Ama adı 'Mango', kategorisi 'fruit' ve alias'ı 'mango'
-- olduğu için meyveyi arayan kullanıcı buzlu çay alıyordu. 'muz gibi' alias'ı
-- ise anlamsız ve "muz" geçen ifadeleri kaçırma riski taşıyor.
UPDATE food_items SET
  name = 'Mango içeceği (Fuse Tea)',
  aliases = ARRAY['fusetea mango', 'fuse tea mango', 'mango icecegi', 'mango içeceği'],
  category = 'beverage'
WHERE user_id IS NULL AND name = 'Mango';

-- ----------------------------------------------------------------
-- 4) Restoran ürünleri genel terimleri kaçırıyordu
-- ----------------------------------------------------------------
-- Satırlar kalsın (geçmiş öğünler onlara bağlı olabilir) ama 'tavuk burger' ve
-- 'smash burger' gibi genel alias'lar belirli bir menü kalemine yönlendirmesin.
UPDATE food_items SET aliases = ARRAY['sweetchill tavuk burger', 'sweetchill burger']
WHERE user_id IS NULL AND name = 'Sweetchill Tavuk Burger';

UPDATE food_items SET aliases = ARRAY['triplex smash burger', 'triplex burger']
WHERE user_id IS NULL AND name = 'Triplex Smash Burger';

-- ----------------------------------------------------------------
-- 5) Eksik Türk salataları
-- ----------------------------------------------------------------
-- Bunlar bileşik tabaklar; USDA korpusunda karşılıkları yok, kurate katmana
-- girmeleri gerekiyor. Değerler bileşenlerden toplanarak üretildi (USDA/100g:
-- domates 18, salatalık 15, soğan 40, biber 20, maydanoz 36, roka 25,
-- semizotu 20, yoğurt 61, zeytinyağı 884) — böylece her sayı denetlenebilir.
INSERT INTO food_items (name, aliases, serving_size, serving_unit, calories, protein, carbs, fat, fiber, category, is_verified)
VALUES
  -- 200g: domates 80 + salatalık 60 + soğan 20 + biber 20 + maydanoz 5 + zeytinyağı 10ml
  ('Çoban salatası', ARRAY['çoban salatası','coban salatasi','çoban salata','coban salata'],
   200, 'g', 126, 1.7, 8.4, 10.3, 2.1, 'vegetable', true),
  -- 150g: roka 100 + zeytinyağı 10ml + limon
  ('Roka salatası', ARRAY['roka salatası','roka salatasi','roka salata'],
   150, 'g', 114, 2.6, 4.0, 10.7, 1.6, 'vegetable', true),
  -- 200g: semizotu 120 + yoğurt 70 + zeytinyağı 5ml
  ('Semizotu salatası (yoğurtlu)', ARRAY['semizotu salatası','semizotu salatasi','semizotu','yoğurtlu semizotu'],
   200, 'g', 111, 4.9, 7.3, 7.6, 0.9, 'vegetable', true)
ON CONFLICT DO NOTHING;
