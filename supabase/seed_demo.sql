-- supabase/seed_demo.sql
-- Demo verisi: mevcut oturumdaki kullanıcı için örnek görevler, zaman blokları, beslenme
-- KULLANIM: Supabase SQL Editor'da çalıştır (oturum açıkken)

DO $$
DECLARE
  v_user_id   uuid   := auth.uid();
  v_today     text   := to_char(now() AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD');
  v_yesterday text   := to_char((now() AT TIME ZONE 'Europe/Istanbul') - interval '1 day', 'YYYY-MM-DD');
  v_workout_id uuid;
  v_chest_id  uuid;
  v_tricep_id uuid;
  v_squat_id  uuid;
BEGIN

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Kullanıcı oturumu bulunamadı. Supabase SQL Editor üzerinden çalıştır.';
  END IF;

  -- ─── User Profile ─────────────────────────────────────────────────────────
  INSERT INTO user_profiles (user_id, display_name, timezone, preferences)
  VALUES (v_user_id, 'Demo Kullanıcı', 'Europe/Istanbul', '{}'::jsonb)
  ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name;

  -- ─── Nutrition Target ─────────────────────────────────────────────────────
  INSERT INTO nutrition_targets (user_id, calories, protein_g, carbs_g, fat_g, fiber_g)
  VALUES (v_user_id, 2500, 170, 280, 75, 30)
  ON CONFLICT (user_id) DO UPDATE
    SET calories = 2500, protein_g = 170, carbs_g = 280, fat_g = 75, fiber_g = 30;

  -- ─── Daily Plan ───────────────────────────────────────────────────────────
  INSERT INTO daily_plans (user_id, date, energy_level, ai_suggestions)
  VALUES (v_user_id, v_today::date, 4, '[]'::jsonb)
  ON CONFLICT (user_id, date) DO UPDATE SET energy_level = 4;

  -- ─── Tasks ────────────────────────────────────────────────────────────────
  INSERT INTO tasks (user_id, title, status, value_score, urgency_score, risk_score, effort_score, friction_score, estimated_minutes, scheduled_date, tags)
  VALUES
    (v_user_id, 'LifeOS workout modülünü test et', 'in_progress', 5, 4, 3, 2, 1, 45, v_today::date, ARRAY['lifeos','test']),
    (v_user_id, 'Günlük beslenme kaydı gir', 'planned', 4, 5, 2, 1, 1, 10, v_today::date, ARRAY['beslenme','rutin']),
    (v_user_id, 'Haftalık proje planı oluştur', 'planned', 5, 3, 4, 3, 2, 60, v_today::date, ARRAY['proje','planlama']),
    (v_user_id, 'E-postalara cevap ver', 'planned', 3, 4, 2, 2, 1, 30, v_today::date, ARRAY['iletisim']),
    (v_user_id, 'Kod review yap', 'planned', 4, 3, 3, 2, 2, 45, v_today::date, ARRAY['kod','review']),
    (v_user_id, 'Sprint retrospektif notlarını derle', 'done', 4, 4, 2, 2, 1, 30, v_today::date, ARRAY['sprint','toplantı']);

  -- ─── Time Blocks ──────────────────────────────────────────────────────────
  INSERT INTO time_blocks (user_id, date, block_type, start_time, end_time, label, color)
  VALUES
    (v_user_id, v_today::date, 'routine', '07:00', '07:30', 'Sabah Rutini', '#34A853'),
    (v_user_id, v_today::date, 'workout', '07:30', '08:30', 'Antrenman', '#EC4899'),
    (v_user_id, v_today::date, 'meal', '08:30', '09:00', 'Kahvaltı', '#EF4444'),
    (v_user_id, v_today::date, 'focus', '09:00', '11:00', 'Derin Çalışma', '#8B5CF6'),
    (v_user_id, v_today::date, 'break', '11:00', '11:15', 'Mola', '#F59E0B'),
    (v_user_id, v_today::date, 'task', '11:15', '12:30', 'E-posta & İletişim', '#4A90D9'),
    (v_user_id, v_today::date, 'meal', '12:30', '13:15', 'Öğle Yemeği', '#EF4444'),
    (v_user_id, v_today::date, 'focus', '13:15', '15:00', 'Kod Geliştirme', '#8B5CF6'),
    (v_user_id, v_today::date, 'break', '15:00', '15:15', 'Kahve Molası', '#F59E0B'),
    (v_user_id, v_today::date, 'task', '15:15', '17:00', 'Code Review', '#4A90D9'),
    (v_user_id, v_today::date, 'meal', '19:00', '19:45', 'Akşam Yemeği', '#EF4444'),
    (v_user_id, v_today::date, 'routine', '21:30', '22:00', 'Gün Sonu Rutini', '#34A853');

  -- ─── Meals ────────────────────────────────────────────────────────────────
  INSERT INTO meals (user_id, date, meal_type, raw_input, items, total_calories, total_protein, total_carbs, total_fat, total_fiber)
  VALUES
    (
      v_user_id, v_today::date, 'breakfast',
      '3 yumurta, 2 dilim tam buğday ekmek, yoğurt',
      '[{"name":"Yumurta","amount":180,"unit":"g","calories":234,"protein":18.9,"carbs":1.8,"fat":15.9},{"name":"Tam Buğday Ekmek","amount":60,"unit":"g","calories":150,"protein":5.4,"carbs":27.6,"fat":1.8},{"name":"Yoğurt","amount":120,"unit":"g","calories":120,"protein":12,"carbs":4.8,"fat":4.8}]'::jsonb,
      504, 36.3, 34.2, 22.5, 4.2
    ),
    (
      v_user_id, v_today::date, 'lunch',
      'Tavuk göğsü, bulgur pilavı, salata',
      '[{"name":"Tavuk göğsü","amount":150,"unit":"g","calories":247.5,"protein":46.5,"carbs":0,"fat":5.4},{"name":"Bulgur","amount":150,"unit":"g","calories":165,"protein":5.4,"carbs":34.5,"fat":1.2},{"name":"Salata","amount":100,"unit":"g","calories":30,"protein":1.5,"carbs":5,"fat":0.5}]'::jsonb,
      442.5, 53.4, 39.5, 7.1, 5.8
    );

  -- ─── Dünün Antrenmanı (geçmiş görünümü için) ─────────────────────────────
  SELECT id INTO v_chest_id  FROM exercises WHERE name ILIKE '%bench press%' LIMIT 1;
  SELECT id INTO v_tricep_id FROM exercises WHERE name ILIKE '%tricep%' LIMIT 1;
  SELECT id INTO v_squat_id  FROM exercises WHERE name ILIKE '%squat%' LIMIT 1;

  INSERT INTO workouts (user_id, date, name, status, duration_minutes, total_calories_burned, ai_plan)
  VALUES (
    v_user_id, v_yesterday::date,
    'Push Day — Göğüs & Tricep', 'completed', 65, 320,
    '[{"type":"general","message":"Harika antrenman! Göğüs ve tricep dengeli çalıştırıldı."}]'::jsonb
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_workout_id;

  IF v_workout_id IS NOT NULL AND v_chest_id IS NOT NULL THEN
    INSERT INTO workout_sets (workout_id, exercise_id, set_number, reps, weight_kg, completed)
    VALUES
      (v_workout_id, v_chest_id, 1, 12, 60, true),
      (v_workout_id, v_chest_id, 2, 10, 65, true),
      (v_workout_id, v_chest_id, 3, 8,  70, true);
  END IF;

  IF v_workout_id IS NOT NULL AND v_tricep_id IS NOT NULL THEN
    INSERT INTO workout_sets (workout_id, exercise_id, set_number, reps, weight_kg, completed)
    VALUES
      (v_workout_id, v_tricep_id, 1, 15, 25, true),
      (v_workout_id, v_tricep_id, 2, 12, 30, true),
      (v_workout_id, v_tricep_id, 3, 10, 30, true);
  END IF;

  RAISE NOTICE 'Demo verisi yüklendi. Kullanıcı: % | Tarih: %', v_user_id, v_today;

END $$;
