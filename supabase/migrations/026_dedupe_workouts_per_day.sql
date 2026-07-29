-- 026_dedupe_workouts_per_day.sql
-- Uygulama en başından beri "kullanıcı başına günde tek antrenman" varsayıyor
-- (getWorkoutByDate tek kayıt döndürüyor, todayWorkout tekil), ama DB'de bunu
-- garanti eden bir kısıt yoktu. Program günü başlatılırken oluşan çift kayıtlar
-- yüzünden aynı güne birden fazla workout düşebiliyordu; bu da set sayacının
-- şişmesine ve getWorkoutByDate'in patlamasına yol açıyordu.

-- 1) Aynı (user_id, date) için birden fazla kayıt varsa: setleri en eski
--    antrenmanın altında birleştir (veri kaybı yok).
WITH ranked AS (
  SELECT
    id,
    user_id,
    date,
    FIRST_VALUE(id) OVER (PARTITION BY user_id, date ORDER BY created_at, id) AS keep_id
  FROM workouts
)
UPDATE workout_sets s
SET workout_id = r.keep_id
FROM ranked r
WHERE s.workout_id = r.id
  AND r.id <> r.keep_id;

-- 2) Artık boş kalan kopya antrenmanları sil.
WITH ranked AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (PARTITION BY user_id, date ORDER BY created_at, id) AS keep_id
  FROM workouts
)
DELETE FROM workouts w
USING ranked r
WHERE w.id = r.id
  AND r.id <> r.keep_id;

-- 3) Bir daha oluşmasın.
CREATE UNIQUE INDEX IF NOT EXISTS workouts_user_date_unique_idx
  ON workouts(user_id, date);

-- Eski non-unique index artık gereksiz (aynı kolonlar).
DROP INDEX IF EXISTS workouts_user_date_idx;
