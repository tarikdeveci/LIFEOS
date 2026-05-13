-- Genişletilmiş yiyecek veritabanı — mevcut isimleri tekrar ekleme
-- Kahvaltı, atıştırmalık, tahıl, meyve, içecek kategorileri

INSERT INTO food_items (name, calories, protein, carbs, fat, fiber, serving_size, serving_unit, category, aliases)
SELECT v.name, v.calories, v.protein, v.carbs, v.fat, v.fiber, v.serving_size, v.serving_unit, v.category, v.aliases
FROM (VALUES

-- ── Kahvaltılık tahıllar & granola ──────────────────────────────────────────
('Granola',          471, 12, 64, 20, 7,  100, 'g', 'grain',    ARRAY['granola', 'müsli karışımı']),
('Müsli (sade)',     360, 10, 66,  7, 8,  100, 'g', 'grain',    ARRAY['müsli', 'muesli']),
('Corn Flakes',      375,  7, 84,  1, 3,   30, 'g', 'grain',    ARRAY['mısır gevreği', 'corn flakes']),
('Yulaf Ezmesi',     368, 13, 66,  7, 10,  80, 'g', 'grain',    ARRAY['yulaf', 'oatmeal', 'oat']),
('Tam Buğday Gevreği',340, 12, 68,  3, 11,  40, 'g', 'grain',   ARRAY['buğday kepeği', 'bran flakes']),
('Çikolatalı Gevrek',385,  5, 82,  5,  3,   30, 'g', 'grain',   ARRAY['coco pops', 'choco']),

-- ── Süt ürünleri ────────────────────────────────────────────────────────────
('Süt (tam yağlı)',   61,  3,  5,  3, 0,  200, 'ml', 'dairy',   ARRAY['tam yağlı süt', 'full fat milk']),
('Süt (yarım yağlı)', 46,  3,  5,  2, 0,  200, 'ml', 'dairy',   ARRAY['yarım yağ süt']),
('Süt (yağsız)',      35,  4,  5,  0, 0,  200, 'ml', 'dairy',   ARRAY['yağsız süt', 'skimmed milk']),
('Yoğurt (tam)',      61,  3,  5,  3, 0,  150, 'g',  'dairy',   ARRAY['tam yağlı yoğurt']),
('Yoğurt (light)',    42,  5,  5,  0, 0,  150, 'g',  'dairy',   ARRAY['light yoğurt', 'az yağlı yoğurt']),
('Süzme Yoğurt',      66,  9,  4,  2, 0,  100, 'g',  'dairy',   ARRAY['greek yogurt', 'süzme', 'labne benzeri']),
('Kaşar Peyniri',    390, 25,  1, 31, 0,   30, 'g',  'dairy',   ARRAY['kaşar', 'sarı peynir']),
('Taze Kaşar',       280, 20,  2, 22, 0,   30, 'g',  'dairy',   ARRAY['taze kaşar']),
('Lor Peyniri',      105, 14,  3,  5, 0,  100, 'g',  'dairy',   ARRAY['lor', 'cottage cheese']),
('Labne',            175,  8,  4, 14, 0,   50, 'g',  'dairy',   ARRAY['labne peyniri']),

-- ── Fındık & kuruyemiş ──────────────────────────────────────────────────────
('Badem',            579, 21, 22, 50, 13,  30, 'g',  'other',   ARRAY['çiğ badem', 'almond']),
('Ceviz',            654, 15, 14, 65,  7,  30, 'g',  'other',   ARRAY['walnut']),
('Fıstık (çiğ)',     599, 26, 16, 52,  9,  30, 'g',  'other',   ARRAY['yer fıstığı', 'peanut']),
('Fındık',           628, 15, 17, 61, 10,  30, 'g',  'other',   ARRAY['fındık', 'hazelnut']),
('Kaju',             553, 18, 33, 44,  3,  30, 'g',  'other',   ARRAY['kaju fıstığı', 'cashew']),
('Antep Fıstığı',    560, 20, 28, 45, 11,  30, 'g',  'other',   ARRAY['antep fıstığı', 'pistachio']),
('Çekirdek (kabak)', 559, 30, 11, 49,  6,  30, 'g',  'other',   ARRAY['kabak çekirdeği', 'pumpkin seed']),
('Çekirdek (ay)',    584, 21, 20, 51,  9,  30, 'g',  'other',   ARRAY['ay çekirdeği', 'sunflower seed']),
('Susam',            573, 18, 23, 50, 12,  15, 'g',  'other',   ARRAY['susam tohumu', 'sesame']),

-- ── Meyve ───────────────────────────────────────────────────────────────────
('Elma',              52,  0, 14,  0,  2, 150, 'g',  'fruit',   ARRAY['elma', 'apple']),
('Armut',             57,  0, 15,  0,  3, 150, 'g',  'fruit',   ARRAY['pear']),
('Portakal',          47,  1, 12,  0,  2, 150, 'g',  'fruit',   ARRAY['orange']),
('Mandalina',         53,  1, 13,  0,  2, 100, 'g',  'fruit',   ARRAY['mandarin', 'tangerine']),
('Çilek',             32,  1,  8,  0,  2, 150, 'g',  'fruit',   ARRAY['strawberry']),
('Karpuz',            30,  1,  8,  0,  0, 300, 'g',  'fruit',   ARRAY['watermelon']),
('Kavun',             34,  1,  8,  0,  1, 200, 'g',  'fruit',   ARRAY['melon']),
('Üzüm',              69,  1, 18,  0,  1, 100, 'g',  'fruit',   ARRAY['grape']),
('Kiraz',             50,  1, 12,  0,  2, 100, 'g',  'fruit',   ARRAY['cherry']),
('Şeftali',           39,  1, 10,  0,  1, 150, 'g',  'fruit',   ARRAY['peach']),
('Kayısı',            48,  1, 11,  0,  2,  80, 'g',  'fruit',   ARRAY['apricot']),
('İncir',             74,  1, 19,  0,  3,  80, 'g',  'fruit',   ARRAY['fig']),
('Kivi',              61,  1, 15,  1,  3,  80, 'g',  'fruit',   ARRAY['kiwi']),
('Ananas',            50,  1, 13,  0,  1, 150, 'g',  'fruit',   ARRAY['pineapple']),
('Avokado',          160,  2,  9, 15,  7,  80, 'g',  'fat',     ARRAY['avocado']),
('Hurma',            277,  2, 75,  0,  7,  30, 'g',  'fruit',   ARRAY['date fruit', 'hurma']),
('Kuru Üzüm',        299,  3, 79,  0,  4,  30, 'g',  'fruit',   ARRAY['raisin', 'sultana']),
('Kuru Kayısı',      241,  3, 63,  0,  7,  30, 'g',  'fruit',   ARRAY['dried apricot']),

-- ── Protein kaynakları ──────────────────────────────────────────────────────
('Hindi Göğsü (ızgara)',  135, 30, 0,  2, 0, 150, 'g', 'protein', ARRAY['hindi eti', 'turkey breast']),
('Ton Balığı (konserve)', 116, 26, 0,  1, 0, 100, 'g', 'protein', ARRAY['ton balığı', 'tuna']),
('Somon',                208, 20, 0, 13, 0, 150, 'g', 'protein', ARRAY['salmon']),
('Levrek',               124, 24, 0,  3, 0, 150, 'g', 'protein', ARRAY['sea bass', 'levrek balığı']),
('Çipura',               112, 21, 0,  3, 0, 150, 'g', 'protein', ARRAY['sea bream']),
('Sardalya',             208, 25, 0, 11, 0, 100, 'g', 'protein', ARRAY['sardine']),
('Dana Kıyma (%20 yağ)', 254, 17, 0, 20, 0, 100, 'g', 'protein', ARRAY['kıyma', 'dana kıyma']),
('Dana Antrikot',        271, 26, 0, 18, 0, 150, 'g', 'protein', ARRAY['antrikot', 'ribeye']),
('Tavuk But',            215, 18, 0, 15, 0, 150, 'g', 'protein', ARRAY['tavuk but', 'chicken thigh']),
('Yumurta Akı',           52, 11, 1,  0, 0, 100, 'g', 'protein', ARRAY['yumurta akı', 'egg white']),
('Mercimek (kırmızı)',   116,  9, 20, 0,  8, 100, 'g', 'protein', ARRAY['kırmızı mercimek', 'red lentil']),
('Nohut (haşlanmış)',    164,  9, 27, 3,  8, 100, 'g', 'protein', ARRAY['nohut', 'chickpea']),
('Fasulye (haşlanmış)',  127,  9, 22, 1,  7, 100, 'g', 'protein', ARRAY['fasulye', 'bean']),
('Tofu',                  76,  8,  2, 4,  0, 100, 'g', 'protein', ARRAY['tofu', 'soya peyniri']),

-- ── Tahıllar & ekmek ────────────────────────────────────────────────────────
('Beyaz Pirinç (pişmiş)', 130,  3, 28, 0,  0, 150, 'g', 'carb', ARRAY['pirinç pilavı', 'white rice']),
('Esmer Pirinç (pişmiş)', 111,  3, 23, 1,  2, 150, 'g', 'carb', ARRAY['esmer pirinç', 'brown rice']),
('Bulgur (pişmiş)',        83,  3, 18, 0,  4, 150, 'g', 'carb', ARRAY['bulgur pilavı']),
('Makarna (pişmiş)',      158,  6, 31, 1,  2, 150, 'g', 'carb', ARRAY['pasta', 'spaghetti']),
('Tam Buğday Makarna',    149,  6, 29, 1,  4, 150, 'g', 'carb', ARRAY['whole wheat pasta']),
('Beyaz Ekmek (dilim)',    79,  3, 15, 1,  1,  30, 'g', 'carb', ARRAY['beyaz ekmek', 'white bread']),
('Çavdar Ekmeği',          65,  2, 12, 1,  2,  30, 'g', 'carb', ARRAY['çavdar', 'rye bread']),
('Tortilla (buğday)',     146,  4, 25, 4,  2,  45, 'g', 'carb', ARRAY['tortilla', 'lavaş']),
('Patates (haşlanmış)',    86,  2, 20, 0,  2, 150, 'g', 'carb', ARRAY['haşlanmış patates']),
('Tatlı Patates',          90,  2, 21, 0,  3, 150, 'g', 'carb', ARRAY['tatlı patates', 'sweet potato']),

-- ── Sebzeler ────────────────────────────────────────────────────────────────
('Brokoli',              34,  3,  7, 0,  3, 150, 'g', 'vegetable', ARRAY['broccoli']),
('Ispanak',              23,  3,  4, 0,  2, 100, 'g', 'vegetable', ARRAY['spinach']),
('Havuç',                41,  1, 10, 0,  3, 100, 'g', 'vegetable', ARRAY['carrot']),
('Kabak',                17,  1,  3, 0,  1, 150, 'g', 'vegetable', ARRAY['zucchini', 'courgette']),
('Patlıcan',             25,  1,  6, 0,  3, 150, 'g', 'vegetable', ARRAY['eggplant', 'aubergine']),
('Biber (kırmızı)',      31,  1,  6, 0,  2, 100, 'g', 'vegetable', ARRAY['kırmızı biber', 'red pepper']),
('Biber (yeşil)',        20,  1,  5, 0,  2, 100, 'g', 'vegetable', ARRAY['yeşil biber', 'green pepper']),
('Mantar',               22,  3,  3, 0,  1, 100, 'g', 'vegetable', ARRAY['mushroom']),
('Mısır',               365, 9, 74, 5,  7, 100, 'g', 'vegetable', ARRAY['mısır']),
('Bezelye',              81,  5, 14, 0,  5, 100, 'g', 'vegetable', ARRAY['peas']),
('Soğan',                40,  1,  9, 0,  2, 100, 'g', 'vegetable', ARRAY['onion']),
('Sarımsak',            149,  6, 33, 1,  2,  10, 'g', 'vegetable', ARRAY['garlic']),
('Domates (büyük)',      18,  1,  4, 0,  1, 150, 'g', 'vegetable', ARRAY['büyük domates']),
('Salatalık',            16,  1,  4, 0,  1, 150, 'g', 'vegetable', ARRAY['cucumber']),

-- ── Yağlar & soslar ────────────────────────────────────────────────────────
('Tereyağı',            717,  1,  0, 81, 0,  10, 'g',  'fat',    ARRAY['butter', 'tereyağ']),
('Hindistan Cevizi Yağı',862, 0,  0, 100,0,  10, 'g',  'fat',   ARRAY['coconut oil']),
('Tahin',               595, 17, 21, 54, 9,  15, 'g',  'fat',   ARRAY['susam ezmesi', 'tahini']),
('Fıstık Ezmesi',       588, 25, 20, 50, 6,  30, 'g',  'fat',   ARRAY['peanut butter', 'fıstık ezmesi']),
('Badem Ezmesi',        614, 21, 22, 56, 6,  30, 'g',  'fat',   ARRAY['almond butter']),
('Bal',                 304,  0, 82,  0, 0,  20, 'g',  'other', ARRAY['honey']),
('Reçel',               250,  0, 65,  0, 0,  20, 'g',  'other', ARRAY['jam', 'marmelat']),

-- ── İçecekler ───────────────────────────────────────────────────────────────
('Portakal Suyu (taze)', 45, 1, 10, 0, 0, 200, 'ml', 'beverage', ARRAY['portakal suyu']),
('Elma Suyu',            46, 0, 11, 0, 0, 200, 'ml', 'beverage', ARRAY['apple juice']),
('Ayran',                40, 3,  3, 2, 0, 200, 'ml', 'beverage', ARRAY['yogurt drink']),
('Kefir',                41, 3,  5, 1, 0, 200, 'ml', 'beverage', ARRAY['kefir']),
('Protein Shake',       120, 25,  5, 2, 1, 300, 'ml', 'beverage', ARRAY['protein tozu', 'protein shake']),
('Americano',             5, 0,  1, 0, 0, 240, 'ml', 'beverage', ARRAY['americano kahve']),
('Latte',               120, 6, 10, 5, 0, 240, 'ml', 'beverage', ARRAY['sütlü kahve', 'latte']),
('Türk Kahvesi',         15, 0,  3, 0, 0,  60, 'ml', 'beverage', ARRAY['türk kahvesi', 'kahve']),

-- ── Hazır/pratik yiyecekler ─────────────────────────────────────────────────
('Protein Bar',          200, 20, 22, 6, 4,  50, 'g',  'other',  ARRAY['protein bar', 'enerji bar']),
('Gofret',               488,  7, 64, 23, 1,  30, 'g',  'other', ARRAY['wafer']),
('Bisküvi (sade)',        440,  7, 67, 16, 2,  30, 'g',  'other', ARRAY['bisküvi']),
('Kraker',               412, 10, 68, 11, 4,  30, 'g',  'other', ARRAY['cracker']),
('Rulo Sandviç',         320, 15, 42, 10, 3, 150, 'g',  'other', ARRAY['sandviç', 'wrap']),
('Dürüm (tavuk)',        430, 28, 48, 12, 3, 200, 'g',  'other', ARRAY['tavuk dürüm', 'kebap dürüm']),
('Pide (kasarlı)',       520, 22, 72, 16, 3, 250, 'g',  'other', ARRAY['kasarlı pide', 'pide']),
('Lahmacun',             290, 14, 38,  9, 3, 150, 'g',  'other', ARRAY['lahmacun'])
) AS v(name, calories, protein, carbs, fat, fiber, serving_size, serving_unit, category, aliases)
WHERE NOT EXISTS (
  SELECT 1 FROM food_items fi WHERE fi.name = v.name AND fi.user_id IS NULL
);
