-- 012_expand_dumbbell_machine_library.sql
-- Dumbbell ve makine egzersiz havuzunu belirgin şekilde genişlet

WITH mg AS (SELECT id, name_en FROM muscle_groups)
INSERT INTO exercises (name, name_en, category, muscle_group_id, is_bodyweight, met_value, instructions) VALUES

-- DUMBBELL — GOGUS
('Dumbbell Flat Bench Press',      'Dumbbell Flat Bench Press',      'strength', (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 5.0, 'Dumbbelllari kontrollu indir, goguste hafif duraklayip yukari it.'),
('Dumbbell Incline Bench Press',   'Dumbbell Incline Bench Press',   'strength', (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 5.0, '30-45 derece bankta ust gogus odakli press.'),
('Dumbbell Decline Bench Press',   'Dumbbell Decline Bench Press',   'strength', (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 5.0, 'Alt gogus odakli, hareketi tam aciklikla yap.'),
('Dumbbell Squeeze Press',         'Dumbbell Squeeze Press',         'strength', (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 4.5, 'Iki dumbbelli birbirine bastirarak press yap, ic gogus odakli.'),
('Dumbbell Fly',                   'Dumbbell Fly',                   'strength', (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 4.0, 'Dirsek hafif kirik, alt noktada omzu zorlama.'),
('Dumbbell Hex Press',             'Dumbbell Hex Press',             'strength', (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 4.5, 'Dumbbelllar birbirine temas ederek press yap.'),

-- DUMBBELL — SIRT
('Dumbbell Row',                   'Dumbbell Row',                   'strength', (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 4.5, 'Bir diz bankta, dirsegi kalcaya dogru cek.'),
('Single Arm Dumbbell Row',        'Single Arm Dumbbell Row',        'strength', (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 4.5, 'Tek kol row, skapulayi geriye ve asagi cek.'),
('Chest Supported Dumbbell Row',   'Chest Supported Dumbbell Row',   'strength', (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 4.5, 'Gogus destekli bankta momentum kullanmadan row.'),
('Dumbbell Romanian Deadlift',     'Dumbbell Romanian Deadlift',     'strength', (SELECT id FROM mg WHERE name_en='Hamstrings'), FALSE, 5.0, 'Dumbbelllar bacaklara yakin, bel duz, kalca geriye.'),
('Dumbbell Deadlift',              'Dumbbell Deadlift',              'strength', (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 5.5, 'Nötr tutusla yerden kalk, kalca ve diz ayni anda acilsin.'),
('Dumbbell Pullover',              'Dumbbell Pullover',              'strength', (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 4.0, 'Bas ustunden geriye ac, lat ve serratus hisset.'),

-- DUMBBELL — OMUZ
('Seated Dumbbell Shoulder Press', 'Seated Dumbbell Shoulder Press', 'strength', (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 4.5, 'Oturarak press, bel boslugunu koru.'),
('Standing Dumbbell Press',        'Standing Dumbbell Press',        'strength', (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 4.5, 'Ayakta press, karin ve kalca siki tut.'),
('Dumbbell Lateral Raise',         'Dumbbell Lateral Raise',         'strength', (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 3.5, 'Kollari omuz hizasina kadar ac, trap ile cekme.'),
('Dumbbell Front Raise',           'Dumbbell Front Raise',           'strength', (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 3.5, 'Tek tek ya da beraber, omuz hizasinda durdur.'),
('Dumbbell Rear Delt Fly',         'Dumbbell Rear Delt Fly',         'strength', (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 3.5, 'One egilerek arka omuzu izole et.'),
('Dumbbell Arnold Press',          'Dumbbell Arnold Press',          'strength', (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 4.5, 'Avuclar yuzune bakarken basla, cevirerek yukari it.'),
('Dumbbell Upright Row',           'Dumbbell Upright Row',           'strength', (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 4.0, 'Dirsekleri yukari sur, omzu sıkıstırma noktasinda durdur.'),
('Dumbbell Shrug',                 'Dumbbell Shrug',                 'strength', (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 3.5, 'Omuzlari kulaga dogru cek, boynu ileri itme.'),

-- DUMBBELL — KOL
('Alternating Dumbbell Curl',      'Alternating Dumbbell Curl',      'strength', (SELECT id FROM mg WHERE name_en='Bicep'),      FALSE, 3.8, 'Tek tek curl yap, supinasyonu yukarida tamamla.'),
('Cross Body Hammer Curl',         'Cross Body Hammer Curl',         'strength', (SELECT id FROM mg WHERE name_en='Bicep'),      FALSE, 3.8, 'Dumbbelli capraz omza cek, brakialis odakli.'),
('Zottman Curl',                   'Zottman Curl',                   'strength', (SELECT id FROM mg WHERE name_en='Bicep'),      FALSE, 3.8, 'Yukari normal curl, asagida pronasyonlu indir.'),
('Spider Curl',                    'Spider Curl',                    'strength', (SELECT id FROM mg WHERE name_en='Bicep'),      FALSE, 3.8, 'Egil bankta bicepi izolasyonla calistir.'),
('Dumbbell Overhead Tricep Extension','Dumbbell Overhead Tricep Extension','strength',(SELECT id FROM mg WHERE name_en='Tricep'),FALSE, 3.8, 'Tek ya da cift dumbbell ile dirsegi sabit tut.'),
('Single Arm Dumbbell Overhead Extension','Single Arm Dumbbell Overhead Extension','strength',(SELECT id FROM mg WHERE name_en='Tricep'),FALSE, 3.5, 'Tek kol ustten extension, tam uzat.'),
('Dumbbell Tricep Kickback',       'Dumbbell Tricep Kickback',       'strength', (SELECT id FROM mg WHERE name_en='Tricep'),     FALSE, 3.2, 'One egil, dirsek sabit, kolu geriye tam uzat.'),
('Dumbbell Tate Press',            'Dumbbell Tate Press',            'strength', (SELECT id FROM mg WHERE name_en='Tricep'),     FALSE, 3.8, 'Banka ustunde dumbbelllari gogse dogru indir.'),

-- DUMBBELL — ALT VUCUT
('Dumbbell Goblet Squat',          'Dumbbell Goblet Squat',          'strength', (SELECT id FROM mg WHERE name_en='Quadriceps'), FALSE, 5.0, 'Dumbbelli goguste tut, derin squat yap.'),
('Dumbbell Bulgarian Split Squat', 'Dumbbell Bulgarian Split Squat', 'strength', (SELECT id FROM mg WHERE name_en='Quadriceps'), FALSE, 5.5, 'Arka ayak yuksekte, on bacakla guc uret.'),
('Dumbbell Walking Lunge',         'Dumbbell Walking Lunge',         'strength', (SELECT id FROM mg WHERE name_en='Quadriceps'), FALSE, 5.0, 'Her adimda dengeli inis ve dik govde.'),
('Dumbbell Reverse Lunge',         'Dumbbell Reverse Lunge',         'strength', (SELECT id FROM mg WHERE name_en='Quadriceps'), FALSE, 4.8, 'Geri adimla kalca ve on bacak kontrolu.'),
('Dumbbell Step-Up',               'Dumbbell Step-Up',               'strength', (SELECT id FROM mg WHERE name_en='Quadriceps'), FALSE, 5.0, 'Kutunun ustune topuktan iterek cik.'),
('Dumbbell Hip Thrust',            'Dumbbell Hip Thrust',            'strength', (SELECT id FROM mg WHERE name_en='Glutes'),     FALSE, 5.0, 'Dumbbelli kalcada sabitle, tepe noktada kalcayi sik.'),
('Dumbbell Calf Raise',            'Dumbbell Calf Raise',            'strength', (SELECT id FROM mg WHERE name_en='Calves'),     FALSE, 3.5, 'Ayak ucunda tam yukselis ve kontrollu inis.'),
('Dumbbell Sumo Squat',            'Dumbbell Sumo Squat',            'strength', (SELECT id FROM mg WHERE name_en='Glutes'),     FALSE, 5.0, 'Genis durus, dumbbell ortada, ic bacak ve kalca odakli.'),

-- MACHINES — GOGUS / OMUZ
('Chest Press Machine',            'Chest Press Machine',            'strength', (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 4.5, 'Omuzlari geride tut, kollar tam kilitlenmeden durdur.'),
('Incline Chest Press Machine',    'Incline Chest Press Machine',    'strength', (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 4.5, 'Ust gogus odakli makine press.'),
('Shoulder Press Machine',         'Shoulder Press Machine',         'strength', (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 4.5, 'Dirsekler omuz altina cok dusmeden press.'),
('Lateral Raise Machine',          'Lateral Raise Machine',          'strength', (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 3.5, 'Makinede kontrollu omuz abdüksiyonu.'),
('Rear Delt Machine',              'Rear Delt Machine',              'strength', (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 3.5, 'Arka omuz icin ters pec deck paterni.'),
('Smith Machine Bench Press',      'Smith Machine Bench Press',      'strength', (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 5.0, 'Rayli sistemde press, ayak ve skapula sabit.'),
('Smith Machine Incline Press',    'Smith Machine Incline Press',    'strength', (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 5.0, 'Smith incline press ile ust gogus odakla.'),
('Smith Machine Shoulder Press',   'Smith Machine Shoulder Press',   'strength', (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 4.5, 'Smith bar ile dikey press, boynu zorlamadan.'),

-- MACHINES — SIRT
('Seated Row Machine',             'Seated Row Machine',             'strength', (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 4.5, 'Gogsu kaldir, dirsekleri kalcaya cek.'),
('Iso Lateral Row Machine',        'Iso Lateral Row Machine',        'strength', (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 4.5, 'Her kolu bagimsiz calistir, dengesizlikleri azalt.'),
('Close Grip Lat Pulldown',        'Close Grip Lat Pulldown',        'strength', (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 4.5, 'Dar tutusla alt latlara odaklan.'),
('Reverse Grip Lat Pulldown',      'Reverse Grip Lat Pulldown',      'strength', (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 4.5, 'Supine tutusla lat ve bicep katkisini artir.'),
('Assisted Pull-Up Machine',       'Assisted Pull-Up Machine',       'strength', (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 4.5, 'Destek agirligi ile tam cekis paternini ogren.'),
('Assisted Dip Machine',           'Assisted Dip Machine',           'strength', (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 4.5, 'Destekle dip hareketini kontrollu yap.'),
('Smith Machine Bent Over Row',    'Smith Machine Bent Over Row',    'strength', (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 5.0, 'Smith bar ile sabit yol row, bel duz kalsin.'),

-- MACHINES — KOL
('Bicep Curl Machine',             'Bicep Curl Machine',             'strength', (SELECT id FROM mg WHERE name_en='Bicep'),      FALSE, 3.8, 'Makinede dirsegi sabit tutarak tam curl yap.'),
('Tricep Extension Machine',       'Tricep Extension Machine',       'strength', (SELECT id FROM mg WHERE name_en='Tricep'),     FALSE, 3.8, 'Dirsek eksenini koru, tam uzat.'),
('Cable Rope Pushdown',            'Cable Rope Pushdown',            'strength', (SELECT id FROM mg WHERE name_en='Tricep'),     FALSE, 3.8, 'Halati asagida ayirarak tricepi sIk.'),
('Cable Overhead Tricep Extension','Cable Overhead Tricep Extension','strength', (SELECT id FROM mg WHERE name_en='Tricep'),     FALSE, 3.8, 'Kabloda ustten extension, dirsekler sabit.'),
('Cable EZ Curl',                  'Cable EZ Curl',                  'strength', (SELECT id FROM mg WHERE name_en='Bicep'),      FALSE, 3.8, 'Kablo gerilimini tum hareket boyunca koru.'),

-- MACHINES — ALT VUCUT
('Seated Leg Press',               'Seated Leg Press',               'strength', (SELECT id FROM mg WHERE name_en='Quadriceps'), FALSE, 5.5, 'Ayak yerlesimine gore quad veya glute vurgusu degisir.'),
('Horizontal Leg Press',           'Horizontal Leg Press',           'strength', (SELECT id FROM mg WHERE name_en='Quadriceps'), FALSE, 5.5, 'Yatay leg press, bel destegini koru.'),
('Pendulum Squat',                 'Pendulum Squat',                 'strength', (SELECT id FROM mg WHERE name_en='Quadriceps'), FALSE, 6.0, 'Makinede derin squat paterni, quad odakli.'),
('Smith Machine Squat',            'Smith Machine Squat',            'strength', (SELECT id FROM mg WHERE name_en='Quadriceps'), FALSE, 5.5, 'Rayli sistemde squat, ayak pozisyonunu amaca gore ayarla.'),
('Smith Machine Romanian Deadlift','Smith Machine Romanian Deadlift','strength', (SELECT id FROM mg WHERE name_en='Hamstrings'), FALSE, 5.5, 'Smith bar ile kalca menteşesi, hamstring gerginligi hisset.'),
('Seated Leg Curl Machine',        'Seated Leg Curl Machine',        'strength', (SELECT id FROM mg WHERE name_en='Hamstrings'), FALSE, 4.0, 'Oturarak hamstring curl, pelvis sabit kalsin.'),
('Lying Leg Curl Machine',         'Lying Leg Curl Machine',         'strength', (SELECT id FROM mg WHERE name_en='Hamstrings'), FALSE, 4.0, 'Yuzustu curl, alt noktada dizleri tam ac.'),
('Glute Kickback Machine',         'Glute Kickback Machine',         'strength', (SELECT id FROM mg WHERE name_en='Glutes'),     FALSE, 4.0, 'Kalca ekstansiyonunu belden degil kalcadan uret.'),
('Hip Abduction Machine',          'Hip Abduction Machine',          'strength', (SELECT id FROM mg WHERE name_en='Glutes'),     FALSE, 3.5, 'Dizleri disa acarak glute mediusu hedefle.'),
('Hip Adduction Machine',          'Hip Adduction Machine',          'strength', (SELECT id FROM mg WHERE name_en='Glutes'),     FALSE, 3.5, 'Ic bacaklari kontrollu kapat, momentum kullanma.'),
('Standing Calf Raise Machine',    'Standing Calf Raise Machine',    'strength', (SELECT id FROM mg WHERE name_en='Calves'),     FALSE, 3.5, 'Tam asagi esneme ve tam yukselis ile calis.'),

-- MACHINES — CORE / CABLE
('Ab Crunch Machine',              'Ab Crunch Machine',              'strength', (SELECT id FROM mg WHERE name_en='Abs'),        FALSE, 3.5, 'Karni iceri cek, boyundan cekme yapma.'),
('Rotary Torso Machine',           'Rotary Torso Machine',           'strength', (SELECT id FROM mg WHERE name_en='Abs'),        FALSE, 3.5, 'Kontrollu rotasyon, omurgayi zorlamadan yap.'),
('Cable Wood Chop',                'Cable Wood Chop',                'strength', (SELECT id FROM mg WHERE name_en='Abs'),        FALSE, 3.8, 'Yukaridan asagi ya da asagidan yukari diagonal cekis.'),
('Cable Crossover',                'Cable Crossover',                'strength', (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 4.2, 'Kablolari yay cizerek onunde birlestir.'),
('Low to High Cable Fly',          'Low to High Cable Fly',          'strength', (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 4.0, 'Alt pozisyondan ust ic goguse dogru cekis.'),
('High to Low Cable Fly',          'High to Low Cable Fly',          'strength', (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 4.0, 'Ust pozisyondan alt goguse dogru fly paterni.'),
('Cable Face Pull',                'Cable Face Pull',                'strength', (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 3.5, 'Halati yuze cek, arka omuz ve rotator cuff odakli.')

ON CONFLICT DO NOTHING;