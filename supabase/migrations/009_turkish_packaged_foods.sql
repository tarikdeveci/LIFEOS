-- supabase/migrations/009_turkish_packaged_foods.sql
-- Türk paketli gıdalar, abur cubur ve marka ürünleri
-- user_id NULL = global (tüm kullanıcılar görebilir)

INSERT INTO food_items (name, aliases, serving_size, serving_unit, calories, protein, carbs, fat, fiber, category, is_verified)
SELECT v.name, v.aliases, v.serving_size, v.serving_unit, v.calories, v.protein, v.carbs, v.fat, v.fiber, v.category, v.is_verified
FROM (VALUES

-- Cips & Atıştırmalık
('Lay''s Classic (cips)',  ARRAY['lays','lay''s','cips','patates cipsi'],       30, 'g', 161, 2.1, 16.0, 10.2, 1.5, 'snack', true),
('Doritos (cips)',         ARRAY['doritos','mısır cipsi'],                      30, 'g', 149, 2.1, 18.6,  7.2, 1.2, 'snack', true),
('Ruffles (cips)',         ARRAY['ruffles'],                                    30, 'g', 162, 2.1, 15.9,  9.9, 1.2, 'snack', true),
('Cheetos',                ARRAY['cheetos','chetos'],                           30, 'g', 163, 2.3, 16.5,  9.9, 0.3, 'snack', true),
('Patos',                  ARRAY['patos'],                                      30, 'g', 156, 2.0, 17.4,  8.4, 0.9, 'snack', true),
('Cipso',                  ARRAY['cipso'],                                      30, 'g', 158, 1.8, 16.5,  9.3, 1.2, 'snack', true),
('Tostitos',               ARRAY['tostitos'],                                   30, 'g', 140, 2.1, 19.0,  5.9, 1.2, 'snack', true),
('Leblebi',                ARRAY['leblebi','nohut leblebi'],                    50, 'g', 178, 9.5, 27.5,  2.5, 7.5, 'snack', true),
('Patlamış mısır (paket)', ARRAY['popcorn','patlamış mısır','popkorn'],         30, 'g', 144, 3.0, 17.4,  6.9, 2.4, 'snack', true),

-- Çikolata & Şekerleme
('Milka sütlü çikolata',   ARRAY['milka','milka cikolata'],                     30, 'g', 159, 2.3, 17.7,  8.7, 0.3, 'snack', true),
('Toblerone',               ARRAY['toblerone'],                                 30, 'g', 158, 2.3, 16.8,  8.7, 0.9, 'snack', true),
('Snickers',                ARRAY['snickers'],                                  50, 'g', 244, 4.3, 28.5, 12.5, 0.8, 'snack', true),
('Mars bar',                ARRAY['mars','mars bar'],                           50, 'g', 225, 2.0, 34.5,  8.5, 0.3, 'snack', true),
('Twix',                    ARRAY['twix'],                                      50, 'g', 249, 2.5, 32.0, 12.0, 0.5, 'snack', true),
('Bounty',                  ARRAY['bounty'],                                    50, 'g', 236, 1.8, 31.0, 12.0, 1.0, 'snack', true),
('KitKat',                  ARRAY['kitkat','kit kat'],                          41, 'g', 213, 2.7, 24.6, 11.1, 0.4, 'snack', true),
('Kinder Bueno',            ARRAY['kinder bueno','kinder'],                     43, 'g', 243, 4.3, 22.4, 15.1, 0.4, 'snack', true),
('Kinder Sürpriz',          ARRAY['kinder sürpriz','kinder surpriz'],           20, 'g', 111, 2.0, 11.2,  6.7, 0.2, 'snack', true),
('Nutella',                 ARRAY['nutella','fındıklı krem'],                   30, 'g', 162, 1.9, 17.3,  9.3, 1.0, 'fat',   true),
('Ülker sütlü çikolata',    ARRAY['ülker çikolata','ulker cikolata'],           30, 'g', 159, 1.7, 18.6,  8.7, 0.5, 'snack', true),
('Haribo gummy',            ARRAY['haribo','jelly','gummi'],                    30, 'g', 102, 2.1, 23.4,  0.0, 0.0, 'snack', true),

-- Bisküvi & Gofret
('Oreo',                    ARRAY['oreo'],                                      34, 'g', 161, 1.8, 23.1,  6.8, 0.6, 'snack', true),
('Ülker Çikolatalı Gofret', ARRAY['ülker gofret','gofret','ulker gofret'],      36, 'g', 187, 2.3, 20.5, 10.4, 0.5, 'snack', true),
('Ülker Biskrem',           ARRAY['biskrem','ülker biskrem'],                   28, 'g', 139, 1.8, 17.4,  7.0, 0.3, 'snack', true),
('Eti Canga',               ARRAY['canga','eti canga'],                         30, 'g', 147, 1.8, 18.9,  6.9, 0.6, 'snack', true),
('Eti Burçak',              ARRAY['burçak','eti burcak'],                       30, 'g', 135, 2.4, 20.1,  4.8, 0.8, 'snack', true),
('Ülker Halley',            ARRAY['halley','ülker halley'],                     34, 'g', 154, 1.8, 21.1,  6.8, 0.5, 'snack', true),
('Pötibör bisküvi',         ARRAY['pötibör','potibor','petit beurre'],          28, 'g', 121, 1.7, 19.0,  4.5, 0.5, 'snack', true),
('Ritz kraker',             ARRAY['ritz','ritz kraker'],                        30, 'g', 135, 2.4, 18.3,  5.7, 0.6, 'snack', true),
('Digestive bisküvi',       ARRAY['digestive'],                                 33, 'g', 148, 2.1, 20.0,  6.6, 1.2, 'snack', true),

-- Marka Süt Ürünleri
('Danone Activia',          ARRAY['activia','danone activia'],                 125, 'g',  91, 4.8, 13.8,  1.9, 0.0, 'dairy', true),
('Yoplait meyveli yoğurt',  ARRAY['yoplait'],                                 125, 'g', 106, 4.4, 16.3,  1.9, 0.2, 'dairy', true),
('Sütaş sade yoğurt',       ARRAY['sütaş yoğurt','sutas yogurt'],             100, 'g',  70, 4.0,  5.0,  3.5, 0.0, 'dairy', true),
('Pınar kaşar dilimleri',   ARRAY['pınar kaşar','pinar kasar','dilimlemiş kaşar'], 30, 'g', 105, 7.0, 0.0, 8.5, 0.0, 'dairy', true),
('Torku kakaolu fındık kreması', ARRAY['torku fındık','torku'],               30, 'g', 158, 2.1, 17.1,  9.3, 0.9, 'fat',   true),

-- İçecekler
('Coca-Cola (330ml)',        ARRAY['cola','coca cola','kola'],                 330, 'ml', 139, 0.0, 35.2,  0.0, 0.0, 'beverage', true),
('Coca-Cola Zero (330ml)',   ARRAY['cola zero','coca cola zero','kola zero'],  330, 'ml',   1, 0.0,  0.0,  0.0, 0.0, 'beverage', true),
('Fanta (330ml)',            ARRAY['fanta'],                                   330, 'ml', 138, 0.0, 33.0,  0.0, 0.0, 'beverage', true),
('Sprite (330ml)',           ARRAY['sprite'],                                  330, 'ml', 125, 0.0, 30.0,  0.0, 0.0, 'beverage', true),
('Red Bull (250ml)',         ARRAY['red bull','redbull','enerji içeceği'],     250, 'ml', 113, 1.3, 27.5,  0.0, 0.0, 'beverage', true),
('Monster Energy (500ml)',   ARRAY['monster','monster energy'],                500, 'ml', 230, 1.0, 55.0,  0.0, 0.0, 'beverage', true),
('Cappy meyve suyu (200ml)', ARRAY['cappy','meyve suyu','portakal suyu'],      200, 'ml',  90, 0.5, 21.0,  0.0, 0.2, 'beverage', true),
('Ice Tea (330ml)',          ARRAY['ice tea','buzlu çay','lipton'],            330, 'ml', 122, 0.3, 30.0,  0.0, 0.0, 'beverage', true),
('Sütaş Ayran (320ml)',      ARRAY['sütaş ayran','sutas ayran'],               320, 'ml',  98, 6.4,  7.4,  4.2, 0.0, 'dairy',    true),

-- Şarküteri
('Pınar sosis (2 adet)',     ARRAY['sosis','pınar sosis','pinar sosis'],        50, 'g', 135, 6.0,  3.0, 11.0, 0.0, 'protein', true),
('Sucuk (dilimli)',          ARRAY['sucuk'],                                    30, 'g', 114, 5.4,  0.3, 10.2, 0.0, 'protein', true),
('Pastırma',                 ARRAY['pastırma','pastirma'],                      30, 'g',  78,13.8,  0.0,  2.1, 0.0, 'protein', true),
('Hindi jambon',             ARRAY['hindi jambon','jambon'],                    30, 'g',  45, 6.0,  0.6,  2.1, 0.0, 'protein', true),
('Dardanel ton balığı',      ARRAY['dardanel','konserve ton','ton konserve'],   80, 'g',  93,20.8,  0.0,  0.6, 0.0, 'protein', true),

-- Dondurma
('Cornetto',                 ARRAY['cornetto','algida cornetto'],              120, 'g', 290, 4.0, 36.0, 15.0, 0.5, 'snack', true),
('Magnum Classic',           ARRAY['magnum','magnum classic'],                  86, 'g', 250, 3.3, 27.5, 15.5, 0.6, 'snack', true),
('Magnum Almond',            ARRAY['magnum almond','magnum badem'],             90, 'g', 275, 3.5, 27.0, 17.0, 0.6, 'snack', true),

-- Hazır Çorbalar
('Knorr domates çorba',      ARRAY['knorr çorba','hazır çorba','knorr'],       35, 'g', 130, 3.5, 24.0,  2.5, 1.5, 'vegetable', true),
('Knorr tavuk çorba',        ARRAY['knorr tavuk çorba'],                       35, 'g', 125, 4.5, 22.0,  2.0, 1.0, 'protein',   true),
('Maggi erişte',             ARRAY['maggi','erişte','hazır erişte'],           65, 'g', 236, 7.0, 41.0,  5.0, 1.5, 'grain',     true),

-- Sporcu & Pratik
('Sporbar',                  ARRAY['sporbar','protein bar sporcu'],             40, 'g', 160, 7.0, 22.0,  5.0, 2.0, 'protein', true),
('Nescafé 3ü1 arada',        ARRAY['nescafe','3ü1 arada','hazır kahve'],       17, 'g',  72, 0.9, 11.8,  2.4, 0.0, 'beverage', true),

-- Fırın & Ekmek (paketli)
('Harry''s tost ekmeği',     ARRAY['harrys','tost ekmeği','harry''s'],         25, 'g',  67, 2.2, 13.0,  0.8, 0.7, 'grain', true),
('Tortilla wrap',            ARRAY['tortilla','wrap'],                          60, 'g', 182, 4.7, 31.0,  4.2, 1.2, 'grain', true),
('Poğaça (peynirli)',        ARRAY['poğaça','pogaca'],                          80, 'g', 265, 7.5, 28.0, 14.0, 1.0, 'grain', true),
('Açma',                     ARRAY['açma','acma'],                              75, 'g', 285, 6.0, 30.0, 16.0, 0.8, 'grain', true),

-- Kuruyemiş & Kuru Meyve (paketli)
('Antep fıstığı',            ARRAY['antep fıstığı','fıstık','pistachio'],      30, 'g', 172, 6.3,  7.8, 13.8, 3.0, 'fat',   true),
('Kaju fıstığı',             ARRAY['kaju','cashew'],                           30, 'g', 165, 4.5,  9.0, 13.2, 0.9, 'fat',   true),
('Ay çekirdeği',             ARRAY['ay çekirdeği','çekirdek','sunflower'],     30, 'g', 173, 5.4,  4.8, 15.0, 2.1, 'fat',   true),
('Kabak çekirdeği',          ARRAY['kabak çekirdeği'],                         30, 'g', 171, 9.0,  4.2, 14.1, 0.9, 'fat',   true),
('Kuru kayısı',              ARRAY['kuru kayısı','kayısı'],                    30, 'g',  73, 0.9, 17.5,  0.1, 1.8, 'fruit', true),
('Kuru üzüm',                ARRAY['kuru üzüm','sultana'],                     30, 'g',  90, 1.0, 22.5,  0.1, 1.2, 'fruit', true),
('Hurma',                    ARRAY['hurma','date'],                             30, 'g',  82, 0.6, 22.2,  0.0, 1.8, 'fruit', true)

) AS v(name, aliases, serving_size, serving_unit, calories, protein, carbs, fat, fiber, category, is_verified)
WHERE NOT EXISTS (
  SELECT 1 FROM food_items fi WHERE fi.name = v.name AND fi.user_id IS NULL
);
