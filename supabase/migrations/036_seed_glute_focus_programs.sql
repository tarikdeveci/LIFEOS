-- ============================
-- 036 — Kalça/alt vücut odaklı global programlar
-- ============================
--
-- Mevcut dört template (Bro Split, PPL, Full Body, Upper Lower) göğüs/kol
-- ağırlıklı klasik kurguları izliyor; hiçbiri alt vücut odaklı değil. Kalça ve
-- bacak önceliğiyle çalışan kullanıcı için önerilecek bir şey yoktu.
--
-- Programlar cinsiyete göre DEĞİL, çalıştırdıkları bölgeye göre adlandırıldı:
-- kalça odaklı çalışan erkek de var, klasik split isteyen kadın da. Kimin için
-- uygun olduğu açıklamada yazıyor.
--
-- Kurgu kanıta dayanıyor:
--   • Hip thrust ana hareket — 2025 sistematik derlemesi gluteus maximus
--     hipertrofisi için doğrudan öneriyor.
--   • Tek harekete yaslanılmıyor: kısalmış pozisyon (hip thrust/glute bridge)
--     ile uzamış pozisyon (squat/RDL/lunge) birlikte veriliyor; uzun kas boyunda
--     çalışmanın daha fazla hipertrofi ürettiği gösterildi.
--   • Kalça haftada 2 kez çalışılıyor (çalışmalardaki 2x/hafta kurgusu).
--   • Üst vücut ihmal edilmiyor: her programda sırt ve omuz var — postür ve
--     dengeli gelişim için, ama alt vücudun önüne geçmeyecek hacimde.

-- Egzersiz adı çözülemezse satır sessizce eklenmez; program yine de oluşur.
CREATE OR REPLACE FUNCTION seed_add_program_exercise(
  p_day UUID, p_name TEXT, p_sets INT, p_reps INT, p_rest INT, p_order INT, p_notes TEXT DEFAULT NULL
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO program_exercises (program_day_id, exercise_id, sets, reps, rest_seconds, order_index, notes)
  SELECT p_day, e.id, p_sets, p_reps, p_rest, p_order, p_notes
  FROM exercises e
  WHERE e.user_id IS NULL AND (e.name_en = p_name OR e.name = p_name)
  LIMIT 1;
$$;

DO $$
DECLARE
  prog_id UUID;
  day_id  UUID;
BEGIN

-- ----------------------------------------------------------------
-- 1) Alt Vücut Odaklı — Başlangıç (3 gün)
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM workout_programs WHERE user_id IS NULL AND name = 'Alt Vücut Odaklı — Başlangıç') THEN
  INSERT INTO workout_programs (name, description, split_type, frequency_per_week)
  VALUES (
    'Alt Vücut Odaklı — Başlangıç',
    'Haftada 3 gün, kalça ve bacak önceliğiyle tüm vücut. Yeni başlayanlar için: hareketler öğrenilebilir, hacim makul. Her seansta bir sırt veya omuz hareketi var, üst vücut ihmal edilmiyor.',
    'full_body', 3
  ) RETURNING id INTO prog_id;

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 1, 'Alt Vücut + Sırt') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Goblet Squat', 3, 12, 90, 1);
  PERFORM seed_add_program_exercise(day_id, 'Hip Thrust', 3, 12, 90, 2);
  PERFORM seed_add_program_exercise(day_id, 'Leg Curl', 3, 12, 60, 3);
  PERFORM seed_add_program_exercise(day_id, 'Lat Pulldown', 3, 10, 90, 4);
  PERFORM seed_add_program_exercise(day_id, 'Plank', 3, NULL, 60, 5, 'Süre: 30-45 saniye');

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 2, 'Kalça Odaklı') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Hip Thrust', 4, 10, 120, 1, 'Ana hareket — ağırlığı buradan artır');
  PERFORM seed_add_program_exercise(day_id, 'Romanian Deadlift', 3, 10, 90, 2);
  PERFORM seed_add_program_exercise(day_id, 'Hip Abduction Machine', 3, 15, 60, 3);
  PERFORM seed_add_program_exercise(day_id, 'Glute Bridge', 3, 15, 60, 4);
  PERFORM seed_add_program_exercise(day_id, 'Cable Row', 3, 12, 90, 5);

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 3, 'Bacak + Omuz') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Leg Press', 3, 12, 90, 1);
  PERFORM seed_add_program_exercise(day_id, 'Bulgarian Split Squat', 3, 10, 90, 2);
  PERFORM seed_add_program_exercise(day_id, 'Glute Kickback Machine', 3, 15, 60, 3);
  PERFORM seed_add_program_exercise(day_id, 'Lateral Raise', 3, 15, 60, 4);
  PERFORM seed_add_program_exercise(day_id, 'Face Pull', 3, 15, 60, 5);
END IF;

-- ----------------------------------------------------------------
-- 2) Kalça & Bacak — Orta Seviye (4 gün)
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM workout_programs WHERE user_id IS NULL AND name = 'Kalça & Bacak — Orta Seviye') THEN
  INSERT INTO workout_programs (name, description, split_type, frequency_per_week)
  VALUES (
    'Kalça & Bacak — Orta Seviye',
    'Haftada 4 gün. Kalçayı iki kez çalıştırır: biri ağır ve düşük tekrar, diğeri hacim ve izolasyon. Arada bir tam üst vücut günü var. Temel hareketleri oturmuş, ağırlık artırabilen kullanıcılar için.',
    'upper_lower', 4
  ) RETURNING id INTO prog_id;

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 1, 'Kalça — Ağır') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Hip Thrust', 4, 8, 150, 1, 'Programın ana hareketi');
  PERFORM seed_add_program_exercise(day_id, 'Sumo Deadlift', 3, 8, 150, 2);
  PERFORM seed_add_program_exercise(day_id, 'Bulgarian Split Squat', 3, 10, 90, 3);
  PERFORM seed_add_program_exercise(day_id, 'Hip Abduction Machine', 3, 15, 60, 4);

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 2, 'Üst Vücut') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Lat Pulldown', 4, 10, 90, 1);
  PERFORM seed_add_program_exercise(day_id, 'Cable Row', 3, 12, 90, 2);
  PERFORM seed_add_program_exercise(day_id, 'Lateral Raise', 3, 15, 60, 3);
  PERFORM seed_add_program_exercise(day_id, 'Face Pull', 3, 15, 60, 4);
  PERFORM seed_add_program_exercise(day_id, 'Plank', 3, NULL, 60, 5, 'Süre: 45-60 saniye');

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 3, 'Bacak') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Squat', 4, 8, 150, 1);
  PERFORM seed_add_program_exercise(day_id, 'Romanian Deadlift', 4, 10, 120, 2);
  PERFORM seed_add_program_exercise(day_id, 'Leg Press', 3, 12, 90, 3);
  PERFORM seed_add_program_exercise(day_id, 'Leg Curl', 3, 12, 60, 4);

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 4, 'Kalça — Hacim') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Glute Bridge', 4, 15, 60, 1);
  PERFORM seed_add_program_exercise(day_id, 'Glute Kickback Machine', 3, 15, 60, 2);
  PERFORM seed_add_program_exercise(day_id, 'Lunges', 3, 12, 90, 3);
  PERFORM seed_add_program_exercise(day_id, 'Hip Abduction Machine', 4, 20, 45, 4);
  PERFORM seed_add_program_exercise(day_id, 'Hyperextension', 3, 15, 60, 5);
END IF;

-- ----------------------------------------------------------------
-- 3) Kalça Şekillendirme — 2 Gün
-- ----------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM workout_programs WHERE user_id IS NULL AND name = 'Kalça Şekillendirme — 2 Gün') THEN
  INSERT INTO workout_programs (name, description, split_type, frequency_per_week)
  VALUES (
    'Kalça Şekillendirme — 2 Gün',
    'Haftada 2 gün, zamanı kısıtlı olanlar için. Kalçayı yine haftada iki kez çalıştırır çünkü her iki gün de kalça içerir. Az günle en fazla getiriyi almak üzere kurgulandı.',
    'custom', 2
  ) RETURNING id INTO prog_id;

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 1, 'Alt Vücut + Omuz') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Hip Thrust', 4, 10, 120, 1);
  PERFORM seed_add_program_exercise(day_id, 'Squat', 3, 10, 120, 2);
  PERFORM seed_add_program_exercise(day_id, 'Romanian Deadlift', 3, 10, 90, 3);
  PERFORM seed_add_program_exercise(day_id, 'Lateral Raise', 3, 15, 60, 4);

  INSERT INTO program_days (program_id, day_number, day_name) VALUES (prog_id, 2, 'Kalça İzolasyon + Sırt') RETURNING id INTO day_id;
  PERFORM seed_add_program_exercise(day_id, 'Glute Bridge', 4, 15, 60, 1);
  PERFORM seed_add_program_exercise(day_id, 'Bulgarian Split Squat', 3, 10, 90, 2);
  PERFORM seed_add_program_exercise(day_id, 'Hip Abduction Machine', 4, 20, 45, 3);
  PERFORM seed_add_program_exercise(day_id, 'Lat Pulldown', 3, 12, 90, 4);
  PERFORM seed_add_program_exercise(day_id, 'Face Pull', 3, 15, 60, 5);
END IF;

END $$;

DROP FUNCTION IF EXISTS seed_add_program_exercise(UUID, TEXT, INT, INT, INT, INT, TEXT);
