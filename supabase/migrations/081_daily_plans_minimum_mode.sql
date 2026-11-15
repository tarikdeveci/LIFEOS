-- 081_daily_plans_minimum_mode.sql
-- Kötü gün (asgari gün) modu: o gün korunmayan rutinlerin blok ve görevleri
-- filtreyle kapanır, veri silinmez. Gün sonu devri ayrıca değişmez: rutin
-- görevleri occurrence_date taşıdığı için roll_over_tasks onları zaten devretmez (065).

ALTER TABLE daily_plans
  ADD COLUMN IF NOT EXISTS minimum_mode BOOLEAN NOT NULL DEFAULT FALSE;
