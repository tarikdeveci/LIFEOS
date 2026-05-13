-- supabase/migrations/010_missing_foods.sql
-- Eksik gıdalar: Eti ürünleri, marka bisküvileri, yaygın atıştırmalıklar

INSERT INTO food_items (name, aliases, serving_size, serving_unit, calories, protein, carbs, fat, fiber, category, is_verified)
SELECT v.name, v.aliases, v.serving_size, v.serving_unit, v.calories, v.protein, v.carbs, v.fat, v.fiber, v.category, v.is_verified
FROM (VALUES

-- Eti ürünleri
('Eti Browni',           ARRAY['eti browni','browni','brownie'],             40, 'g', 178, 2.4, 24.8, 8.2, 1.0, 'snack', true),
('Eti Cin',              ARRAY['eti cin','cin bisküvi'],                     28, 'g', 122, 1.8, 18.6, 4.6, 0.5, 'snack', true),
('Eti Cici',             ARRAY['eti cici','cici'],                           22, 'g',  95, 1.2, 14.5, 3.8, 0.3, 'snack', true),
('Eti Tutku',            ARRAY['eti tutku','tutku çikolata'],                35, 'g', 170, 2.0, 22.0, 8.5, 0.5, 'snack', true),
('Eti Boni',             ARRAY['eti boni','boni'],                           25, 'g', 115, 1.5, 16.5, 5.0, 0.4, 'snack', true),
('Eti Pötibör',          ARRAY['eti pötibör','eti potibor'],                 25, 'g', 106, 1.8, 17.2, 3.5, 0.5, 'snack', true),

-- Ülker ürünleri
('Ülker Dankek Muzlu',   ARRAY['dankek','ülker dankek','muzlu kek'],         30, 'g', 117, 1.5, 19.2, 4.1, 0.3, 'snack', true),
('Ülker Albeni',         ARRAY['albeni','ülker albeni'],                     36, 'g', 168, 2.0, 22.5, 8.0, 0.5, 'snack', true),
('Ülker Çikolata Bar',   ARRAY['ülker bar','çikolata bar'],                  30, 'g', 155, 2.0, 18.5, 8.2, 0.6, 'snack', true),
('Ülker Krispi',         ARRAY['krispi','ülker krispi'],                     25, 'g', 112, 1.8, 16.0, 4.8, 0.8, 'snack', true),

-- Popüler abur cubur
('Pringles',             ARRAY['pringles'],                                  30, 'g', 158, 1.5, 16.5, 9.8, 1.0, 'snack', true),
('Toasted (mısır)',      ARRAY['toasted','toasted mısır'],                   30, 'g', 145, 2.5, 19.5, 6.5, 1.2, 'snack', true),
('Bambü (gofret)',       ARRAY['bambü','bambu gofret'],                      25, 'g', 122, 1.5, 16.8, 5.8, 0.4, 'snack', true),
('Cipsi (Ülker)',        ARRAY['ülker cipsi','ülker cips'],                  30, 'g', 155, 2.0, 17.0, 9.0, 1.0, 'snack', true),
('Crax (kraker)',        ARRAY['crax'],                                      25, 'g',  98, 2.8, 16.0, 3.0, 0.8, 'snack', true),

-- Çikolata / şekerleme
('Ülker 2si1 Arada',     ARRAY['2si1 arada','ülker ikisi bir arada'],        33, 'g', 157, 1.9, 21.0, 7.4, 0.5, 'snack', true),
('Milka Oreo',           ARRAY['milka oreo'],                                37, 'g', 185, 2.2, 23.5, 9.5, 0.5, 'snack', true),
('After Eight',          ARRAY['after eight','nane çikolata'],               9,  'g',  36, 0.3,  6.5, 1.1, 0.1, 'snack', true),
('Ferrero Rocher',       ARRAY['ferrero','ferrero rocher'],                  12, 'g',  73, 1.4,  7.0, 4.6, 0.4, 'snack', true),
('Godiva çikolata',      ARRAY['godiva'],                                    30, 'g', 158, 2.0, 17.5, 9.5, 0.8, 'snack', true),

-- Dondurma ekstra
('Algida Cornetto Classico', ARRAY['cornetto classico'],                    75, 'g', 195, 3.0, 24.5, 9.5, 0.4, 'snack', true),
('Mini Moo (dondurma)',  ARRAY['mini moo','moo'],                            22, 'g',  52, 0.6,  7.2, 2.4, 0.1, 'snack', true),
('Maraş dondurma (1 top)', ARRAY['maraş dondurma','dondurma top','dövme dondurma'], 80, 'g', 165, 2.5, 22.0, 7.5, 0.0, 'snack', true),

-- Kahvaltılık
('Nutella (ekmek üzeri)', ARRAY['nutella ekmek'],                           15, 'g',  81, 0.9,  8.6, 4.6, 0.5, 'fat',  true),
('Reçel (1 kaşık)',      ARRAY['reçel','jam','marmelat'],                   20, 'g',  52, 0.1, 13.5, 0.0, 0.2, 'other', true),
('Bal (1 kaşık)',        ARRAY['bal','honey'],                              21, 'g',  64, 0.1, 17.3, 0.0, 0.0, 'other', true),
('Çikolatalı fındık ezmesi (1 yk)', ARRAY['fındık ezmesi kaşık'],          15, 'g',  81, 0.9,  8.6, 4.6, 0.5, 'fat',  true),

-- İçecek ekstra
('Türk çayı (1 bardak)', ARRAY['çay bardağı','1 bardak çay'],             160, 'ml',   2, 0.0,  0.4, 0.0, 0.0, 'beverage', true),
('Salep (1 bardak)',     ARRAY['salep bardak'],                            200, 'ml', 150, 1.5, 35.0, 0.5, 0.2, 'beverage', true),
('Limonata (1 bardak)',  ARRAY['limonata'],                                250, 'ml',  80, 0.3, 20.0, 0.0, 0.0, 'beverage', true),
('Şalgam (1 bardak)',    ARRAY['şalgam','salgam'],                         250, 'ml',  25, 0.5,  5.5, 0.0, 0.5, 'beverage', true),

-- Türk mutfağı atıştırmalık
('Acı badem',            ARRAY['acıbadem','acı badem kurabiye'],            25, 'g', 116, 3.5, 12.5, 6.0, 1.0, 'snack', true),
('Revani (1 dilim)',     ARRAY['revani'],                                   80, 'g', 240, 4.0, 40.0, 7.0, 0.5, 'snack', true),
('Baklava (1 dilim)',    ARRAY['baklava'],                                  60, 'g', 295, 4.5, 32.0,17.5, 1.0, 'snack', true),
('Lokum (2 adet)',       ARRAY['lokum','türk lokumu'],                      30, 'g',  99, 0.3, 25.5, 0.0, 0.3, 'snack', true),
('Helva (1 dilim)',      ARRAY['helva','tahin helvası'],                    40, 'g', 217, 4.5, 22.5,13.0, 1.0, 'snack', true),

-- Fast food burgers & özel ürünler
('Triplex Smash Burger', ARRAY['triplex smash burger','smash burger','triplex burger'], 210, 'g', 550, 28, 38, 30, 1.5, 'protein', true),
('Sweetchill Tavuk Burger', ARRAY['sweetchill tavuk burger','sweetchill burger','tavuk burger'], 180, 'g', 420, 26, 32, 18, 1, 'protein', true),
('Pâté',                 ARRAY['pâté','pate','karaciğer pâtesi','ciğer pâtesi'], 50, 'g', 210, 12, 2, 17, 0, 'protein', true),
('Mango',                ARRAY['mango','tropikal mango','fusetea mango'], 330, 'ml', 150, 0.5, 38, 0.2, 2.5, 'fruit', true)

) AS v(name, aliases, serving_size, serving_unit, calories, protein, carbs, fat, fiber, category, is_verified)
WHERE NOT EXISTS (
  SELECT 1 FROM food_items fi WHERE fi.name = v.name AND fi.user_id IS NULL
);
