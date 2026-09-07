-- 041 — food_gaps kuyruğundan gelen eksik Türk yiyecekleri
--
-- Bu migration tahmine değil ÖLÇÜME dayanıyor. food_gaps ve nutrition_feedback
-- tablolarındaki gerçek kayıtlar okundu; hattın çözemediği ya da yanlış çözdüğü
-- her ifade buraya bir satır olarak girdi:
--
--   unresolved   → pisi, kornison tursu, krema, pastirmali yumurta
--   choices'ta kalan (küratörlü karşılığı yok, yalnızca USDA/OFF adayı vardı)
--                → hellim, tulum peyniri, roka, sarma, chia tohumu, keten tohumu
--   wrong_food   → "kuru domates" 0.764 skorla "Domates"e (18 kcal) oturuyordu.
--                  Kuru domates 258 kcal/100 g: on dört kat fark. Kendi satırı ve
--                  birebir alias'ı olduğu için artık lexical basamağına düşmüyor,
--                  global_alias'ta bitiyor.
--
-- Kuyruktaki kalemlerin yanına aynı ailelerin bariz boşlukları da eklendi
-- (peynir çeşitleri, kahvaltılık hamur işleri, kebap/ev yemeği, çorba, tatlı,
-- yeşillik, sos). Ölçüt: Türkiye'de haftada bir kez yenen ve şu an sözlükte
-- KARŞILIĞI OLMAYAN yiyecekler.
--
-- serving_size sözleşmesi (024'ten): is_countable ancak porsiyon TEK BİR PARÇAYSA
-- true olur (1 adet pişi, 1 dilim hellim). Bir ölçüyü temsil ediyorsa (30 g tulum
-- peyniri, 15 g chia) false kalır — yoksa "10 badem" tuzağına düşülür ve adetle
-- çarpım gramajı on katına çıkarır.
--
-- name_en her satırda dolu: korpus köprüsü (bridgeToEnglish) ve semantik gömme
-- katmanı (042) İngilizce yüzeyden çalışıyor.

INSERT INTO food_items
  (user_id, name, name_en, aliases, serving_size, serving_unit,
   calories, protein, carbs, fat, fiber, category, is_verified, is_countable)
VALUES
-- ============================
-- Kuyruktan gelenler
-- ============================
(NULL, 'Pişi', 'Turkish fried dough', ARRAY['pisi','pişi hamuru','hamur kızartması','kızarmış hamur'], 50, 'g', 170, 3.3, 19, 8.8, 0.7, 'grain', TRUE, TRUE),
(NULL, 'Hellim', 'Halloumi cheese', ARRAY['hellim','hellim peyniri','halloumi'], 40, 'g', 128, 8.8, 0.9, 10, 0, 'dairy', TRUE, TRUE),
(NULL, 'Tulum peyniri', 'Tulum cheese', ARRAY['tulum','tulum peyniri'], 30, 'g', 113, 7.2, 0.5, 9, 0, 'dairy', TRUE, FALSE),
(NULL, 'Roka', 'Arugula, raw', ARRAY['roka','rokalar'], 30, 'g', 8, 0.8, 1.1, 0.2, 0.5, 'vegetable', TRUE, FALSE),
(NULL, 'Yaprak sarma', 'Stuffed grape leaves', ARRAY['sarma','yaprak sarması','zeytinyağlı yaprak sarma','yaprak dolması'], 25, 'g', 45, 0.8, 5.5, 2.3, 0.6, 'other', TRUE, TRUE),
(NULL, 'Kornişon turşu', 'Pickles, dill', ARRAY['kornişon','kornison tursu','kornişon turşusu','salatalık turşusu'], 50, 'g', 8, 0.4, 1.2, 0.1, 0.6, 'vegetable', TRUE, FALSE),
(NULL, 'Krema (sıvı)', 'Cream, heavy', ARRAY['krema','sıvı krema','çırpılmış krema'], 30, 'g', 102, 0.6, 0.9, 10.8, 0, 'fat', TRUE, FALSE),
(NULL, 'Kaymak', 'Clotted cream', ARRAY['kaymak','manda kaymağı'], 30, 'g', 120, 1.2, 0.9, 12.6, 0, 'fat', TRUE, FALSE),
(NULL, 'Chia tohumu', 'Chia seeds, dried', ARRAY['chia','çiya','çia tohumu'], 15, 'g', 73, 2.5, 6.3, 4.6, 5.2, 'fat', TRUE, FALSE),
(NULL, 'Keten tohumu', 'Flaxseed', ARRAY['keten','öğütülmüş keten'], 10, 'g', 53, 1.8, 2.9, 4.2, 2.7, 'fat', TRUE, FALSE),
(NULL, 'Kuru domates', 'Sun-dried tomatoes', ARRAY['güneşte kurutulmuş domates'], 20, 'g', 52, 2.8, 11.2, 0.6, 2.5, 'vegetable', TRUE, FALSE),
(NULL, 'Pastırmalı yumurta', 'Eggs with pastirma', ARRAY['pastirmali yumurta','pastırmalı sahanda yumurta'], 150, 'g', 300, 24, 1.5, 22, 0, 'protein', TRUE, TRUE),

-- ============================
-- Peynir çeşitleri
-- ============================
(NULL, 'Ezine peyniri', 'Ezine white cheese', ARRAY['ezine'], 30, 'g', 90, 5.4, 0.4, 7.5, 0, 'dairy', TRUE, FALSE),
(NULL, 'Çeçil peyniri', 'Cecil string cheese', ARRAY['çeçil','cecil','örgü peyniri'], 30, 'g', 90, 7.5, 0.6, 6.6, 0, 'dairy', TRUE, FALSE),
(NULL, 'Mihaliç peyniri', 'Mihalic kelle cheese', ARRAY['mihaliç','kelle peyniri'], 30, 'g', 105, 7.2, 0.6, 8.4, 0, 'dairy', TRUE, FALSE),
(NULL, 'Dil peyniri', 'Dil string cheese', ARRAY['dil peyniri'], 30, 'g', 87, 6.9, 0.9, 6.3, 0, 'dairy', TRUE, FALSE),
(NULL, 'Krem peynir', 'Cream cheese', ARRAY['krem peynir','sürülebilir peynir'], 30, 'g', 100, 1.8, 1.2, 10, 0, 'dairy', TRUE, FALSE),
(NULL, 'Mozzarella', 'Mozzarella cheese', ARRAY['mozarella','pizza peyniri'], 30, 'g', 85, 6.6, 0.7, 6.3, 0, 'dairy', TRUE, FALSE),
(NULL, 'Çökelek', 'Cokelek curd cheese', ARRAY['cokelek','kuru çökelek'], 30, 'g', 45, 6, 1.2, 1.5, 0, 'dairy', TRUE, FALSE),
(NULL, 'Keçi peyniri', 'Goat cheese', ARRAY['keci peyniri'], 30, 'g', 82, 5.4, 0.7, 6.5, 0, 'dairy', TRUE, FALSE),

-- ============================
-- Kahvaltılık ve hamur işi
-- ============================
(NULL, 'Gözleme (peynirli)', 'Gozleme with cheese', ARRAY['gözleme','gozleme','peynirli gözleme'], 180, 'g', 430, 14, 52, 17, 3, 'grain', TRUE, TRUE),
(NULL, 'Su böreği', 'Su borek layered pastry', ARRAY['su böreği','börek','su boregi'], 120, 'g', 300, 11, 33, 13, 1.4, 'grain', TRUE, TRUE),
(NULL, 'Sigara böreği', 'Cigarette borek', ARRAY['sigara böreği','sigara boregi','çıtır börek'], 30, 'g', 105, 3, 10, 6, 0.5, 'grain', TRUE, TRUE),
(NULL, 'Katmer', 'Katmer pastry', ARRAY['katmer'], 120, 'g', 420, 8, 42, 24, 1.5, 'grain', TRUE, TRUE),
(NULL, 'Bazlama', 'Bazlama flatbread', ARRAY['bazlama','tandır ekmeği'], 100, 'g', 275, 8, 54, 2.5, 2.5, 'grain', TRUE, TRUE),
(NULL, 'Kete', 'Kete pastry', ARRAY['kete','erzurum ketesi'], 100, 'g', 380, 8, 45, 18, 1.8, 'grain', TRUE, TRUE),
(NULL, 'Mısır ekmeği', 'Corn bread', ARRAY['mısır ekmeği','misir ekmegi'], 40, 'g', 90, 2, 18, 1, 1.5, 'grain', TRUE, TRUE),
(NULL, 'Yufka', 'Yufka phyllo sheet', ARRAY['yufka','yufka yaprağı'], 60, 'g', 165, 5, 33, 1, 1.2, 'grain', TRUE, TRUE),
(NULL, 'Hamur (çiğ)', 'Raw bread dough', ARRAY['hamur','çiğ hamur','ekmek hamuru'], 100, 'g', 290, 8, 55, 4, 2, 'grain', TRUE, FALSE),
(NULL, 'Un (buğday)', 'Wheat flour', ARRAY['un','buğday unu','beyaz un'], 100, 'g', 364, 10.3, 76, 1, 2.7, 'grain', TRUE, FALSE),

-- ============================
-- Ana yemek ve kebap
-- ============================
(NULL, 'İskender', 'Iskender kebab', ARRAY['iskender','iskender kebap','bursa iskender'], 350, 'g', 780, 42, 55, 42, 3, 'protein', TRUE, TRUE),
(NULL, 'Adana kebap', 'Adana kebab', ARRAY['adana','acılı kebap'], 180, 'g', 500, 30, 2, 41, 0.5, 'protein', TRUE, TRUE),
(NULL, 'Urfa kebap', 'Urfa kebab', ARRAY['urfa','acısız kebap'], 180, 'g', 460, 31, 2, 36, 0.5, 'protein', TRUE, TRUE),
(NULL, 'Tantuni', 'Tantuni wrap', ARRAY['tantuni','mersin tantuni'], 250, 'g', 520, 26, 52, 22, 3.5, 'protein', TRUE, TRUE),
(NULL, 'Kokoreç', 'Kokorec grilled offal', ARRAY['kokoreç','kokorec'], 150, 'g', 420, 22, 22, 26, 1.2, 'protein', TRUE, TRUE),
(NULL, 'Pilav üstü döner', 'Doner kebab over rice', ARRAY['pilav üstü döner','pilav üstü et döner','pilav ustu doner'], 350, 'g', 700, 36, 62, 34, 2, 'protein', TRUE, TRUE),
(NULL, 'Tavuk şiş', 'Chicken shish kebab', ARRAY['tavuk şiş','tavuk sis','şiş tavuk'], 150, 'g', 260, 34, 1, 13, 0, 'protein', TRUE, TRUE),
(NULL, 'Karnıyarık', 'Karniyarik stuffed eggplant', ARRAY['karnıyarık','karniyarik'], 250, 'g', 320, 12, 20, 21, 5, 'protein', TRUE, TRUE),
(NULL, 'Etli güveç', 'Beef stew casserole', ARRAY['güveç','etli güveç','guvec'], 300, 'g', 380, 26, 22, 20, 4, 'protein', TRUE, TRUE),
(NULL, 'Kuru köfte', 'Turkish dry meatball', ARRAY['kuru köfte','kuru kofte'], 40, 'g', 100, 7, 3, 6.5, 0.3, 'protein', TRUE, TRUE),
(NULL, 'İçli köfte', 'Icli kofte stuffed bulgur ball', ARRAY['içli köfte','icli kofte','oruk'], 90, 'g', 250, 9, 24, 13, 2, 'protein', TRUE, TRUE),
(NULL, 'Biber dolması (etli)', 'Stuffed pepper with meat', ARRAY['biber dolması','etli biber dolması','dolma'], 120, 'g', 160, 7, 14, 8, 2, 'protein', TRUE, TRUE),
(NULL, 'Kabak dolması', 'Stuffed zucchini', ARRAY['kabak dolması','kabak dolmasi'], 120, 'g', 140, 5, 15, 6.5, 2.2, 'vegetable', TRUE, TRUE),
(NULL, 'Musakka', 'Musakka eggplant bake', ARRAY['musakka','mussaka'], 250, 'g', 330, 15, 20, 20, 4.5, 'protein', TRUE, TRUE),
(NULL, 'Türlü', 'Mixed vegetable stew', ARRAY['türlü','turlu','sebze türlü'], 250, 'g', 210, 7, 26, 8.5, 6, 'vegetable', TRUE, TRUE),
(NULL, 'Hamsi tava', 'Pan-fried anchovy', ARRAY['hamsi','hamsi tava','tava hamsi'], 150, 'g', 380, 24, 10, 27, 0.4, 'protein', TRUE, TRUE),
(NULL, 'Balık ekmek', 'Fish sandwich', ARRAY['balık ekmek','balik ekmek'], 250, 'g', 480, 28, 48, 20, 3, 'protein', TRUE, TRUE),
(NULL, 'Midye dolma', 'Stuffed mussels', ARRAY['midye dolma','midye','midye dolması'], 25, 'g', 45, 1.5, 6, 1.6, 0.4, 'protein', TRUE, TRUE),
(NULL, 'Mercimek köftesi', 'Lentil balls', ARRAY['mercimek köftesi','mercimek koftesi'], 40, 'g', 60, 2.2, 9, 1.6, 1.5, 'protein', TRUE, TRUE),

-- ============================
-- Meze ve salata
-- ============================
(NULL, 'Kısır', 'Kisir bulgur salad', ARRAY['kısır','kisir'], 150, 'g', 220, 5, 36, 7, 5, 'carb', TRUE, TRUE),
(NULL, 'Piyaz', 'Piyaz bean salad', ARRAY['piyaz','fasulye piyazı'], 200, 'g', 260, 11, 30, 10, 8, 'protein', TRUE, TRUE),
(NULL, 'Humus', 'Hummus', ARRAY['humus','hummus','nohut ezmesi'], 100, 'g', 170, 8, 15, 9, 6, 'protein', TRUE, TRUE),
(NULL, 'Haydari', 'Haydari yogurt dip', ARRAY['haydari'], 80, 'g', 130, 5, 4, 10, 0.4, 'dairy', TRUE, TRUE),
(NULL, 'Acılı ezme', 'Spicy tomato ezme', ARRAY['acılı ezme','ezme','ezme salata'], 80, 'g', 60, 1.3, 6, 3.5, 1.8, 'vegetable', TRUE, TRUE),
(NULL, 'Cacık', 'Cacik yogurt cucumber dip', ARRAY['cacık','cacik'], 200, 'g', 90, 5, 8, 4, 0.6, 'dairy', TRUE, TRUE),
(NULL, 'Şakşuka', 'Saksuka fried vegetables', ARRAY['şakşuka','saksuka'], 150, 'g', 200, 3, 15, 14, 4, 'vegetable', TRUE, TRUE),
(NULL, 'Turşu (karışık)', 'Mixed pickles', ARRAY['turşu','karışık turşu','tursu'], 50, 'g', 10, 0.5, 1.8, 0.1, 0.7, 'vegetable', TRUE, FALSE),

-- ============================
-- Çorba
-- ============================
(NULL, 'Ezogelin çorbası', 'Ezogelin lentil soup', ARRAY['ezogelin','ezogelin çorbası'], 300, 'g', 240, 10, 38, 6, 5, 'other', TRUE, TRUE),
(NULL, 'Tavuk çorbası', 'Chicken soup', ARRAY['tavuk çorbası','tavuk corbasi'], 300, 'g', 180, 12, 18, 6.5, 1, 'other', TRUE, TRUE),
(NULL, 'Domates çorbası', 'Tomato soup', ARRAY['domates çorbası','domates corbasi'], 300, 'g', 200, 5, 26, 8, 2.4, 'other', TRUE, TRUE),
(NULL, 'Yayla çorbası', 'Yayla yogurt soup', ARRAY['yayla çorbası','yoğurt çorbası'], 300, 'g', 210, 8, 28, 7, 1.2, 'other', TRUE, TRUE),
(NULL, 'Tarhana çorbası', 'Tarhana soup', ARRAY['tarhana','tarhana çorbası'], 300, 'g', 170, 6, 28, 4, 2.5, 'other', TRUE, TRUE),
(NULL, 'İşkembe çorbası', 'Tripe soup', ARRAY['işkembe','iskembe çorbası','şirden'], 300, 'g', 260, 20, 12, 15, 0.5, 'other', TRUE, TRUE),

-- ============================
-- Tatlı
-- ============================
(NULL, 'Sütlaç', 'Rice pudding', ARRAY['sütlaç','sutlac','fırın sütlaç'], 150, 'g', 220, 4.5, 38, 5.5, 0.4, 'snack', TRUE, TRUE),
(NULL, 'Kazandibi', 'Kazandibi milk pudding', ARRAY['kazandibi','kazan dibi'], 120, 'g', 250, 4, 42, 7, 0.2, 'snack', TRUE, TRUE),
(NULL, 'Künefe', 'Kunefe cheese pastry', ARRAY['künefe','kunefe'], 150, 'g', 560, 9, 60, 32, 1.5, 'snack', TRUE, TRUE),
(NULL, 'Tulumba tatlısı', 'Tulumba syrup dessert', ARRAY['tulumba','tulumba tatlısı'], 30, 'g', 110, 0.8, 18, 4, 0.2, 'snack', TRUE, TRUE),
(NULL, 'Şekerpare', 'Sekerpare syrup cookie', ARRAY['şekerpare','sekerpare'], 40, 'g', 160, 1.6, 26, 6, 0.4, 'snack', TRUE, TRUE),
(NULL, 'Tel kadayıf', 'Kadayif shredded pastry', ARRAY['kadayıf','tel kadayıf','kadayif'], 100, 'g', 400, 6, 52, 19, 1.4, 'snack', TRUE, TRUE),
(NULL, 'Profiterol', 'Profiterole with chocolate', ARRAY['profiterol','profiterole'], 120, 'g', 340, 6, 38, 18, 1, 'snack', TRUE, TRUE),
(NULL, 'Aşure', 'Asure Noah pudding', ARRAY['aşure','asure'], 200, 'g', 280, 6, 58, 4, 5, 'snack', TRUE, TRUE),
(NULL, 'Güllaç', 'Gullac milk dessert', ARRAY['güllaç','gullac'], 120, 'g', 190, 4, 32, 5, 0.6, 'snack', TRUE, TRUE),
(NULL, 'Dondurma (1 top)', 'Ice cream scoop', ARRAY['dondurma','1 top dondurma'], 60, 'g', 130, 2.4, 15, 6.6, 0.4, 'snack', TRUE, TRUE),
(NULL, 'Lokma tatlısı', 'Lokma fried dough dessert', ARRAY['lokma','lokma tatlısı'], 20, 'g', 65, 0.8, 10, 2.6, 0.2, 'snack', TRUE, TRUE),

-- ============================
-- Yeşillik ve sebze
-- ============================
(NULL, 'Marul', 'Lettuce, raw', ARRAY['marul','kıvırcık','göbek marul'], 50, 'g', 8, 0.7, 1.5, 0.1, 0.7, 'vegetable', TRUE, FALSE),
(NULL, 'Maydanoz', 'Parsley, raw', ARRAY['maydanoz'], 20, 'g', 7, 0.6, 1.2, 0.1, 0.7, 'vegetable', TRUE, FALSE),
(NULL, 'Dereotu', 'Dill, raw', ARRAY['dereotu','dere otu'], 10, 'g', 4, 0.3, 0.7, 0.1, 0.2, 'vegetable', TRUE, FALSE),
(NULL, 'Turp', 'Radish, raw', ARRAY['turp','kırmızı turp'], 50, 'g', 8, 0.3, 1.7, 0.1, 0.8, 'vegetable', TRUE, FALSE),
(NULL, 'Kereviz', 'Celeriac, raw', ARRAY['kereviz','kereviz sapı'], 100, 'g', 42, 1.5, 9.2, 0.3, 1.8, 'vegetable', TRUE, FALSE),
(NULL, 'Pırasa (pişmiş)', 'Leeks, cooked', ARRAY['pırasa','pirasa','zeytinyağlı pırasa'], 200, 'g', 62, 1.6, 14, 0.4, 2.4, 'vegetable', TRUE, FALSE),
(NULL, 'Lahana', 'Cabbage, raw', ARRAY['lahana','beyaz lahana','kara lahana'], 100, 'g', 25, 1.3, 5.8, 0.1, 2.5, 'vegetable', TRUE, FALSE),
(NULL, 'Karnabahar', 'Cauliflower, raw', ARRAY['karnabahar'], 100, 'g', 25, 1.9, 5, 0.3, 2, 'vegetable', TRUE, FALSE),
(NULL, 'Bamya', 'Okra, raw', ARRAY['bamya'], 100, 'g', 33, 1.9, 7.5, 0.2, 3.2, 'vegetable', TRUE, FALSE),
(NULL, 'Enginar', 'Artichoke, cooked', ARRAY['enginar','zeytinyağlı enginar'], 100, 'g', 47, 2.9, 10.5, 0.3, 5.4, 'vegetable', TRUE, FALSE),
(NULL, 'Pancar', 'Beets, raw', ARRAY['pancar','kırmızı pancar'], 100, 'g', 43, 1.6, 9.6, 0.2, 2.8, 'vegetable', TRUE, FALSE),
(NULL, 'Semizotu', 'Purslane, raw', ARRAY['semizotu','semiz otu'], 100, 'g', 16, 1.3, 3.4, 0.1, 0.9, 'vegetable', TRUE, FALSE),

-- ============================
-- Tahıl ve baklagil
-- ============================
(NULL, 'Kinoa (pişmiş)', 'Quinoa, cooked', ARRAY['kinoa','quinoa','kinoa pilavı'], 150, 'g', 180, 6.6, 31, 2.8, 4, 'carb', TRUE, FALSE),
(NULL, 'Karabuğday (pişmiş)', 'Buckwheat, cooked', ARRAY['karabuğday','karabugday','greçka'], 150, 'g', 140, 5, 30, 1, 4, 'carb', TRUE, FALSE),
(NULL, 'Kuskus (pişmiş)', 'Couscous, cooked', ARRAY['kuskus','couscous'], 150, 'g', 170, 5.7, 35, 0.3, 2.2, 'carb', TRUE, FALSE),
(NULL, 'Arpa şehriye pilavı', 'Orzo pilaf', ARRAY['arpa şehriye','şehriye pilavı','arpa sehriye'], 200, 'g', 260, 7, 48, 5, 2, 'carb', TRUE, TRUE),
(NULL, 'Yeşil mercimek (haşlanmış)', 'Green lentils, boiled', ARRAY['yeşil mercimek','yesil mercimek','mercimek yemeği'], 150, 'g', 170, 13, 30, 0.6, 12, 'protein', TRUE, FALSE),
(NULL, 'Barbunya (haşlanmış)', 'Cranberry beans, boiled', ARRAY['barbunya','barbunya pilaki'], 150, 'g', 190, 13, 34, 0.8, 12, 'protein', TRUE, FALSE),
(NULL, 'Bakla (haşlanmış)', 'Fava beans, boiled', ARRAY['bakla','bakla yemeği'], 150, 'g', 165, 12, 30, 0.7, 8, 'protein', TRUE, FALSE),

-- ============================
-- Sos, yağ, tatlandırıcı
-- ============================
(NULL, 'Mayonez (1 yk)', 'Mayonnaise', ARRAY['mayonez','mayonnaise'], 15, 'g', 105, 0.2, 0.4, 11.3, 0, 'fat', TRUE, FALSE),
(NULL, 'Ketçap (1 yk)', 'Ketchup', ARRAY['ketçap','ketchup','ketcap'], 15, 'g', 15, 0.2, 3.6, 0, 0.1, 'other', TRUE, FALSE),
(NULL, 'Hardal (1 yk)', 'Mustard', ARRAY['hardal','mustard'], 15, 'g', 10, 0.6, 0.9, 0.5, 0.4, 'other', TRUE, FALSE),
(NULL, 'Salça (1 yk)', 'Tomato paste', ARRAY['salça','domates salçası','biber salçası'], 15, 'g', 12, 0.6, 2.7, 0.1, 0.6, 'other', TRUE, FALSE),
(NULL, 'Pekmez (1 yk)', 'Grape molasses', ARRAY['pekmez','üzüm pekmezi'], 20, 'g', 58, 0.2, 14.4, 0, 0, 'other', TRUE, FALSE),
(NULL, 'Ayçiçek yağı (1 yk)', 'Sunflower oil', ARRAY['ayçiçek yağı','sıvı yağ','aycicek yagi'], 14, 'g', 124, 0, 0, 14, 0, 'fat', TRUE, FALSE),
(NULL, 'Margarin (1 yk)', 'Margarine', ARRAY['margarin','margarine'], 14, 'g', 100, 0.1, 0.1, 11.2, 0, 'fat', TRUE, FALSE),
(NULL, 'Şeker (1 tk)', 'Granulated sugar', ARRAY['toz şeker','küp şeker'], 5, 'g', 20, 0, 5, 0, 0, 'other', TRUE, FALSE)

ON CONFLICT (name) WHERE user_id IS NULL DO NOTHING;
