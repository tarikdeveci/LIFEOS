-- 017_seed_programs.sql
-- 4 global antrenman programı template'i: Bro Split, Push Pull Legs, Full Body, Upper Lower
-- user_id NULL = global template (herkes okuyabilir)

DO $$
DECLARE
  -- Program IDs
  bro_split_id       UUID;
  ppl_id             UUID;
  full_body_id       UUID;
  upper_lower_id     UUID;

  -- Program day IDs
  day_id UUID;

  -- Exercise IDs
  ex_bench_press         UUID;
  ex_incline_bench       UUID;
  ex_dumbbell_fly        UUID;
  ex_cable_fly           UUID;
  ex_dips                UUID;
  ex_deadlift            UUID;
  ex_barbell_row         UUID;
  ex_lat_pulldown        UUID;
  ex_cable_row           UUID;
  ex_pull_up             UUID;
  ex_overhead_press      UUID;
  ex_lateral_raise       UUID;
  ex_face_pull           UUID;
  ex_rear_delt_fly       UUID;
  ex_squat               UUID;
  ex_leg_press           UUID;
  ex_romanian_deadlift   UUID;
  ex_leg_curl            UUID;
  ex_calf_raise          UUID;
  ex_barbell_curl        UUID;
  ex_tricep_pushdown     UUID;
  ex_hammer_curl         UUID;
  ex_skull_crusher       UUID;

BEGIN

  -- ─────────────────────────────────────────────────────────
  -- Egzersiz ID'lerini exercises tablosundan çek
  -- ─────────────────────────────────────────────────────────
  SELECT id INTO ex_bench_press       FROM exercises WHERE name_en ILIKE '%Bench Press%'         AND user_id IS NULL AND category = 'strength' AND name_en NOT ILIKE '%Incline%' AND name_en NOT ILIKE '%Decline%' AND name_en NOT ILIKE '%Dumbbell%' AND name_en NOT ILIKE '%Smith%' AND name_en NOT ILIKE '%Close%' LIMIT 1;
  SELECT id INTO ex_incline_bench     FROM exercises WHERE name_en ILIKE '%Incline Bench Press%'  AND user_id IS NULL AND name_en NOT ILIKE '%Dumbbell%' AND name_en NOT ILIKE '%Smith%' LIMIT 1;
  SELECT id INTO ex_dumbbell_fly      FROM exercises WHERE name_en = 'Dumbbell Fly'               AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_cable_fly         FROM exercises WHERE name_en ILIKE '%Cable Fly%'            AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_dips              FROM exercises WHERE name_en = 'Dips'                       AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_deadlift          FROM exercises WHERE name_en = 'Deadlift'                   AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_barbell_row       FROM exercises WHERE name_en = 'Barbell Row'                AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_lat_pulldown      FROM exercises WHERE name_en = 'Lat Pulldown'               AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_cable_row         FROM exercises WHERE name_en = 'Cable Row'                  AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_pull_up           FROM exercises WHERE name_en = 'Pull-Up'                    AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_overhead_press    FROM exercises WHERE name_en = 'Overhead Press'             AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_lateral_raise     FROM exercises WHERE name_en = 'Lateral Raise'              AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_face_pull         FROM exercises WHERE name_en = 'Face Pull'                  AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_rear_delt_fly     FROM exercises WHERE name_en = 'Rear Delt Fly'              AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_squat             FROM exercises WHERE name_en = 'Squat'                      AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_leg_press         FROM exercises WHERE name_en = 'Leg Press'                  AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_romanian_deadlift FROM exercises WHERE name_en = 'Romanian Deadlift'          AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_leg_curl          FROM exercises WHERE name_en = 'Leg Curl'                   AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_calf_raise        FROM exercises WHERE name_en = 'Calf Raise'                 AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_barbell_curl      FROM exercises WHERE name_en = 'Barbell Curl'               AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_tricep_pushdown   FROM exercises WHERE name_en = 'Tricep Pushdown'            AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_hammer_curl       FROM exercises WHERE name_en = 'Hammer Curl'                AND user_id IS NULL LIMIT 1;
  SELECT id INTO ex_skull_crusher     FROM exercises WHERE name_en = 'Skull Crusher'              AND user_id IS NULL LIMIT 1;


  -- ═══════════════════════════════════════════════════════════
  -- PROGRAM 1: BRO SPLIT (6 gün)
  -- Her gün tek kas grubuna odaklan
  -- ═══════════════════════════════════════════════════════════
  INSERT INTO workout_programs (name, description, split_type, frequency_per_week)
  VALUES (
    'Bro Split',
    'Kas grubu bazlı klasik 6 günlük program. Her gün tek bir kas grubuna maksimum odaklan. Haftada 1 dinlenme günü.',
    'bro_split',
    6
  ) RETURNING id INTO bro_split_id;

  -- Gün 1: Göğüs
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (bro_split_id, 1, 'Göğüs') RETURNING id INTO day_id;
  IF ex_bench_press IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_bench_press, 4, 8, 120, 1);
  END IF;
  IF ex_incline_bench IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_incline_bench, 4, 10, 90, 2);
  END IF;
  IF ex_dumbbell_fly IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_dumbbell_fly, 3, 12, 60, 3);
  END IF;
  IF ex_cable_fly IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_cable_fly, 3, 15, 60, 4);
  END IF;
  IF ex_dips IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_dips, 3, 12, 90, 5);
  END IF;

  -- Gün 2: Sırt
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (bro_split_id, 2, 'Sırt') RETURNING id INTO day_id;
  IF ex_deadlift IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_deadlift, 4, 5, 180, 1);
  END IF;
  IF ex_barbell_row IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_barbell_row, 4, 8, 120, 2);
  END IF;
  IF ex_lat_pulldown IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_lat_pulldown, 3, 12, 90, 3);
  END IF;
  IF ex_cable_row IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_cable_row, 3, 12, 90, 4);
  END IF;
  IF ex_pull_up IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_pull_up, 3, 8, 90, 5);
  END IF;

  -- Gün 3: Omuz
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (bro_split_id, 3, 'Omuz') RETURNING id INTO day_id;
  IF ex_overhead_press IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_overhead_press, 4, 8, 120, 1);
  END IF;
  IF ex_lateral_raise IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_lateral_raise, 4, 15, 60, 2);
  END IF;
  IF ex_face_pull IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_face_pull, 3, 15, 60, 3);
  END IF;
  IF ex_rear_delt_fly IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_rear_delt_fly, 3, 15, 60, 4);
  END IF;

  -- Gün 4: Bacak
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (bro_split_id, 4, 'Bacak') RETURNING id INTO day_id;
  IF ex_squat IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_squat, 4, 8, 180, 1);
  END IF;
  IF ex_leg_press IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_leg_press, 3, 12, 120, 2);
  END IF;
  IF ex_romanian_deadlift IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_romanian_deadlift, 3, 10, 120, 3);
  END IF;
  IF ex_leg_curl IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_leg_curl, 3, 12, 90, 4);
  END IF;
  IF ex_calf_raise IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_calf_raise, 4, 20, 60, 5);
  END IF;

  -- Gün 5: Kol (Bicep & Tricep)
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (bro_split_id, 5, 'Kol') RETURNING id INTO day_id;
  IF ex_barbell_curl IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_barbell_curl, 4, 10, 90, 1);
  END IF;
  IF ex_tricep_pushdown IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_tricep_pushdown, 4, 12, 90, 2);
  END IF;
  IF ex_hammer_curl IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_hammer_curl, 3, 12, 60, 3);
  END IF;
  IF ex_skull_crusher IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_skull_crusher, 3, 12, 90, 4);
  END IF;
  IF ex_dips IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index, notes)
    VALUES (day_id, ex_dips, 3, 15, 60, 5, 'Dik duruş ile tricep odaklı');
  END IF;

  -- Gün 6: Karın + Kardiyo
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (bro_split_id, 6, 'Karın & Kardiyo') RETURNING id INTO day_id;

  -- Gün 7: Dinlenme
  INSERT INTO program_days (program_id, day_number, day_name, is_rest) VALUES (bro_split_id, 7, 'Dinlenme', TRUE);


  -- ═══════════════════════════════════════════════════════════
  -- PROGRAM 2: PUSH PULL LEGS (6 gün)
  -- Push / Pull / Legs / Push / Pull / Legs döngüsü
  -- ═══════════════════════════════════════════════════════════
  INSERT INTO workout_programs (name, description, split_type, frequency_per_week)
  VALUES (
    'Push Pull Legs',
    'İtme (göğüs/omuz/tricep), çekme (sırt/bicep) ve bacak gruplarına ayrılmış 6 günlük bilimsel program. Haftada 2 kez her kas grubunu çalıştırır.',
    'push_pull_legs',
    6
  ) RETURNING id INTO ppl_id;

  -- Gün 1: Push A (Göğüs/Omuz/Tricep)
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (ppl_id, 1, 'Push A — Göğüs Ağırlıklı') RETURNING id INTO day_id;
  IF ex_bench_press IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_bench_press, 4, 8, 120, 1);
  END IF;
  IF ex_incline_bench IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_incline_bench, 3, 10, 90, 2);
  END IF;
  IF ex_overhead_press IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_overhead_press, 3, 10, 90, 3);
  END IF;
  IF ex_lateral_raise IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_lateral_raise, 3, 15, 60, 4);
  END IF;
  IF ex_tricep_pushdown IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_tricep_pushdown, 3, 12, 60, 5);
  END IF;
  IF ex_skull_crusher IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_skull_crusher, 3, 12, 60, 6);
  END IF;

  -- Gün 2: Pull A (Sırt/Bicep)
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (ppl_id, 2, 'Pull A — Dikey Çekiş Ağırlıklı') RETURNING id INTO day_id;
  IF ex_deadlift IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_deadlift, 3, 5, 180, 1);
  END IF;
  IF ex_pull_up IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_pull_up, 4, 8, 120, 2);
  END IF;
  IF ex_lat_pulldown IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_lat_pulldown, 3, 12, 90, 3);
  END IF;
  IF ex_barbell_curl IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_barbell_curl, 3, 10, 90, 4);
  END IF;
  IF ex_hammer_curl IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_hammer_curl, 3, 12, 60, 5);
  END IF;
  IF ex_face_pull IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_face_pull, 3, 15, 60, 6);
  END IF;

  -- Gün 3: Legs A
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (ppl_id, 3, 'Legs A — Quad Ağırlıklı') RETURNING id INTO day_id;
  IF ex_squat IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_squat, 4, 8, 180, 1);
  END IF;
  IF ex_leg_press IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_leg_press, 3, 12, 120, 2);
  END IF;
  IF ex_romanian_deadlift IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_romanian_deadlift, 3, 10, 120, 3);
  END IF;
  IF ex_leg_curl IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_leg_curl, 3, 12, 90, 4);
  END IF;
  IF ex_calf_raise IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_calf_raise, 4, 20, 60, 5);
  END IF;

  -- Gün 4: Push B (Omuz Ağırlıklı)
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (ppl_id, 4, 'Push B — Omuz Ağırlıklı') RETURNING id INTO day_id;
  IF ex_overhead_press IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_overhead_press, 4, 8, 120, 1);
  END IF;
  IF ex_incline_bench IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_incline_bench, 3, 10, 90, 2);
  END IF;
  IF ex_lateral_raise IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_lateral_raise, 4, 15, 60, 3);
  END IF;
  IF ex_rear_delt_fly IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_rear_delt_fly, 3, 15, 60, 4);
  END IF;
  IF ex_dips IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index, notes)
    VALUES (day_id, ex_dips, 3, 12, 90, 5, 'Tricep odaklı, dik gövde');
  END IF;
  IF ex_skull_crusher IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_skull_crusher, 3, 12, 60, 6);
  END IF;

  -- Gün 5: Pull B (Yatay Çekiş Ağırlıklı)
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (ppl_id, 5, 'Pull B — Yatay Çekiş Ağırlıklı') RETURNING id INTO day_id;
  IF ex_barbell_row IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_barbell_row, 4, 8, 120, 1);
  END IF;
  IF ex_cable_row IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_cable_row, 3, 12, 90, 2);
  END IF;
  IF ex_lat_pulldown IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_lat_pulldown, 3, 12, 90, 3);
  END IF;
  IF ex_face_pull IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_face_pull, 3, 15, 60, 4);
  END IF;
  IF ex_barbell_curl IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_barbell_curl, 3, 10, 90, 5);
  END IF;
  IF ex_hammer_curl IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_hammer_curl, 3, 12, 60, 6);
  END IF;

  -- Gün 6: Legs B (Hamstring/Kalça Ağırlıklı)
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (ppl_id, 6, 'Legs B — Hamstring & Kalça Ağırlıklı') RETURNING id INTO day_id;
  IF ex_romanian_deadlift IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_romanian_deadlift, 4, 8, 150, 1);
  END IF;
  IF ex_squat IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_squat, 3, 10, 120, 2);
  END IF;
  IF ex_leg_curl IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_leg_curl, 4, 12, 90, 3);
  END IF;
  IF ex_leg_press IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_leg_press, 3, 15, 90, 4);
  END IF;
  IF ex_calf_raise IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_calf_raise, 4, 20, 60, 5);
  END IF;

  -- Gün 7: Dinlenme
  INSERT INTO program_days (program_id, day_number, day_name, is_rest) VALUES (ppl_id, 7, 'Dinlenme', TRUE);


  -- ═══════════════════════════════════════════════════════════
  -- PROGRAM 3: FULL BODY (3 gün)
  -- Haftada 3 gün tüm vücut çalışması, aralarında dinlenme
  -- ═══════════════════════════════════════════════════════════
  INSERT INTO workout_programs (name, description, split_type, frequency_per_week)
  VALUES (
    'Full Body',
    'Haftada 3 gün tüm vücut antrenmanı. Yeni başlayanlar ve zaman kısıtı olanlar için ideal. Her seansta tüm kas grupları çalışır.',
    'full_body',
    3
  ) RETURNING id INTO full_body_id;

  -- Gün 1: Full Body A (Pazartesi)
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (full_body_id, 1, 'Full Body A') RETURNING id INTO day_id;
  IF ex_squat IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_squat, 3, 8, 150, 1);
  END IF;
  IF ex_bench_press IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_bench_press, 3, 8, 120, 2);
  END IF;
  IF ex_barbell_row IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_barbell_row, 3, 8, 120, 3);
  END IF;
  IF ex_overhead_press IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_overhead_press, 3, 10, 90, 4);
  END IF;
  IF ex_barbell_curl IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_barbell_curl, 2, 12, 60, 5);
  END IF;
  IF ex_tricep_pushdown IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_tricep_pushdown, 2, 12, 60, 6);
  END IF;

  -- Gün 2: Dinlenme (Salı)
  INSERT INTO program_days (program_id, day_number, day_name, is_rest) VALUES (full_body_id, 2, 'Dinlenme', TRUE);

  -- Gün 3: Full Body B (Çarşamba)
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (full_body_id, 3, 'Full Body B') RETURNING id INTO day_id;
  IF ex_deadlift IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_deadlift, 3, 5, 180, 1);
  END IF;
  IF ex_incline_bench IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_incline_bench, 3, 10, 120, 2);
  END IF;
  IF ex_pull_up IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_pull_up, 3, 8, 120, 3);
  END IF;
  IF ex_lateral_raise IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_lateral_raise, 3, 15, 60, 4);
  END IF;
  IF ex_hammer_curl IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_hammer_curl, 2, 12, 60, 5);
  END IF;
  IF ex_skull_crusher IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_skull_crusher, 2, 12, 60, 6);
  END IF;

  -- Gün 4: Dinlenme (Perşembe)
  INSERT INTO program_days (program_id, day_number, day_name, is_rest) VALUES (full_body_id, 4, 'Dinlenme', TRUE);

  -- Gün 5: Full Body C (Cuma)
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (full_body_id, 5, 'Full Body C') RETURNING id INTO day_id;
  IF ex_squat IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index, notes)
    VALUES (day_id, ex_squat, 3, 10, 150, 1, 'Daha hafif ağırlık, daha yüksek tekrar');
  END IF;
  IF ex_bench_press IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_bench_press, 3, 10, 120, 2);
  END IF;
  IF ex_cable_row IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_cable_row, 3, 12, 90, 3);
  END IF;
  IF ex_overhead_press IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_overhead_press, 3, 10, 90, 4);
  END IF;
  IF ex_romanian_deadlift IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_romanian_deadlift, 3, 10, 120, 5);
  END IF;
  IF ex_calf_raise IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_calf_raise, 3, 20, 60, 6);
  END IF;

  -- Gün 6: Dinlenme (Cumartesi)
  INSERT INTO program_days (program_id, day_number, day_name, is_rest) VALUES (full_body_id, 6, 'Dinlenme', TRUE);

  -- Gün 7: Dinlenme (Pazar)
  INSERT INTO program_days (program_id, day_number, day_name, is_rest) VALUES (full_body_id, 7, 'Dinlenme', TRUE);


  -- ═══════════════════════════════════════════════════════════
  -- PROGRAM 4: UPPER LOWER (4 gün)
  -- Üst vücut / Alt vücut dönüşümlü, haftada 2 kez her grup
  -- ═══════════════════════════════════════════════════════════
  INSERT INTO workout_programs (name, description, split_type, frequency_per_week)
  VALUES (
    'Upper Lower',
    'Üst ve alt vücudu dönüşümlü çalıştıran 4 günlük program. Her kas grubunu haftada 2 kez çalıştırır, ara ve ileri düzey için idealdir.',
    'upper_lower',
    4
  ) RETURNING id INTO upper_lower_id;

  -- Gün 1: Upper A (Kuvvet Odaklı — Pazartesi)
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (upper_lower_id, 1, 'Upper A — Kuvvet') RETURNING id INTO day_id;
  IF ex_bench_press IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_bench_press, 4, 6, 180, 1);
  END IF;
  IF ex_barbell_row IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_barbell_row, 4, 6, 180, 2);
  END IF;
  IF ex_overhead_press IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_overhead_press, 3, 8, 120, 3);
  END IF;
  IF ex_pull_up IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_pull_up, 3, 8, 120, 4);
  END IF;
  IF ex_barbell_curl IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_barbell_curl, 2, 10, 60, 5);
  END IF;
  IF ex_skull_crusher IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_skull_crusher, 2, 10, 60, 6);
  END IF;

  -- Gün 2: Lower A (Quad Ağırlıklı — Salı)
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (upper_lower_id, 2, 'Lower A — Quad Ağırlıklı') RETURNING id INTO day_id;
  IF ex_squat IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_squat, 4, 6, 180, 1);
  END IF;
  IF ex_romanian_deadlift IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_romanian_deadlift, 3, 8, 150, 2);
  END IF;
  IF ex_leg_press IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_leg_press, 3, 10, 120, 3);
  END IF;
  IF ex_leg_curl IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_leg_curl, 3, 12, 90, 4);
  END IF;
  IF ex_calf_raise IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_calf_raise, 4, 15, 60, 5);
  END IF;

  -- Gün 3: Dinlenme (Çarşamba)
  INSERT INTO program_days (program_id, day_number, day_name, is_rest) VALUES (upper_lower_id, 3, 'Dinlenme', TRUE);

  -- Gün 4: Upper B (Hacim Odaklı — Perşembe)
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (upper_lower_id, 4, 'Upper B — Hacim') RETURNING id INTO day_id;
  IF ex_incline_bench IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_incline_bench, 4, 10, 90, 1);
  END IF;
  IF ex_lat_pulldown IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_lat_pulldown, 4, 10, 90, 2);
  END IF;
  IF ex_dumbbell_fly IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_dumbbell_fly, 3, 12, 60, 3);
  END IF;
  IF ex_cable_row IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_cable_row, 3, 12, 90, 4);
  END IF;
  IF ex_lateral_raise IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_lateral_raise, 3, 15, 60, 5);
  END IF;
  IF ex_face_pull IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_face_pull, 3, 15, 60, 6);
  END IF;
  IF ex_hammer_curl IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_hammer_curl, 2, 12, 60, 7);
  END IF;
  IF ex_tricep_pushdown IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_tricep_pushdown, 2, 15, 60, 8);
  END IF;

  -- Gün 5: Lower B (Posterior Chain Ağırlıklı — Cuma)
  INSERT INTO program_days (program_id, day_number, day_name) VALUES (upper_lower_id, 5, 'Lower B — Hamstring & Kalça') RETURNING id INTO day_id;
  IF ex_deadlift IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_deadlift, 4, 5, 180, 1);
  END IF;
  IF ex_leg_curl IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_leg_curl, 4, 12, 90, 2);
  END IF;
  IF ex_squat IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index, notes)
    VALUES (day_id, ex_squat, 3, 12, 120, 3, 'Hafif ağırlık, hacim odaklı');
  END IF;
  IF ex_leg_press IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_leg_press, 3, 15, 90, 4);
  END IF;
  IF ex_calf_raise IS NOT NULL THEN
    INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index)
    VALUES (day_id, ex_calf_raise, 4, 20, 60, 5);
  END IF;

  -- Gün 6: Dinlenme (Cumartesi)
  INSERT INTO program_days (program_id, day_number, day_name, is_rest) VALUES (upper_lower_id, 6, 'Dinlenme', TRUE);

  -- Gün 7: Dinlenme (Pazar)
  INSERT INTO program_days (program_id, day_number, day_name, is_rest) VALUES (upper_lower_id, 7, 'Dinlenme', TRUE);

END $$;
