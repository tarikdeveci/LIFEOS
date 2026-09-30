-- Alışkanlıkta "günde N kez" hedefi (su 5 bardak, ilaç 2 kez).
-- times_per_day NULL: eski davranış, günde tek işaret ve hedef haftada times_per_week gün.
-- times_per_day N: gün, sayaç N'ye ulaşınca tamamlanmış sayılır; bu alışkanlıklarda
-- istemci times_per_week = 7 yazar, haftalık ilerleme "hedefi tutan gün" olarak okunur.

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS times_per_day SMALLINT CHECK (times_per_day BETWEEN 2 AND 20);

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_habit_daily_target;
ALTER TABLE routines
  ADD CONSTRAINT routines_habit_daily_target CHECK (times_per_day IS NULL OR kind = 'habit');

-- O günkü işaret sayısı. Mevcut satırlar tek işaret demekti.
ALTER TABLE routine_completions
  ADD COLUMN IF NOT EXISTS count SMALLINT NOT NULL DEFAULT 1 CHECK (count BETWEEN 1 AND 50);
