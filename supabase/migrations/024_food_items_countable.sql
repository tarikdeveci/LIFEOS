-- food_items.is_countable
--
-- parse-meal, birim belirtilmemiş sayıları "N porsiyon" sayıyordu: "3 yumurta"
-- → 3 × 60g doğru, ama "10 badem" → 10 × 30g = 300g ≈ 1730 kcal çıkıyordu
-- (gerçek ~12g / 70 kcal). Fark, serving_size'ın ne temsil ettiğinde:
--   • tek parça  (yumurta 60g, ekmek dilimi 30g, simit 120g) → sayılabilir
--   • bir ölçü   (badem 30g, zeytin 30g, tavuk göğsü 100g)   → sayılamaz
--
-- Sayılamayan gıdalarda adet ifadesi geçerse tahmin yürütmek yerine AI'ya
-- devrediyoruz; model porsiyon kurallarını zaten biliyor.
--
-- Varsayılan false: bilinmeyen/yeni gıdalar güvenli tarafta kalır.

ALTER TABLE food_items
  ADD COLUMN IF NOT EXISTS is_countable BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN food_items.is_countable IS
  'serving_size tek bir parçayı temsil ediyorsa true (1 yumurta, 1 dilim ekmek, 1 bardak süt). Ölçü/porsiyon temsil ediyorsa false.';

-- Porsiyonu tek parça olan global gıdalar
UPDATE food_items SET is_countable = true
WHERE user_id IS NULL AND name IN (
  -- yumurta, ekmek, unlu mamul
  'Yumurta (haşlanmış)',
  'Yumurta (sahanda)',
  'Ekmek (beyaz, 1 dilim)',
  'Tam buğday ekmeği (1 dilim)',
  'Simit',
  'Lahmacun',
  'Tost (kaşarlı)',
  'Pide (kıymalı)',
  -- meyve (tek adet)
  'Elma',
  'Muz',
  'Portakal',
  -- hazır yemek / tek servis
  'Sweetchill Tavuk Burger',
  'Triplex Smash Burger',
  'İmam bayıldı',
  'Çiğ köfte (1 porsiyon)',
  'Mantı',
  'Kuru fasulye',
  'Nohut yemeği',
  'Mercimek çorbası',
  -- içecek (bardak/kutu/fincan)
  'Su',
  'Süt (tam yağlı)',
  'Çay (şekersiz)',
  'Türk kahvesi (şekersiz)',
  'Ayran',
  -- kaşık ölçüsü
  'Tereyağı (1 yk)',
  'Zeytinyağı (1 yk)',
  'Protein shake'
);
