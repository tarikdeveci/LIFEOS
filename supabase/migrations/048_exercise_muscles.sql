-- ============================
-- 048: Yardımcı kas verisi + dört yeni kas grubu
-- ============================
--
-- AI koç son 7 günün kas yükünü "etkili set" olarak görüyor: tamamlanan her set
-- ana kasa 1, her yardımcı kasa 0.4 sayılıyor. secondary_muscle_group_ids 005'ten
-- beri vardı ama hiç doldurulmadı; bench press yapan kullanıcının arka kolu ve
-- omzu hesapta "hiç çalışmamış" görünüyordu.
--
-- Yeni gruplar: Trapez, Önkol ve Bilek, Yan Karın, İç Bacak. name_en değerleri
-- (Traps, Forearms, Obliques, Adductors) mobil ve shared tarafında sözleşmedir,
-- değiştirilmemeli.
--
-- Atama 047 gibi İSİM LİSTESİYLE yapıldı, satır satır gözden geçirilebilsin.
-- İki açık veri seti (exercises-dataset, free-exercise-db) yalnızca referans
-- olarak kullanıldı; isimle otomatik eşleşme güvenilir olmadığı için her satır
-- elle seçildi. Kurallar:
--   * hareket başına en fazla 3 yardımcı kas, ana kas tekrar edilmez
--     (aynı adlı iki satırın ana kası farklıysa UPDATE her satırda ana kası süzer)
--   * izolasyon hareketleri (leg extension, pushdown, calf raise...) bilerek boş
--   * dayanıklılık kardiyosu (koşu, bisiklet, yüzme, dans...) bilerek boş:
--     bir koşu kaydı "bir set" sayıldığı için bacak yükünü şişirirdi
--   * esneme ve mobilite yük hesabına hiç girmiyor; listedekiler tarif amaçlı
-- Kullanıcıların kendi hareketlerine (user_id NOT NULL) dokunulmaz. Dosya
-- tekrar çalıştırılırsa aynı sonucu verir.

INSERT INTO muscle_groups (name, name_en, body_region) VALUES
  ('Trapez',         'Traps',     'upper'),
  ('Önkol ve Bilek', 'Forearms',  'upper'),
  ('Yan Karın',      'Obliques',  'core'),
  ('İç Bacak',       'Adductors', 'lower')
ON CONFLICT (name) DO NOTHING;

-- Aynı ad farklı bir name_en ile zaten varsa aşağıdaki çözümleme sessizce boş
-- kalırdı; bunun yerine migration dursun.
DO $$
BEGIN
  IF (SELECT count(*) FROM muscle_groups
      WHERE name_en IN ('Traps', 'Forearms', 'Obliques', 'Adductors')) <> 4 THEN
    RAISE EXCEPTION '048: Traps, Forearms, Obliques ya da Adductors kas grubu eksik';
  END IF;
END $$;

-- ----------------------------
-- 1) Açıkça yanlış ana kaslar
-- ----------------------------
-- Shrug sırt değil trapez; oblik hareketleri düz karın değil yan karın; adductor
-- makinesi ve kelebek germe kalça değil iç bacak; boyun germe tüm vücut değil
-- trapez. Yardımcı kas süzmesi yeni ana kasa göre yapılsın diye önce bu çalışır.
UPDATE exercises AS e SET muscle_group_id = mg.id
FROM (VALUES
  ('Dumbbell Shrug',        'Traps'),
  ('Omuz Çekme (Shrug)',    'Traps'),
  ('Russian Twist',         'Obliques'),
  ('Yan Plank',             'Obliques'),
  ('Cable Wood Chop',       'Obliques'),
  ('Rotary Torso Machine',  'Obliques'),
  ('Hip Adduction Machine', 'Adductors'),
  ('Kelebek Germe',         'Adductors'),
  ('Boyun Germe',           'Traps')
) AS v(name, muscle), muscle_groups AS mg
WHERE e.user_id IS NULL AND e.name = v.name AND mg.name_en = v.muscle;

-- ----------------------------
-- 2) Yardımcı kaslar (name_en ile çözülür)
-- ----------------------------
UPDATE exercises AS e
SET secondary_muscle_group_ids = ARRAY(
  SELECT mg.id
  FROM unnest(v.secondary) WITH ORDINALITY AS s(name_en, ord)
  JOIN muscle_groups AS mg ON mg.name_en = s.name_en
  WHERE mg.id IS DISTINCT FROM e.muscle_group_id
  ORDER BY s.ord
)
FROM (VALUES
  -- Göğüs: yatay itişler
  ('Bench Press',                            ARRAY['Tricep', 'Shoulder']),
  ('Chest Press Machine',                    ARRAY['Tricep', 'Shoulder']),
  ('Dumbbell Decline Bench Press',           ARRAY['Tricep', 'Shoulder']),
  ('Dumbbell Flat Bench Press',              ARRAY['Tricep', 'Shoulder']),
  ('Dumbbell Hex Press',                     ARRAY['Tricep', 'Shoulder']),
  ('Dumbbell Squeeze Press',                 ARRAY['Tricep', 'Shoulder']),
  ('Smith Machine Bench Press',              ARRAY['Tricep', 'Shoulder']),
  ('Push-Up',                                ARRAY['Tricep', 'Shoulder']),
  ('Geniş Tutuş Şınav',                      ARRAY['Tricep', 'Shoulder']),
  ('Bankta Şınav',                           ARRAY['Tricep', 'Shoulder']),
  ('Yükseltilmiş Şınav',                     ARRAY['Tricep', 'Shoulder']),
  ('Tek Kol Şınav',                          ARRAY['Tricep', 'Shoulder', 'Obliques']),
  ('Dips',                                   ARRAY['Tricep', 'Shoulder']),
  ('Assisted Dip Machine',                   ARRAY['Tricep', 'Shoulder']),
  -- Göğüs: eğimli itişler (ön omuz payı daha büyük)
  ('İnkline Bench Press',                    ARRAY['Shoulder', 'Tricep']),
  ('Dumbbell Incline Bench Press',           ARRAY['Shoulder', 'Tricep']),
  ('Incline Chest Press Machine',            ARRAY['Shoulder', 'Tricep']),
  ('Smith Machine Incline Press',            ARRAY['Shoulder', 'Tricep']),
  ('Landmine Press',                         ARRAY['Shoulder', 'Tricep']),
  -- Göğüs: fly ve diğerleri
  ('Cable Crossover',                        ARRAY['Shoulder']),
  ('Dumbbell Fly',                           ARRAY['Shoulder']),
  ('High to Low Cable Fly',                  ARRAY['Shoulder']),
  ('Low to High Cable Fly',                  ARRAY['Shoulder']),
  ('Kablo Fly',                              ARRAY['Shoulder']),
  ('Pec Deck',                               ARRAY['Shoulder']),
  ('Planche',                                ARRAY['Shoulder', 'Abs']),
  -- Katalogda iki satır: biri Sırt, biri Göğüs ana kaslı; her satır kendi ana
  -- kasını süzüp diğer ikisini alır.
  ('Dumbbell Pullover',                      ARRAY['Chest', 'Back', 'Tricep']),

  -- Sırt: dikey çekişler
  ('Pull-Up',                                ARRAY['Bicep', 'Forearms']),
  ('Chin-Up',                                ARRAY['Bicep', 'Forearms']),
  ('Assisted Pull-Up Machine',               ARRAY['Bicep', 'Forearms']),
  ('Lat Pulldown',                           ARRAY['Bicep', 'Forearms']),
  ('Close Grip Lat Pulldown',                ARRAY['Bicep', 'Forearms']),
  ('Reverse Grip Lat Pulldown',              ARRAY['Bicep', 'Forearms']),
  ('Kas Çekme (Muscle-Up)',                  ARRAY['Bicep', 'Tricep', 'Chest']),
  ('Yüzüstü Bar (Front Lever)',              ARRAY['Abs', 'Shoulder']),
  -- Sırt: desteksiz eğik kürekler (bel izometrik çalışır)
  ('Barbell Row',                            ARRAY['Bicep', 'Traps', 'Lower Back']),
  ('Dumbbell Row',                           ARRAY['Bicep', 'Traps', 'Lower Back']),
  ('Smith Machine Bent Over Row',            ARRAY['Bicep', 'Traps', 'Lower Back']),
  ('T-Bar Row',                              ARRAY['Bicep', 'Traps', 'Lower Back']),
  -- Sırt: destekli, kablolu ve makine kürekler (arka omuz payı)
  ('Cable Row',                              ARRAY['Bicep', 'Traps', 'Shoulder']),
  ('Chest Supported Dumbbell Row',           ARRAY['Bicep', 'Traps', 'Shoulder']),
  ('Göğüs Destekli Row',                     ARRAY['Bicep', 'Traps', 'Shoulder']),
  ('Iso Lateral Row Machine',                ARRAY['Bicep', 'Traps', 'Shoulder']),
  ('Seated Row Machine',                     ARRAY['Bicep', 'Traps', 'Shoulder']),
  ('Single Arm Dumbbell Row',                ARRAY['Bicep', 'Traps', 'Shoulder']),
  ('Ters Barfiks',                           ARRAY['Bicep', 'Traps', 'Shoulder']),
  -- Sırt: deadlift ailesi
  ('Deadlift',                               ARRAY['Glutes', 'Hamstrings', 'Lower Back']),
  ('Dumbbell Deadlift',                      ARRAY['Glutes', 'Hamstrings', 'Lower Back']),
  ('Trap Bar Deadlift',                      ARRAY['Quadriceps', 'Glutes', 'Hamstrings']),

  -- Trapez
  ('Dumbbell Shrug',                         ARRAY['Forearms']),
  ('Omuz Çekme (Shrug)',                     ARRAY['Forearms']),

  -- Omuz: baş üstü itişler
  ('Overhead Press',                         ARRAY['Tricep', 'Traps']),
  ('Standing Dumbbell Press',                ARRAY['Tricep', 'Traps']),
  ('Seated Dumbbell Shoulder Press',         ARRAY['Tricep', 'Traps']),
  ('Shoulder Press Machine',                 ARRAY['Tricep', 'Traps']),
  ('Smith Machine Shoulder Press',           ARRAY['Tricep', 'Traps']),
  ('Arnold Press',                           ARRAY['Tricep', 'Traps']),
  ('Dumbbell Arnold Press',                  ARRAY['Tricep', 'Traps']),
  ('El Duruşu Şınav',                        ARRAY['Tricep', 'Traps']),
  ('Piramit Şınav',                          ARRAY['Tricep', 'Chest']),
  -- Omuz: yan, ön ve arka kaldırışlar
  ('Dumbbell Lateral Raise',                 ARRAY['Traps']),
  ('Lateral Raise',                          ARRAY['Traps']),
  ('Kablo Lateral',                          ARRAY['Traps']),
  ('Lateral Raise Machine',                  ARRAY['Traps']),
  ('Dumbbell Front Raise',                   ARRAY['Chest']),
  ('Ön Kaldırma',                            ARRAY['Chest']),
  ('Arka Delt Fly',                          ARRAY['Traps', 'Back']),
  ('Dumbbell Rear Delt Fly',                 ARRAY['Traps', 'Back']),
  ('Rear Delt Machine',                      ARRAY['Traps', 'Back']),
  ('Face Pull',                              ARRAY['Traps', 'Back']),
  ('Cable Face Pull',                        ARRAY['Traps', 'Back']),
  ('Dik Barbell Curl',                       ARRAY['Traps', 'Bicep']),
  ('Dumbbell Upright Row',                   ARRAY['Traps', 'Bicep']),

  -- Ön kol: brakioradialis her curl'de çalışır
  ('Alternating Dumbbell Curl',              ARRAY['Forearms']),
  ('Barbell Curl',                           ARRAY['Forearms']),
  ('Bicep Curl Machine',                     ARRAY['Forearms']),
  ('Cable EZ Curl',                          ARRAY['Forearms']),
  ('Cross Body Hammer Curl',                 ARRAY['Forearms']),
  ('Dumbbell Curl',                          ARRAY['Forearms']),
  ('Hammer Curl',                            ARRAY['Forearms']),
  ('İnkline Dumbbell Curl',                  ARRAY['Forearms']),
  ('Konsantrasyon Curl',                     ARRAY['Forearms']),
  ('Preacher Curl',                          ARRAY['Forearms']),
  ('Spider Curl',                            ARRAY['Forearms']),
  ('Zottman Curl',                           ARRAY['Forearms']),

  -- Arka kol
  ('Close Grip Bench',                       ARRAY['Chest', 'Shoulder']),
  ('Elmas Şınav',                            ARRAY['Chest', 'Shoulder']),
  ('Bankta Dips',                            ARRAY['Chest', 'Shoulder']),
  ('Cable Overhead Tricep Extension',        ARRAY[]::TEXT[]),
  ('Cable Rope Pushdown',                    ARRAY[]::TEXT[]),
  ('Dumbbell Overhead Tricep Extension',     ARRAY[]::TEXT[]),
  ('Dumbbell Tate Press',                    ARRAY[]::TEXT[]),
  ('Dumbbell Tricep Kickback',               ARRAY[]::TEXT[]),
  ('Kablo Tricep Kickback',                  ARRAY[]::TEXT[]),
  ('Kafatası Ezici',                         ARRAY[]::TEXT[]),
  ('Overhead Tricep Ext',                    ARRAY[]::TEXT[]),
  ('Single Arm Dumbbell Overhead Extension', ARRAY[]::TEXT[]),
  ('Tricep Extension Machine',               ARRAY[]::TEXT[]),
  ('Tricep Pushdown',                        ARRAY[]::TEXT[]),

  -- Ön bacak: çift bacak squat ve pres (iç bacak squat'ta ciddi çalışır)
  ('Squat',                                  ARRAY['Glutes', 'Adductors', 'Lower Back']),
  ('Smith Machine Squat',                    ARRAY['Glutes', 'Adductors']),
  ('Goblet Squat',                           ARRAY['Glutes', 'Adductors']),
  ('Dumbbell Goblet Squat',                  ARRAY['Glutes', 'Adductors']),
  ('Hack Squat',                             ARRAY['Glutes', 'Adductors']),
  ('Pendulum Squat',                         ARRAY['Glutes', 'Adductors']),
  ('Leg Press',                              ARRAY['Glutes', 'Adductors']),
  ('Horizontal Leg Press',                   ARRAY['Glutes', 'Adductors']),
  ('Seated Leg Press',                       ARRAY['Glutes', 'Adductors']),
  -- Ön bacak: tek bacak ve lunge
  ('Lunges',                                 ARRAY['Glutes', 'Adductors']),
  ('Geri Adım',                              ARRAY['Glutes', 'Adductors']),
  ('Dumbbell Reverse Lunge',                 ARRAY['Glutes', 'Adductors']),
  ('Dumbbell Walking Lunge',                 ARRAY['Glutes', 'Adductors']),
  ('Bulgar Squat',                           ARRAY['Glutes', 'Adductors']),
  ('Dumbbell Bulgarian Split Squat',         ARRAY['Glutes', 'Adductors']),
  ('Tek Bacak Squat (Tabanca)',              ARRAY['Glutes', 'Adductors', 'Abs']),
  ('Step-Up',                                ARRAY['Glutes']),
  ('Dumbbell Step-Up',                       ARRAY['Glutes']),
  ('Squat Tutma',                            ARRAY['Glutes']),
  -- Ön bacak: sıçramalar
  ('Atlama Squat',                           ARRAY['Glutes', 'Calves']),
  ('Kutu Atlama',                            ARRAY['Glutes', 'Calves']),
  ('Bacak Uzatma',                           ARRAY[]::TEXT[]),

  -- Arka bacak
  ('Romanian Deadlift',                      ARRAY['Glutes', 'Lower Back']),
  ('Dumbbell Romanian Deadlift',             ARRAY['Glutes', 'Lower Back']),
  ('Smith Machine Romanian Deadlift',        ARRAY['Glutes', 'Lower Back']),
  ('Good Morning',                           ARRAY['Glutes', 'Lower Back']),
  ('Sumo Deadlift',                          ARRAY['Glutes', 'Quadriceps', 'Adductors']),
  ('Nordic Curl',                            ARRAY['Glutes']),
  -- Gastroknemius diz bükmeye yardım eder
  ('Bacak Bükme',                            ARRAY['Calves']),
  ('Leg Curl',                               ARRAY['Calves']),
  ('Lying Leg Curl Machine',                 ARRAY['Calves']),
  ('Seated Leg Curl Machine',                ARRAY['Calves']),

  -- Kalça
  ('Hip Thrust',                             ARRAY['Hamstrings', 'Quadriceps']),
  ('Dumbbell Hip Thrust',                    ARRAY['Hamstrings', 'Quadriceps']),
  ('Glute Bridge (Vücut Ağırlığı)',          ARRAY['Hamstrings']),
  ('Tek Bacak Glute Bridge',                 ARRAY['Hamstrings']),
  ('Glute Kickback Machine',                 ARRAY['Hamstrings']),
  ('Dumbbell Sumo Squat',                    ARRAY['Quadriceps', 'Adductors']),
  ('Hip Abduction Machine',                  ARRAY[]::TEXT[]),

  -- İç bacak
  ('Hip Adduction Machine',                  ARRAY[]::TEXT[]),

  -- Baldır
  ('Calf Raise',                             ARRAY[]::TEXT[]),
  ('Donkey Calf Raise',                      ARRAY[]::TEXT[]),
  ('Dumbbell Calf Raise',                    ARRAY[]::TEXT[]),
  ('Oturarak Baldır Kaldırma',               ARRAY[]::TEXT[]),
  ('Standing Calf Raise Machine',            ARRAY[]::TEXT[]),

  -- Bel
  ('Hiper Extensiyon',                       ARRAY['Glutes', 'Hamstrings']),
  ('Süperman',                               ARRAY['Glutes', 'Hamstrings']),
  ('Kuş Köpek',                              ARRAY['Glutes', 'Abs']),

  -- Karın: yan karın neredeyse her karın hareketinde yardım eder
  ('Crunch',                                 ARRAY['Obliques']),
  ('Kablo Crunch',                           ARRAY['Obliques']),
  ('Ab Crunch Machine',                      ARRAY['Obliques']),
  ('Leg Raise',                              ARRAY['Obliques']),
  ('Hollow Body',                            ARRAY['Obliques']),
  ('Ölü Böcek',                              ARRAY['Obliques']),
  ('Plank',                                  ARRAY['Obliques', 'Shoulder']),
  ('Ağırlıklı Plank',                        ARRAY['Obliques', 'Shoulder']),
  ('Kablo Pallof Press',                     ARRAY['Obliques', 'Shoulder']),
  ('Ab Wheel Rollout',                       ARRAY['Obliques', 'Back', 'Shoulder']),
  ('Ejderha Bayrağı',                        ARRAY['Obliques', 'Back']),
  ('L Pozisyonu',                            ARRAY['Tricep', 'Quadriceps']),

  -- Yan karın
  ('Russian Twist',                          ARRAY['Abs']),
  ('Rotary Torso Machine',                   ARRAY['Abs']),
  ('Cable Wood Chop',                        ARRAY['Abs', 'Shoulder']),
  ('Yan Plank',                              ARRAY['Abs', 'Shoulder']),

  -- Tüm vücut kuvvet (Cimnastik bilerek boş: hangi kasın çalıştığı belirsiz)
  ('Türk Kalkışı',                           ARRAY['Shoulder', 'Obliques', 'Glutes']),
  ('Ayı Yürüyüşü',                           ARRAY['Shoulder', 'Abs', 'Quadriceps']),
  ('Cimnastik',                              ARRAY[]::TEXT[]),

  -- Kardiyo: yalnızca direnç bileşeni belirgin olanlar
  ('Kettlebell Swing',                       ARRAY['Hamstrings', 'Lower Back']),
  ('Kürek Makinesi',                         ARRAY['Back', 'Quadriceps']),
  ('Burpee',                                 ARRAY['Chest', 'Quadriceps', 'Shoulder']),
  ('Dağcı (Mountain Climber)',               ARRAY['Abs', 'Shoulder']),
  ('Merdiven Çıkma',                         ARRAY['Quadriceps', 'Glutes', 'Calves']),
  ('Atlama İpi',                             ARRAY['Calves']),
  ('Hula Hoop',                              ARRAY['Obliques']),

  -- Esneme (yük hesabına girmez, tarif amaçlı)
  ('Aşağı Bakan Köpek',                      ARRAY['Hamstrings', 'Calves', 'Shoulder']),
  ('Denge Pozu',                             ARRAY['Hamstrings', 'Glutes']),
  ('Kertenkele Pozu',                        ARRAY['Adductors', 'Hamstrings']),
  ('Oturarak Omurga Burgu',                  ARRAY['Obliques']),
  ('Pilates Köprü',                          ARRAY['Hamstrings', 'Lower Back']),
  ('Pilates Yüzücü',                         ARRAY['Glutes', 'Shoulder']),
  ('Pilates Yüz Kıvırma',                    ARRAY['Obliques'])
) AS v(name, secondary)
WHERE e.user_id IS NULL AND e.name = v.name;
