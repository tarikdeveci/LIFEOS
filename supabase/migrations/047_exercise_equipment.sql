-- ============================
-- 047: Hareketlerin ekipman gereksinimi + ev kurulumu şablonları
-- ============================
--
-- Kullanıcı erişebildiği aletleri tek tek seçiyor; programlar bu listeye göre
-- süzülüyor, uyarlanıyor ve koç yalnızca yapılabilir hareket yazıyor. Bunun
-- için her hareketin HANGİ aletleri istediği bilinmeli. Şimdiye kadar yalnızca
-- is_bodyweight vardı; web arayüzü ekipmanı isimden regex ile tahmin ediyordu.
--
-- equipment TEXT[] anlamı: listedeki aletlerin HEPSİ gerekli.
--   NULL  = bilinmiyor. Süzmede elenmez (yanlışlıkla gizlemek, göstermekten kötü).
--   '{}'  = alet gerekmez.
--
-- Kullanıcının seçimi user_profiles.preferences.workout_equipment içinde
-- (e-posta tercihleriyle aynı kalıp). Anahtar yok = seçim yapılmamış, uygulama
-- bugünkü gibi tam donanımlı salon varsayar.
--
-- Atama İSİM LİSTESİYLE yapıldı, kural olarak değil: satır satır gözden
-- geçirilebilsin. Belirsiz olanlar bilerek NULL: "Bisiklet" hem yol hem sabit
-- bisiklet olabilir, "Ağırlıklı Plank" plaka da dambıl da olabilir.

ALTER TABLE exercises ADD COLUMN IF NOT EXISTS equipment TEXT[];

COMMENT ON COLUMN exercises.equipment IS
  'Hareketin gerektirdiği aletler (hepsi gerekli). NULL = bilinmiyor, {} = alet gerekmez. Anahtarlar: packages/shared/src/constants/equipment.ts';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exercises_equipment_known') THEN
    ALTER TABLE exercises ADD CONSTRAINT exercises_equipment_known CHECK (
      equipment IS NULL OR equipment <@ ARRAY[
        'dumbbell', 'barbell', 'trap_bar', 'kettlebell',
        'bench', 'squat_rack', 'pullup_bar', 'dip_station', 'hyperextension',
        'cable', 'smith_machine', 'leg_press', 'hack_squat', 'leg_machines', 'upper_machines',
        'resistance_band', 'ab_wheel', 'jump_rope',
        'treadmill', 'exercise_bike', 'elliptical', 'rowing_machine',
        'pool', 'bicycle'
      ]::TEXT[]
    );
  END IF;
END $$;

-- Vücut ağırlığı hareketleri varsayılan olarak alet istemez; istisnalar aşağıdaki
-- listede ezilir (barfiks barı, paralel bar, havuz...).
UPDATE exercises SET equipment = '{}'
WHERE user_id IS NULL AND is_bodyweight = true AND equipment IS NULL;

UPDATE exercises AS e SET equipment = v.equipment
FROM (VALUES
  -- Dambıl
  ('Alternating Dumbbell Curl',              ARRAY['dumbbell']),
  ('Arka Delt Fly',                          ARRAY['dumbbell']),
  ('Arnold Press',                           ARRAY['dumbbell']),
  ('Cross Body Hammer Curl',                 ARRAY['dumbbell']),
  ('Dumbbell Arnold Press',                  ARRAY['dumbbell']),
  ('Dumbbell Bulgarian Split Squat',         ARRAY['dumbbell']),
  ('Dumbbell Calf Raise',                    ARRAY['dumbbell']),
  ('Dumbbell Curl',                          ARRAY['dumbbell']),
  ('Dumbbell Deadlift',                      ARRAY['dumbbell']),
  ('Dumbbell Front Raise',                   ARRAY['dumbbell']),
  ('Dumbbell Goblet Squat',                  ARRAY['dumbbell']),
  ('Dumbbell Lateral Raise',                 ARRAY['dumbbell']),
  ('Dumbbell Overhead Tricep Extension',     ARRAY['dumbbell']),
  ('Dumbbell Rear Delt Fly',                 ARRAY['dumbbell']),
  ('Dumbbell Reverse Lunge',                 ARRAY['dumbbell']),
  ('Dumbbell Romanian Deadlift',             ARRAY['dumbbell']),
  ('Dumbbell Row',                           ARRAY['dumbbell']),
  ('Dumbbell Shrug',                         ARRAY['dumbbell']),
  ('Dumbbell Step-Up',                       ARRAY['dumbbell']),
  ('Dumbbell Sumo Squat',                    ARRAY['dumbbell']),
  ('Dumbbell Tricep Kickback',               ARRAY['dumbbell']),
  ('Dumbbell Upright Row',                   ARRAY['dumbbell']),
  ('Dumbbell Walking Lunge',                 ARRAY['dumbbell']),
  ('Goblet Squat',                           ARRAY['dumbbell']),
  ('Hammer Curl',                            ARRAY['dumbbell']),
  ('Konsantrasyon Curl',                     ARRAY['dumbbell']),
  ('Lateral Raise',                          ARRAY['dumbbell']),
  ('Omuz Çekme (Shrug)',                     ARRAY['dumbbell']),
  ('Ön Kaldırma',                            ARRAY['dumbbell']),
  ('Overhead Tricep Ext',                    ARRAY['dumbbell']),
  ('Single Arm Dumbbell Overhead Extension', ARRAY['dumbbell']),
  ('Single Arm Dumbbell Row',                ARRAY['dumbbell']),
  ('Standing Dumbbell Press',                ARRAY['dumbbell']),
  ('Zottman Curl',                           ARRAY['dumbbell']),
  -- Dambıl + sehpa (sırt ya da göğüs sehpaya dayanıyor)
  ('Chest Supported Dumbbell Row',           ARRAY['dumbbell', 'bench']),
  ('Dumbbell Decline Bench Press',           ARRAY['dumbbell', 'bench']),
  ('Dumbbell Flat Bench Press',              ARRAY['dumbbell', 'bench']),
  ('Dumbbell Fly',                           ARRAY['dumbbell', 'bench']),
  ('Dumbbell Hex Press',                     ARRAY['dumbbell', 'bench']),
  ('Dumbbell Hip Thrust',                    ARRAY['dumbbell', 'bench']),
  ('Dumbbell Incline Bench Press',           ARRAY['dumbbell', 'bench']),
  ('Dumbbell Pullover',                      ARRAY['dumbbell', 'bench']),
  ('Dumbbell Squeeze Press',                 ARRAY['dumbbell', 'bench']),
  ('Dumbbell Tate Press',                    ARRAY['dumbbell', 'bench']),
  ('Göğüs Destekli Row',                     ARRAY['dumbbell', 'bench']),
  ('İnkline Dumbbell Curl',                  ARRAY['dumbbell', 'bench']),
  ('Seated Dumbbell Shoulder Press',         ARRAY['dumbbell', 'bench']),
  ('Spider Curl',                            ARRAY['dumbbell', 'bench']),
  -- Barbell
  ('Barbell Curl',                           ARRAY['barbell']),
  ('Barbell Row',                            ARRAY['barbell']),
  ('Deadlift',                               ARRAY['barbell']),
  ('Dik Barbell Curl',                       ARRAY['barbell']),
  ('Landmine Press',                         ARRAY['barbell']),
  ('Overhead Press',                         ARRAY['barbell']),
  ('Romanian Deadlift',                      ARRAY['barbell']),
  ('Sumo Deadlift',                          ARRAY['barbell']),
  ('T-Bar Row',                              ARRAY['barbell']),
  ('Bench Press',                            ARRAY['barbell', 'bench']),
  ('Close Grip Bench',                       ARRAY['barbell', 'bench']),
  ('Hip Thrust',                             ARRAY['barbell', 'bench']),
  ('İnkline Bench Press',                    ARRAY['barbell', 'bench']),
  ('Kafatası Ezici',                         ARRAY['barbell', 'bench']),
  ('Preacher Curl',                          ARRAY['barbell', 'bench']),
  ('Squat',                                  ARRAY['barbell', 'squat_rack']),
  ('Good Morning',                           ARRAY['barbell', 'squat_rack']),
  ('Trap Bar Deadlift',                      ARRAY['trap_bar']),
  -- Kettlebell
  ('Kettlebell Swing',                       ARRAY['kettlebell']),
  ('Türk Kalkışı',                           ARRAY['kettlebell']),
  -- Kablo istasyonu (lat pulldown ve kablo row dahil)
  ('Cable Crossover',                        ARRAY['cable']),
  ('Cable EZ Curl',                          ARRAY['cable']),
  ('Cable Face Pull',                        ARRAY['cable']),
  ('Cable Overhead Tricep Extension',        ARRAY['cable']),
  ('Cable Rope Pushdown',                    ARRAY['cable']),
  ('Cable Row',                              ARRAY['cable']),
  ('Cable Wood Chop',                        ARRAY['cable']),
  ('Close Grip Lat Pulldown',                ARRAY['cable']),
  ('Face Pull',                              ARRAY['cable']),
  ('High to Low Cable Fly',                  ARRAY['cable']),
  ('Kablo Crunch',                           ARRAY['cable']),
  ('Kablo Fly',                              ARRAY['cable']),
  ('Kablo Lateral',                          ARRAY['cable']),
  ('Kablo Pallof Press',                     ARRAY['cable']),
  ('Kablo Tricep Kickback',                  ARRAY['cable']),
  ('Lat Pulldown',                           ARRAY['cable']),
  ('Low to High Cable Fly',                  ARRAY['cable']),
  ('Reverse Grip Lat Pulldown',              ARRAY['cable']),
  ('Tricep Pushdown',                        ARRAY['cable']),
  -- Makineler
  ('Smith Machine Bench Press',              ARRAY['smith_machine', 'bench']),
  ('Smith Machine Bent Over Row',            ARRAY['smith_machine']),
  ('Smith Machine Incline Press',            ARRAY['smith_machine', 'bench']),
  ('Smith Machine Romanian Deadlift',        ARRAY['smith_machine']),
  ('Smith Machine Shoulder Press',           ARRAY['smith_machine', 'bench']),
  ('Smith Machine Squat',                    ARRAY['smith_machine']),
  ('Leg Press',                              ARRAY['leg_press']),
  ('Horizontal Leg Press',                   ARRAY['leg_press']),
  ('Seated Leg Press',                       ARRAY['leg_press']),
  ('Hack Squat',                             ARRAY['hack_squat']),
  ('Pendulum Squat',                         ARRAY['hack_squat']),
  ('Bacak Bükme',                            ARRAY['leg_machines']),
  ('Bacak Uzatma',                           ARRAY['leg_machines']),
  ('Calf Raise',                             ARRAY['leg_machines']),
  ('Glute Kickback Machine',                 ARRAY['leg_machines']),
  ('Hip Abduction Machine',                  ARRAY['leg_machines']),
  ('Hip Adduction Machine',                  ARRAY['leg_machines']),
  ('Leg Curl',                               ARRAY['leg_machines']),
  ('Lying Leg Curl Machine',                 ARRAY['leg_machines']),
  ('Oturarak Baldır Kaldırma',               ARRAY['leg_machines']),
  ('Seated Leg Curl Machine',                ARRAY['leg_machines']),
  ('Standing Calf Raise Machine',            ARRAY['leg_machines']),
  ('Ab Crunch Machine',                      ARRAY['upper_machines']),
  ('Assisted Dip Machine',                   ARRAY['upper_machines']),
  ('Assisted Pull-Up Machine',               ARRAY['upper_machines']),
  ('Bicep Curl Machine',                     ARRAY['upper_machines']),
  ('Chest Press Machine',                    ARRAY['upper_machines']),
  ('Incline Chest Press Machine',            ARRAY['upper_machines']),
  ('Iso Lateral Row Machine',                ARRAY['upper_machines']),
  ('Lateral Raise Machine',                  ARRAY['upper_machines']),
  ('Pec Deck',                               ARRAY['upper_machines']),
  ('Rear Delt Machine',                      ARRAY['upper_machines']),
  ('Rotary Torso Machine',                   ARRAY['upper_machines']),
  ('Seated Row Machine',                     ARRAY['upper_machines']),
  ('Shoulder Press Machine',                 ARRAY['upper_machines']),
  ('Tricep Extension Machine',               ARRAY['upper_machines']),
  ('Hiper Extensiyon',                       ARRAY['hyperextension']),
  -- Vücut ağırlığı ama bir alete asılı ya da dayalı
  ('Chin-Up',                                ARRAY['pullup_bar']),
  ('Pull-Up',                                ARRAY['pullup_bar']),
  ('Kas Çekme (Muscle-Up)',                  ARRAY['pullup_bar']),
  ('Ters Barfiks',                           ARRAY['pullup_bar']),
  ('Yüzüstü Bar (Front Lever)',              ARRAY['pullup_bar']),
  ('Dips',                                   ARRAY['dip_station']),
  ('Ejderha Bayrağı',                        ARRAY['bench']),
  ('Ab Wheel Rollout',                       ARRAY['ab_wheel']),
  ('Atlama İpi',                             ARRAY['jump_rope']),
  ('Bant Çalışması',                         ARRAY['resistance_band']),
  -- Kardiyo aletleri
  ('Koşu Bandı',                             ARRAY['treadmill']),
  ('Spin Bisiklet',                          ARRAY['exercise_bike']),
  ('Eliptik',                                ARRAY['elliptical']),
  ('Kürek Makinesi',                         ARRAY['rowing_machine']),
  ('Bisiklet (Outdoor)',                     ARRAY['bicycle']),
  -- Havuz
  ('Aqua Aerobik',                           ARRAY['pool']),
  ('Kelebek',                                ARRAY['pool']),
  ('Kurbağalama',                            ARRAY['pool']),
  ('Serbest Stil Yüzme',                     ARRAY['pool']),
  ('Sırtüstü Yüzme',                         ARRAY['pool']),
  ('Su İçi Yürüyüş',                         ARRAY['pool']),
  ('Yüzme (Genel)',                          ARRAY['pool']),
  -- Alet gerekmez (is_bodyweight false olsa da sandalye yeter)
  ('Bulgar Squat',                           ARRAY[]::TEXT[]),
  -- Bilinmiyor: ya belirsiz ya da katalogda sözlüğe girmeyecek kadar nadir alet
  ('Ağırlıklı Plank',                        NULL::TEXT[]),
  ('Bisiklet',                               NULL::TEXT[]),
  ('Foam Rolling',                           NULL::TEXT[]),
  ('Hula Hoop',                              NULL::TEXT[]),
  ('Trampolin',                              NULL::TEXT[])
) AS v(name, equipment)
WHERE e.user_id IS NULL AND e.name = v.name;


-- ============================
-- Ev kurulumu şablonları
-- ============================
--
-- Mevcut altı şablonun hepsi salon varsayıyor (lat pulldown, leg press, kablo).
-- Evde dambılı ya da hiçbir aleti olmayan kullanıcıya "uyarla" dışında
-- doğrudan başlayabileceği bir program yoktu. Üç kurulum, en yaygın üçü:
-- hiç alet yok, dambıl + sehpa ile tüm vücut, dambıl + sehpa ile üst/alt.

CREATE OR REPLACE FUNCTION seed_add_program_exercise(
  p_day UUID, p_name TEXT, p_sets INT, p_reps INT, p_rest INT, p_order INT, p_notes TEXT DEFAULT NULL
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index, notes)
  SELECT p_day, e.id, p_sets, p_reps, p_rest, p_order, p_notes
  FROM exercises e
  WHERE e.user_id IS NULL AND (e.name_en = p_name OR e.name = p_name)
  ORDER BY e.created_at, e.id
  LIMIT 1;
$$;

DO $$
DECLARE
  prog_id UUID;
  day_id  UUID;
BEGIN

-- ----------------------------------------------------------------
-- 1) Evde vücut ağırlığı, tüm vücut (3 gün)
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM workout_programs WHERE user_id IS NULL AND name = 'Evde Vücut Ağırlığı: Tüm Vücut') THEN
  INSERT INTO workout_programs (name, description, split_type, frequency_per_week)
  VALUES (
    'Evde Vücut Ağırlığı: Tüm Vücut',
    'Haftada 3 gün, hiçbir alet gerekmez. Zorlaştırmak için tekrarı artır, iniş fazını yavaşlat (3 saniye), setler arası dinlenmeyi kısalt.',
    'full_body', 3
  ) RETURNING id INTO prog_id;

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 1, 'Tüm Vücut A') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Push-Up', 3, 12, 60, 1, 'Zorlanıyorsan dizler yerde');
  PERFORM seed_add_program_exercise(day_id, 'Lunges', 3, 10, 60, 2, 'Her bacak için');
  PERFORM seed_add_program_exercise(day_id, 'Glute Bridge', 3, 15, 45, 3);
  PERFORM seed_add_program_exercise(day_id, 'Superman', 3, 12, 45, 4);
  PERFORM seed_add_program_exercise(day_id, 'Bird Dog', 3, 10, 45, 5, 'Her taraf için');
  PERFORM seed_add_program_exercise(day_id, 'Plank', 3, NULL, 45, 6, 'Süre: 30-45 saniye');

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 2, 'Tüm Vücut B') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Pike Push-Up', 3, 8, 75, 1);
  PERFORM seed_add_program_exercise(day_id, 'Jump Squat', 3, 10, 75, 2);
  PERFORM seed_add_program_exercise(day_id, 'Single Leg Glute Bridge', 3, 10, 45, 3, 'Her bacak için');
  PERFORM seed_add_program_exercise(day_id, 'Decline Push-Up', 3, 10, 60, 4);
  PERFORM seed_add_program_exercise(day_id, 'Dead Bug', 3, 10, 45, 5);
  PERFORM seed_add_program_exercise(day_id, 'Side Plank', 3, NULL, 45, 6, 'Süre: her taraf 20-30 saniye');

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 3, 'Tüm Vücut C') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Diamond Push-Up', 3, 8, 75, 1);
  PERFORM seed_add_program_exercise(day_id, 'Reverse Lunge', 3, 10, 60, 2, 'Her bacak için');
  PERFORM seed_add_program_exercise(day_id, 'Bench Dips', 3, 12, 60, 3, 'Sandalye yeterli');
  PERFORM seed_add_program_exercise(day_id, 'Squat Hold (Wall Sit)', 3, NULL, 60, 4, 'Süre: 45 saniye');
  PERFORM seed_add_program_exercise(day_id, 'Mountain Climber', 3, NULL, 45, 5, 'Süre: 30 saniye');
  PERFORM seed_add_program_exercise(day_id, 'Hollow Body Hold', 3, NULL, 45, 6, 'Süre: 20-30 saniye');
END IF;

-- ----------------------------------------------------------------
-- 2) Evde dambıl, tüm vücut (3 gün)
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM workout_programs WHERE user_id IS NULL AND name = 'Evde Dambıl: Tüm Vücut') THEN
  INSERT INTO workout_programs (name, description, split_type, frequency_per_week)
  VALUES (
    'Evde Dambıl: Tüm Vücut',
    'Haftada 3 gün, bir çift dambıl ve düz sehpa yeterli. Ayarlanabilir dambılın varsa bacak hareketlerinde ağır, omuz ve kolda hafif çalış.',
    'full_body', 3
  ) RETURNING id INTO prog_id;

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 1, 'Tüm Vücut A') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Goblet Squat', 3, 12, 90, 1);
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Flat Bench Press', 3, 10, 90, 2);
  PERFORM seed_add_program_exercise(day_id, 'Single Arm Dumbbell Row', 3, 10, 60, 3, 'Her kol için');
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Romanian Deadlift', 3, 10, 90, 4);
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Lateral Raise', 3, 12, 45, 5);
  PERFORM seed_add_program_exercise(day_id, 'Plank', 3, NULL, 45, 6, 'Süre: 30-45 saniye');

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 2, 'Tüm Vücut B') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Reverse Lunge', 3, 10, 75, 1, 'Her bacak için');
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Incline Bench Press', 3, 10, 90, 2);
  PERFORM seed_add_program_exercise(day_id, 'Chest Supported Dumbbell Row', 3, 10, 75, 3);
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Hip Thrust', 3, 12, 75, 4);
  PERFORM seed_add_program_exercise(day_id, 'Seated Dumbbell Shoulder Press', 3, 10, 75, 5);
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Curl', 2, 12, 45, 6);

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 3, 'Tüm Vücut C') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Bulgarian Split Squat', 3, 8, 90, 1, 'Her bacak için');
  PERFORM seed_add_program_exercise(day_id, 'Push-Up', 3, NULL, 60, 2, 'Tükenişe 2 tekrar kala bırak');
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Row', 3, 10, 75, 3);
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Deadlift', 3, 10, 90, 4);
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Overhead Tricep Extension', 2, 12, 45, 5);
  PERFORM seed_add_program_exercise(day_id, 'Dead Bug', 3, 10, 45, 6);
END IF;

-- ----------------------------------------------------------------
-- 3) Evde dambıl, üst/alt (4 gün)
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM workout_programs WHERE user_id IS NULL AND name = 'Evde Dambıl: Üst/Alt') THEN
  INSERT INTO workout_programs (name, description, split_type, frequency_per_week)
  VALUES (
    'Evde Dambıl: Üst/Alt',
    'Haftada 4 gün, dambıl ve ayarlanabilir sehpa ile. Her bölge haftada 2 kez çalışır; tüm vücut programından bir adım ileri, hacim daha yüksek.',
    'upper_lower', 4
  ) RETURNING id INTO prog_id;

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 1, 'Üst Vücut A') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Flat Bench Press', 4, 8, 120, 1);
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Row', 4, 10, 90, 2);
  PERFORM seed_add_program_exercise(day_id, 'Seated Dumbbell Shoulder Press', 3, 10, 90, 3);
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Fly', 3, 12, 60, 4);
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Curl', 3, 12, 45, 5);
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Tricep Kickback', 3, 12, 45, 6);

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 2, 'Alt Vücut A') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Goblet Squat', 4, 10, 120, 1);
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Romanian Deadlift', 4, 10, 90, 2);
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Walking Lunge', 3, 10, 75, 3, 'Her bacak için');
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Calf Raise', 4, 15, 45, 4);
  PERFORM seed_add_program_exercise(day_id, 'Plank', 3, NULL, 45, 5, 'Süre: 30-45 saniye');

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 3, 'Üst Vücut B') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Incline Bench Press', 4, 8, 120, 1);
  PERFORM seed_add_program_exercise(day_id, 'Chest Supported Dumbbell Row', 4, 10, 90, 2);
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Lateral Raise', 3, 15, 45, 3);
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Rear Delt Fly', 3, 15, 45, 4);
  PERFORM seed_add_program_exercise(day_id, 'Hammer Curl', 3, 10, 45, 5);
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Overhead Tricep Extension', 3, 12, 45, 6);

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 4, 'Alt Vücut B') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Bulgarian Split Squat', 3, 8, 90, 1, 'Her bacak için');
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Hip Thrust', 4, 10, 90, 2);
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Step-Up', 3, 10, 75, 3, 'Her bacak için');
  PERFORM seed_add_program_exercise(day_id, 'Dumbbell Sumo Squat', 3, 12, 75, 4);
  PERFORM seed_add_program_exercise(day_id, 'Dead Bug', 3, 10, 45, 5);
END IF;

END $$;

DROP FUNCTION IF EXISTS seed_add_program_exercise(UUID, TEXT, INT, INT, INT, INT, TEXT);
