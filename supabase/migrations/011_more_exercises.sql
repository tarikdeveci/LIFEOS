-- 011_more_exercises.sql
-- Genişletilmiş egzersiz kütüphanesi
-- Kalistenik (ev/calisthenics), salon, yüzme, esneme, yoga, pilates, grup fitness

-- -------------------------------------------------------
-- Yeni kas grubu ekle (mevcut olanlar ON CONFLICT ile atlanır)
-- -------------------------------------------------------
INSERT INTO muscle_groups (name, name_en, body_region) VALUES
  ('Esneklik',    'Flexibility',  'full'),
  ('Yüzme',       'Swimming',     'full')
ON CONFLICT (name) DO NOTHING;

-- -------------------------------------------------------
-- Egzersizler
-- -------------------------------------------------------
WITH mg AS (SELECT id, name_en FROM muscle_groups)
INSERT INTO exercises (name, name_en, category, muscle_group_id, is_bodyweight, met_value, instructions) VALUES

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- KALİSTENİK / EV SPORU — Üst Vücut
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
('Chin-Up',                'Chin-Up',                 'strength',   (SELECT id FROM mg WHERE name_en='Back'),       TRUE,  5.5,  'Avuçlar içe bakar, çene barin üstüne kadar çek.'),
('Ters Barfiks',           'Inverted Row',            'strength',   (SELECT id FROM mg WHERE name_en='Back'),       TRUE,  4.5,  'Bar bele kadar, vücut düz, göğsü bara değdir.'),
('Kas Çekme (Muscle-Up)',  'Muscle-Up',               'strength',   (SELECT id FROM mg WHERE name_en='Back'),       TRUE,  7.0,  'Barfıkstan itişe geçiş, patlayıcı güç gerekir.'),
('Yüzüstü Bar (Front Lever)','Front Lever',           'strength',   (SELECT id FROM mg WHERE name_en='Back'),       TRUE,  6.5,  'Yatay pozisyon koru, karın sık.'),
('Elmas Şınav',            'Diamond Push-Up',         'strength',   (SELECT id FROM mg WHERE name_en='Tricep'),     TRUE,  4.2,  'Eller birbirine yakın elmas şekli, tricep odaklı.'),
('Geniş Tutuş Şınav',      'Wide Push-Up',            'strength',   (SELECT id FROM mg WHERE name_en='Chest'),      TRUE,  3.8,  'Geniş tutuş, dış göğse odaklan.'),
('Piramit Şınav',          'Pike Push-Up',            'strength',   (SELECT id FROM mg WHERE name_en='Shoulder'),   TRUE,  4.0,  'Kalça yukarıda ters V pozisyonu, dirsekler omuz genişliğinde.'),
('El Duruşu Şınav',        'Handstand Push-Up',       'strength',   (SELECT id FROM mg WHERE name_en='Shoulder'),   TRUE,  6.0,  'Duvara yaslanarak ya da serbest, omuz ve tricep.'),
('Bankta Şınav',           'Decline Push-Up',         'strength',   (SELECT id FROM mg WHERE name_en='Chest'),      TRUE,  4.0,  'Ayaklar yüksekte, alt göğse odaklan.'),
('Yükseltilmiş Şınav',     'Elevated Push-Up',        'strength',   (SELECT id FROM mg WHERE name_en='Chest'),      TRUE,  3.5,  'Eller yüksekte (sandalye/kutu), üst göğs hedef.'),
('Tek Kol Şınav',          'One-Arm Push-Up',         'strength',   (SELECT id FROM mg WHERE name_en='Chest'),      TRUE,  5.5,  'Ayaklar geniş, tek kol ile tam hareket.'),
('Bankta Dips',            'Bench Dips',              'strength',   (SELECT id FROM mg WHERE name_en='Tricep'),     TRUE,  4.0,  'Sandalye/bankın kenarına otur, bacaklar düz, tricep çalıştır.'),
('L Pozisyonu',            'L-Sit',                   'strength',   (SELECT id FROM mg WHERE name_en='Abs'),        TRUE,  5.0,  'Kollar düz, bacaklar paralel yerde, karın sık.'),
('Ejderha Bayrağı',        'Dragon Flag',             'strength',   (SELECT id FROM mg WHERE name_en='Abs'),        TRUE,  6.0,  'Banka tut, vücudu düz tut, yavaş indir.'),
('Planche',                'Planche Lean',            'strength',   (SELECT id FROM mg WHERE name_en='Chest'),      TRUE,  6.5,  'Öne eğil, parmaklar arkaya bakar, omuz odaklı.'),

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- KALİSTENİK / EV SPORU — Alt Vücut & Tüm Vücut
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
('Tek Bacak Squat (Tabanca)','Pistol Squat',          'strength',   (SELECT id FROM mg WHERE name_en='Quadriceps'), TRUE,  5.5,  'Tek bacak squat, diğer bacak öne uzatılmış.'),
('Atlama Squat',           'Jump Squat',              'strength',   (SELECT id FROM mg WHERE name_en='Quadriceps'), TRUE,  8.0,  'Squat inişten patlayıcı sıçrama.'),
('Geri Adım',              'Reverse Lunge',           'strength',   (SELECT id FROM mg WHERE name_en='Quadriceps'), TRUE,  4.0,  'Geri adım, diz yere değmez, gövde dik.'),
('Step-Up',                'Step-Up',                 'strength',   (SELECT id FROM mg WHERE name_en='Quadriceps'), TRUE,  5.0,  'Kutu/merdiven basamağına çık, kontrollü in.'),
('Kutu Atlama',            'Box Jump',                'strength',   (SELECT id FROM mg WHERE name_en='Quadriceps'), TRUE,  8.5,  'Patlayıcı sıçrama, yumuşak iniş, kalçayı geri at.'),
('Donkey Calf Raise',      'Donkey Calf Raise',       'strength',   (SELECT id FROM mg WHERE name_en='Calves'),     TRUE,  3.5,  'Öne eğil, elleri destekle, bilekten kalk.'),
('Glute Bridge (Vücut Ağırlığı)','Glute Bridge',      'strength',   (SELECT id FROM mg WHERE name_en='Glutes'),     TRUE,  3.5,  'Sırtüstü, diz bükülü, kalçayı yukarı it.'),
('Tek Bacak Glute Bridge', 'Single Leg Glute Bridge', 'strength',   (SELECT id FROM mg WHERE name_en='Glutes'),     TRUE,  4.0,  'Bir bacak havada, kalçayı yukarı it.'),
('Burpee',                 'Burpee',                  'cardio',     (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  9.0,  'Squat-şınav-sıçrama kombinasyonu, full body.'),
('Dağcı (Mountain Climber)','Mountain Climber',       'cardio',     (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  8.0,  'Plank pozisyonunda alternating diz çekme.'),
('Ayı Yürüyüşü',           'Bear Crawl',              'strength',   (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  5.0,  'Dörde basarak ileri/geri yürüme, karın sıkı.'),
('Süperman',               'Superman',                'strength',   (SELECT id FROM mg WHERE name_en='Lower Back'), TRUE,  3.0,  'Yüzüstü yat, kollar ve bacaklar eş zamanlı kaldır.'),
('Kuş Köpek',              'Bird Dog',                'strength',   (SELECT id FROM mg WHERE name_en='Lower Back'), TRUE,  2.5,  'Dörde bas, karşı el-ayak uzat, denge sağla.'),
('Ölü Böcek',              'Dead Bug',                'strength',   (SELECT id FROM mg WHERE name_en='Abs'),        TRUE,  3.0,  'Sırtüstü, karın sıkı, karşı el-ayak uzat.'),
('Yan Plank',              'Side Plank',              'strength',   (SELECT id FROM mg WHERE name_en='Abs'),        TRUE,  3.5,  'Yan yat, dirseğe yaslan, kalça yerden kalk.'),
('Hollow Body',            'Hollow Body Hold',        'strength',   (SELECT id FROM mg WHERE name_en='Abs'),        TRUE,  3.5,  'Sırtüstü, alt bel yere yapışık, kol ve bacak havada.'),
('Nordic Curl',            'Nordic Hamstring Curl',   'strength',   (SELECT id FROM mg WHERE name_en='Hamstrings'), TRUE,  5.5,  'Ayak bileği sabitlendi, öne doğru kontrollü in.'),
('Squat Tutma',            'Squat Hold (Wall Sit)',   'strength',   (SELECT id FROM mg WHERE name_en='Quadriceps'), TRUE,  3.0,  'Duvara yaslanarak 90 derece squat pozisyonu tut.'),

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SALON EKSTRALARİ
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
('Kablo Fly',              'Cable Fly',               'strength',   (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 4.5,  'Kablo makinesi, kollar yay gibi birleşir.'),
('Pec Deck',               'Pec Deck',                'strength',   (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 4.0,  'Butterfly makinesi, tam yayda göğüs kasılması.'),
('Dumbbell Pullover',      'Dumbbell Pullover',       'strength',   (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 4.5,  'Banka yatay, dumbbell baş üstünden indir, göğüs/sırt.'),
('Preacher Curl',          'Preacher Curl',           'strength',   (SELECT id FROM mg WHERE name_en='Bicep'),      FALSE, 4.0,  'Dirsek pedi üzerinde, bicep tam izolasyon.'),
('İnkline Dumbbell Curl',  'Incline Dumbbell Curl',   'strength',   (SELECT id FROM mg WHERE name_en='Bicep'),      FALSE, 3.8,  'Banka geri eğik, uzun baş bicep.'),
('Konsantrasyon Curl',     'Concentration Curl',      'strength',   (SELECT id FROM mg WHERE name_en='Bicep'),      FALSE, 3.5,  'Oturarak dirsek dizde, tek kol izolasyon.'),
('Kablo Tricep Kickback',  'Cable Tricep Kickback',   'strength',   (SELECT id FROM mg WHERE name_en='Tricep'),     FALSE, 3.5,  'Öne eğil, dirsek sabit, kolu düzelterek geri it.'),
('Kafatası Ezici',         'Skull Crusher',           'strength',   (SELECT id FROM mg WHERE name_en='Tricep'),     FALSE, 4.0,  'Banka yat, bar/dumbbell alına iner, dirsek sabit.'),
('Hack Squat',             'Hack Squat',              'strength',   (SELECT id FROM mg WHERE name_en='Quadriceps'), FALSE, 6.0,  'Makine, sırt destekli, ön bacak odaklı.'),
('Bulgar Squat',           'Bulgarian Split Squat',   'strength',   (SELECT id FROM mg WHERE name_en='Quadriceps'), FALSE, 5.5,  'Arka ayak bankta, ön ayakla tek bacak squat.'),
('Bacak Uzatma',           'Leg Extension',           'strength',   (SELECT id FROM mg WHERE name_en='Quadriceps'), FALSE, 4.0,  'Makine, diz tam açılıncaya kadar kaldır.'),
('Bacak Bükme',            'Leg Curl',                'strength',   (SELECT id FROM mg WHERE name_en='Hamstrings'), FALSE, 4.0,  'Yüzüstü ya da oturarak, tam hareket aralığı.'),
('Oturarak Baldır Kaldırma','Seated Calf Raise',      'strength',   (SELECT id FROM mg WHERE name_en='Calves'),     FALSE, 3.5,  'Makine ile, soleus odaklı.'),
('Good Morning',           'Good Morning',            'strength',   (SELECT id FROM mg WHERE name_en='Hamstrings'), FALSE, 5.0,  'Bar omuzda, öne eğil, bel düz, hamstring gergin.'),
('Hiper Extensiyon',       'Hyperextension',          'strength',   (SELECT id FROM mg WHERE name_en='Lower Back'), FALSE, 4.0,  'Roman sandalyesinde, bel/kalça ekstansiyonu.'),
('T-Bar Row',              'T-Bar Row',               'strength',   (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 5.0,  'T-bar makinesi, göğüse çek, skapula sık.'),
('Göğüs Destekli Row',     'Chest Supported Row',     'strength',   (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 4.5,  'Banka eğik, göğüs destekli, momentum yok.'),
('Dik Barbell Curl',       'Upright Row',             'strength',   (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 4.0,  'Bar ya da dumbbell, çeneye kadar çek.'),
('Ön Kaldırma',            'Front Raise',             'strength',   (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 3.5,  'Kol düz, omuz hizasına kadar kaldır.'),
('Arka Delt Fly',          'Rear Delt Fly',           'strength',   (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 3.5,  'Öne eğil, kollar yana açılır, arka omuz.'),
('Kablo Lateral',          'Cable Lateral Raise',     'strength',   (SELECT id FROM mg WHERE name_en='Shoulder'),   FALSE, 3.5,  'Kablo makinesi, tek veya çift lateral raise.'),
('Omuz Çekme (Shrug)',     'Shrug',                   'strength',   (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 3.5,  'Bar ya da dumbbell, trapezi tepe noktasında sık.'),
('Sumo Deadlift',          'Sumo Deadlift',           'strength',   (SELECT id FROM mg WHERE name_en='Hamstrings'), FALSE, 6.0,  'Geniş duruş, bacaklar dışa, iç kasık odaklı.'),
('Goblet Squat',           'Goblet Squat',            'strength',   (SELECT id FROM mg WHERE name_en='Quadriceps'), FALSE, 5.5,  'Dumbbell/kettlebell göğüste, sırt dik, derin squat.'),
('Kettlebell Swing',       'Kettlebell Swing',        'cardio',     (SELECT id FROM mg WHERE name_en='Glutes'),     FALSE, 8.0,  'Kalça menteşesi, patlayıcı kalça uzantısı, karın sıkı.'),
('Türk Kalkışı',           'Turkish Get-Up',          'strength',   (SELECT id FROM mg WHERE name_en='Full Body'),  FALSE, 5.5,  'Yerden yavaşça ayağa kalk, kettlebell kol yukarıda.'),
('Landmine Press',         'Landmine Press',          'strength',   (SELECT id FROM mg WHERE name_en='Chest'),      FALSE, 4.5,  'Bar ucu yerde sabit, yarı açılı itme hareketi.'),
('Trap Bar Deadlift',      'Trap Bar Deadlift',       'strength',   (SELECT id FROM mg WHERE name_en='Back'),       FALSE, 6.0,  'Hex bar, nötr tutuş, bel yüküne daha az.'),
('Kablo Crunch',           'Cable Crunch',            'strength',   (SELECT id FROM mg WHERE name_en='Abs'),        FALSE, 3.5,  'Diz çökerek kabloyu başın üstünden çek.'),
('Ağırlıklı Plank',        'Weighted Plank',          'strength',   (SELECT id FROM mg WHERE name_en='Abs'),        FALSE, 3.5,  'Sırta ağırlık koyarak plank süresi uzatılır.'),
('Kablo Pallof Press',     'Pallof Press',            'strength',   (SELECT id FROM mg WHERE name_en='Abs'),        FALSE, 3.5,  'Anti-rotasyon güç, kablo yana konumda.'),

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- YÜZME
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
('Serbest Stil Yüzme',     'Freestyle Swimming',      'cardio',     (SELECT id FROM mg WHERE name_en='Swimming'),   TRUE,  8.3,  'Crawl tekniği, nefes ritmi koru.'),
('Kurbağalama',            'Breaststroke',            'cardio',     (SELECT id FROM mg WHERE name_en='Swimming'),   TRUE,  7.0,  'Simetrik kol ve bacak hareketi, efektif nefes.'),
('Sırtüstü Yüzme',         'Backstroke',              'cardio',     (SELECT id FROM mg WHERE name_en='Swimming'),   TRUE,  7.0,  'Sırtüstü, alternating kol, bacak flutter kick.'),
('Kelebek',                'Butterfly Stroke',        'cardio',     (SELECT id FROM mg WHERE name_en='Swimming'),   TRUE,  9.5,  'En zorlu stil, tam vücut wave hareketi.'),
('Yüzme (Genel)',          'Swimming (General)',      'cardio',     (SELECT id FROM mg WHERE name_en='Swimming'),   TRUE,  8.0,  'Herhangi bir yüzme stili ile sürekli havuz antrenmanı.'),
('Su İçi Yürüyüş',         'Water Walking',           'cardio',     (SELECT id FROM mg WHERE name_en='Swimming'),   TRUE,  4.5,  'Bel hizasında su içinde yürüyüş, düşük etki.'),
('Aqua Aerobik',           'Aqua Aerobics',           'cardio',     (SELECT id FROM mg WHERE name_en='Swimming'),   TRUE,  5.5,  'Su içinde grup egzersiz, eklemlere nazik.'),

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ESNEME & ESNEKLIK
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
('Hamstring Germe',        'Hamstring Stretch',       'flexibility',(SELECT id FROM mg WHERE name_en='Hamstrings'), TRUE,  2.0,  'Oturarak ya da ayakta, bacağı düz tut 30 sn.'),
('Quad Germe',             'Quad Stretch',            'flexibility',(SELECT id FROM mg WHERE name_en='Quadriceps'), TRUE,  2.0,  'Ayakta denge kur, topuğu kalçaya çek 30 sn.'),
('Kalça Fleksör Germe',    'Hip Flexor Stretch',      'flexibility',(SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  2.0,  'Öne lunge, arka bacak düz, kalça önü gergin.'),
('Güvercin Pozu',          'Pigeon Pose',             'flexibility',(SELECT id FROM mg WHERE name_en='Glutes'),     TRUE,  2.0,  'Ön bacak yere paralel, kalça açıcı derin esneme.'),
('Çocuk Pozu',             'Childs Pose',             'flexibility',(SELECT id FROM mg WHERE name_en='Lower Back'), TRUE,  1.5,  'Yerde diz çök, kollar öne uzat, bel germe.'),
('Kedi-İnek',              'Cat-Cow Stretch',         'flexibility',(SELECT id FROM mg WHERE name_en='Lower Back'), TRUE,  2.0,  'Dörde bas, nefesle omurga fleksiyon-ekstansiyon.'),
('Kobra Pozu',             'Cobra Pose',              'flexibility',(SELECT id FROM mg WHERE name_en='Lower Back'), TRUE,  2.0,  'Yüzüstü, eller omuz altında, göğsü kaldır.'),
('Oturarak Omurga Burgu',  'Seated Spinal Twist',     'flexibility',(SELECT id FROM mg WHERE name_en='Lower Back'), TRUE,  1.5,  'Otur, bir bacak düz, diğer dizden çevir 30 sn.'),
('Omuz Germe',             'Shoulder Stretch',        'flexibility',(SELECT id FROM mg WHERE name_en='Shoulder'),   TRUE,  1.5,  'Kolu göğüsten karşı tarafına çek 30 sn.'),
('Göğüs Açma',             'Chest Stretch',           'flexibility',(SELECT id FROM mg WHERE name_en='Chest'),      TRUE,  1.5,  'Kapı/köşede eller sabit, öne doğru yaslan.'),
('Baldır Germe',           'Calf Stretch',            'flexibility',(SELECT id FROM mg WHERE name_en='Calves'),     TRUE,  1.5,  'Duvara el bas, arka bacak düz, topuk yerde.'),
('IT Bandı Germe',         'IT Band Stretch',         'flexibility',(SELECT id FROM mg WHERE name_en='Quadriceps'), TRUE,  1.5,  'Ayakta yan eğil, kalça karşı tarafa it.'),
('Boyun Germe',            'Neck Stretch',            'flexibility',(SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  1.5,  'Başı yana eğ, elleri tutma, 20 sn tut.'),
('Kelebek Germe',          'Butterfly Stretch',       'flexibility',(SELECT id FROM mg WHERE name_en='Glutes'),     TRUE,  1.5,  'Otur, ayak tabanları birbirine, dizleri yere bas.'),
('Kertenkele Pozu',        'Lizard Pose',             'flexibility',(SELECT id FROM mg WHERE name_en='Glutes'),     TRUE,  2.0,  'Derin lunge, ön ayak dışta, ön kol yere.'),
('Köprü Germe',            'Bridge Stretch',          'flexibility',(SELECT id FROM mg WHERE name_en='Lower Back'), TRUE,  2.0,  'Sırtüstü yat, elleri başın yanına al, göğsü it.'),
('Aşağı Bakan Köpek',      'Downward Dog',            'flexibility',(SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  2.5,  'V şekli, topukları yere bas, omurga uzasın.'),
('Karşılıklı Dörtlü',      'World Greatest Stretch',  'flexibility',(SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  2.5,  'Lunge + göğüs açma + yan bük kombinasyonu.'),

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- YOGA
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
('Yoga (Genel)',            'Yoga (General)',          'flexibility',(SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  3.0,  'Nefes ve hareket uyumu, esneklik ve güç dengesi.'),
('Güneş Selamı',           'Sun Salutation',          'flexibility',(SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  4.5,  'Yoga sekansı, 12 pose akışı, ısınma için ideal.'),
('Savaşçı I',              'Warrior I',               'flexibility',(SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  3.0,  'Lunge pozisyonu, kollar yukarı, kalça kare.'),
('Savaşçı II',             'Warrior II',              'flexibility',(SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  3.0,  'Yan duruş, kollar yanlarda yatay.'),
('Ağaç Pozu',              'Tree Pose',               'flexibility',(SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  2.5,  'Tek bacak denge, diğer ayak içi uyluğa.'),
('Denge Pozu',             'Warrior III',             'flexibility',(SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  3.0,  'Tek bacak üzerinde T şekli denge.'),
('Yoga Nidra (Derin Gevşeme)','Yoga Nidra',           'flexibility',(SELECT id FROM mg WHERE name_en='Flexibility'),TRUE,  1.2,  'Savasana ile zihin-vücut dinlenmesi.'),
('Yin Yoga',               'Yin Yoga',                'flexibility',(SELECT id FROM mg WHERE name_en='Flexibility'),TRUE,  1.5,  'Pasif pozlar 3-5 dk, derin bağ dokusu esneme.'),

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PİLATES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
('Pilates (Genel)',         'Pilates (General)',       'flexibility',(SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  3.5,  'Core odaklı kontrollü hareketler.'),
('Pilates Roll-Up',        'Pilates Roll-Up',         'flexibility',(SELECT id FROM mg WHERE name_en='Abs'),        TRUE,  3.0,  'Omurga rulo, karın ve hamstring.'),
('Pilates Yüzücü',         'Pilates Swimming',        'flexibility',(SELECT id FROM mg WHERE name_en='Lower Back'), TRUE,  3.0,  'Yüzüstü alternating kol-bacak hareketi.'),
('Pilates Köprü',          'Pilates Bridge',          'flexibility',(SELECT id FROM mg WHERE name_en='Glutes'),     TRUE,  3.0,  'Yavaş ve kontrollü glute bridge, omurga rulo.'),
('Pilates Yüz Kıvırma',    'Pilates Hundred',         'flexibility',(SELECT id FROM mg WHERE name_en='Abs'),        TRUE,  3.5,  'Bacaklar 45°, 100 kez nabız hareketi, nefes ritmi.'),

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- GRUP FITNESS & DİĞER KARDİYO
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
('Yürüyüş',                'Walking',                 'cardio',     (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  3.5,  'Tempolu yürüyüş, duruş dik, kollar serbest.'),
('Hızlı Yürüyüş',          'Brisk Walking',           'cardio',     (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  5.0,  'Hafif nefes açan hız, kalp atışı 100-120 bpm.'),
('Eliptik',                'Elliptical',              'cardio',     (SELECT id FROM mg WHERE name_en='Full Body'),  FALSE, 5.5,  'Eklemlere az yük, sürekli aerobik.'),
('Koşu Bandı',             'Treadmill',               'cardio',     (SELECT id FROM mg WHERE name_en='Full Body'),  FALSE, 8.0,  'Koşu ya da tempolu yürüyüş, eğim ekle.'),
('Merdiven Çıkma',         'Stair Climbing',          'cardio',     (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  9.0,  'Gerçek merdiven ya da step makinesi.'),
('Zumba',                  'Zumba',                   'cardio',     (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  6.5,  'Dans bazlı grup egzersiz, Latin ritim.'),
('Kickboks',               'Kickboxing',              'cardio',     (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  8.5,  'Yumruk-tekme kombinasyonu, kardiyovasküler.'),
('Dans',                   'Dance',                   'cardio',     (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  5.5,  'Serbest dans ya da koreografi, eğlenceli kardiyO.'),
('Tabata',                 'Tabata',                  'cardio',     (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  10.0, '20sn maksimum çalışma / 10sn dinlenme, 8 tur, 4 dk.'),
('Cimnastik',              'Gymnastics',              'strength',   (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  5.5,  'Vücut ağırlıklı beceri çalışması.'),
('Dövüş Sanatları',        'Martial Arts',            'cardio',     (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  7.5,  'Karate, judo, jiujitsu, tekme-yumruk teknikleri.'),
('Boks',                   'Boxing',                  'cardio',     (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  9.0,  'Eldiven ile kese ya da torbaya, footwork önemli.'),
('Trampolin',              'Trampoline',              'cardio',     (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  8.0,  'Sıçrama bazlı, eklemlere az yük, cardio.'),
('Hula Hoop',              'Hula Hoop',               'cardio',     (SELECT id FROM mg WHERE name_en='Abs'),        TRUE,  5.0,  'Kalça dönme hareketi, karın ve bel.'),
('Bisiklet (Outdoor)',     'Outdoor Cycling',         'cardio',     (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  7.5,  'Açık havada, düz ya da eğimli rota.'),
('Spin Bisiklet',          'Spin / Indoor Cycling',   'cardio',     (SELECT id FROM mg WHERE name_en='Full Body'),  FALSE, 9.0,  'Studio ya da evde sabit bisiklet, yüksek yoğunluk.'),
('Yürüyüş (Doğa)',         'Hiking',                  'cardio',     (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  6.0,  'Engebeli arazi, düşük yoğunluk uzun süre.'),

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MOBİLİTE / ISITMA
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
('Eklem Mobilizasyonu',    'Joint Mobility',          'mobility',   (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  2.0,  'Bilek, dirsek, omuz, kalça, diz halka hareketleri.'),
('Bant Çalışması',         'Band Warm-Up',            'mobility',   (SELECT id FROM mg WHERE name_en='Full Body'),  FALSE, 2.5,  'Direnç bandı ile ısınma, mobilite ve aktivasyon.'),
('Dinamik Germe',          'Dynamic Stretching',      'mobility',   (SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  3.5,  'Hareket halinde esneme, antrenman öncesi ideal.'),
('Statik Germe (Genel)',   'Static Stretching',       'flexibility',(SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  2.0,  'Pozisyon tut 20-30 sn, antrenman sonrası ideal.'),
('Nefes Egzersizi',        'Breathing Exercise',      'flexibility',(SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  1.0,  'Diyafram nefesi, 4-7-8 tekniği, stres azaltma.'),
('Soğuma',                 'Cool Down',               'flexibility',(SELECT id FROM mg WHERE name_en='Full Body'),  TRUE,  2.0,  'Yavaş tempolu hareket, kalp atışını normalize et.')

ON CONFLICT DO NOTHING;
