-- seed_workout.sql
-- Egzersiz kütüphanesi (global, user_id = NULL)
-- Çalıştır: supabase db push veya SQL Editor'da yapıştır

-- -------------------------------------------------------
-- Kas Grupları
-- -------------------------------------------------------
INSERT INTO muscle_groups (name, name_en, body_region) VALUES
  ('Göğüs',       'Chest',       'upper'),
  ('Sırt',        'Back',        'upper'),
  ('Omuz',        'Shoulder',    'upper'),
  ('Ön Kol',      'Bicep',       'upper'),
  ('Arka Kol',    'Tricep',      'upper'),
  ('Ön Bacak',    'Quadriceps',  'lower'),
  ('Arka Bacak',  'Hamstrings',  'lower'),
  ('Baldır',      'Calves',      'lower'),
  ('Kalça',       'Glutes',      'lower'),
  ('Karın',       'Abs',         'core'),
  ('Bel',         'Lower Back',  'core'),
  ('Tüm Vücut',   'Full Body',   'full')
ON CONFLICT (name) DO NOTHING;

-- -------------------------------------------------------
-- Egzersizler
-- -------------------------------------------------------
WITH mg AS (SELECT id, name_en FROM muscle_groups)
INSERT INTO exercises (name, name_en, category, muscle_group_id, is_bodyweight, met_value, instructions) VALUES

-- GÖĞÜS
('Bench Press',        'Bench Press',        'strength', (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 5.0, 'Sırt yatay, bar göğüse değene kadar indir, patlayıcı şekilde it.'),
('İnkline Bench Press','Incline Bench Press', 'strength', (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 5.0, 'Bank 30-45° açıda, üst göğse odaklan.'),
('Dumbbell Fly',       'Dumbbell Fly',        'strength', (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 4.5, 'Kolları hafif bükülü, geniş ark çiz.'),
('Push-Up',            'Push-Up',             'strength', (SELECT id FROM mg WHERE name_en='Chest'),      TRUE,  3.8, 'Vücut düz, göğüs yere değene kadar in.'),
('Dips',               'Dips',                'strength', (SELECT id FROM mg WHERE name_en='Chest'),      TRUE,  5.0, 'Öne hafif eğilerek göğsü hedefle.'),

-- SIRT
('Deadlift',           'Deadlift',            'strength', (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 6.0, 'Bel düz, bar bacaklara yakın, kalçalarla it.'),
('Pull-Up',            'Pull-Up',             'strength', (SELECT id FROM mg WHERE name_en='Back'),       TRUE,  5.5, 'Tam uzanmadan tam çekişe, skapulayı sıkıştır.'),
('Barbell Row',        'Barbell Row',         'strength', (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 5.0, '45° öne eğil, barı göbek hizasına çek.'),
('Lat Pulldown',       'Lat Pulldown',        'strength', (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 4.5, 'Geniş tutuş, dirseği yanağa çek.'),
('Cable Row',          'Cable Row',           'strength', (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 4.5, 'Dik otur, dirseği geriye çek, skapulayı sıkıştır.'),

-- OMUZ
('Overhead Press',     'Overhead Press',      'strength', (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 5.0, 'Bar alın hizasından başlar, tepede kilitlenir.'),
('Lateral Raise',      'Lateral Raise',       'strength', (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 3.5, 'Dirsekler hafif bükülü, omuz hizasına kaldır.'),
('Face Pull',          'Face Pull',           'strength', (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 3.5, 'Yüz hizasına çek, arka omuzu hedefle.'),
('Arnold Press',       'Arnold Press',        'strength', (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 4.5, 'Palmalar içe bakarken başla, döndürerek it.'),

-- ÖN KOL
('Barbell Curl',       'Barbell Curl',        'strength', (SELECT id FROM mg WHERE name_en='Bicep'),      FALSE, 4.0, 'Dirsekler sabít, tam hareket.'),
('Dumbbell Curl',      'Dumbbell Curl',       'strength', (SELECT id FROM mg WHERE name_en='Bicep'),      FALSE, 4.0, 'Alternating ya da aynı anda, supinasyon ile.'),
('Hammer Curl',        'Hammer Curl',         'strength', (SELECT id FROM mg WHERE name_en='Bicep'),      FALSE, 3.8, 'Palmalar içe bakar, brakialis hedeflenir.'),

-- ARKA KOL
('Tricep Pushdown',    'Tricep Pushdown',     'strength', (SELECT id FROM mg WHERE name_en='Tricep'),     FALSE, 3.8, 'Dirsekler sabit, tam uzanmaya kadar it.'),
('Overhead Tricep Ext','Overhead Tricep Ext', 'strength', (SELECT id FROM mg WHERE name_en='Tricep'),     FALSE, 3.8, 'Uzun baş için üstün gerisine indir.'),
('Close Grip Bench',   'Close Grip Bench',    'strength', (SELECT id FROM mg WHERE name_en='Tricep'),     FALSE, 5.0, 'Dar tutuş, dirsekler bitişik.'),

-- BACAK
('Squat',              'Squat',               'strength', (SELECT id FROM mg WHERE name_en='Quadriceps'), FALSE, 6.0, 'Kalça diz hizasının altına iner, diz ayak yönünde.'),
('Leg Press',          'Leg Press',           'strength', (SELECT id FROM mg WHERE name_en='Quadriceps'), FALSE, 5.0, 'Bel makineden ayrılmaz, tam hareket.'),
('Lunges',             'Lunges',              'strength', (SELECT id FROM mg WHERE name_en='Quadriceps'), TRUE,  4.0, 'Diz yere değmez, gövde dik.'),
('Romanian Deadlift',  'Romanian Deadlift',   'strength', (SELECT id FROM mg WHERE name_en='Hamstrings'), FALSE, 5.5, 'Bel düz, gergin hissedince geri dön.'),
('Leg Curl',           'Leg Curl',            'strength', (SELECT id FROM mg WHERE name_en='Hamstrings'), FALSE, 4.0, 'Tam uzanmadan tam bükmeye.'),
('Hip Thrust',         'Hip Thrust',          'strength', (SELECT id FROM mg WHERE name_en='Glutes'),     FALSE, 5.0, 'Banka yaslan, bar kalça kemiğinde, köprü kur.'),
('Calf Raise',         'Calf Raise',          'strength', (SELECT id FROM mg WHERE name_en='Calves'),     FALSE, 3.5, 'Tam uzanmadan tam kalkışa, tepe kasıl.'),

-- KARIN
('Plank',              'Plank',               'strength', (SELECT id FROM mg WHERE name_en='Abs'),        TRUE,  3.0, 'Vücut düz, karın sıkı, nefes al.'),
('Crunch',             'Crunch',              'strength', (SELECT id FROM mg WHERE name_en='Abs'),        TRUE,  3.0, 'Boyun güçlenmez, üst sırt kalkışa kadar.'),
('Leg Raise',          'Leg Raise',           'strength', (SELECT id FROM mg WHERE name_en='Abs'),        TRUE,  3.5, 'Bacaklar yere değmeden, kontrollü.'),
('Russian Twist',      'Russian Twist',       'strength', (SELECT id FROM mg WHERE name_en='Abs'),        TRUE,  3.5, 'Ayaklar yerden kalkık, oblik hedef.'),
('Ab Wheel Rollout',   'Ab Wheel Rollout',    'strength', (SELECT id FROM mg WHERE name_en='Abs'),        TRUE,  4.0, 'Yavaş ilerle, bel düz.'),

-- KARDİYO
('Koşu',               'Running',             'cardio',   (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  9.8, 'Aerobik tempo, 5-10 dk ısınma ile başla.'),
('HIIT',               'HIIT',                'cardio',   (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  12.0,'20sn yüksek yoğunluk / 10sn dinlenme, 8 tur.'),
('Bisiklet',           'Cycling',             'cardio',   (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  8.0, 'Sabit veya outdoor, kalp atışı 130-150 bpm.'),
('Atlama İpi',         'Jump Rope',           'cardio',   (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  11.0,'Küçük sıçrayışlar, topuk yere değmez.'),
('Kürek Makinesi',     'Rowing Machine',      'cardio',   (SELECT id FROM mg WHERE name_en='Full Body'),  FALSE, 8.5, 'Bacak it → gövde geri → kol çek sırası.'),

-- MOBİLİTE
('Foam Rolling',       'Foam Rolling',        'mobility', (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  2.5, 'Hassas noktalarda 30-60 sn bekle.'),
('Hip Flexor Stretch', 'Hip Flexor Stretch',  'flexibility',(SELECT id FROM mg WHERE name_en='Full Body'),TRUE,  2.0, 'Kalça önünü hisset, 30 sn tut.'),
('Cat-Cow',            'Cat-Cow',             'mobility', (SELECT id FROM mg WHERE name_en='Lower Back'), TRUE,  2.0, 'Nefes ile senkronize, 10-15 tekrar.')

ON CONFLICT DO NOTHING;
