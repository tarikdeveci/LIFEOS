-- 055: Sabah planlama ritüeli
-- Ritüel (dünden kalanlar, backlog'dan seç, yerleştir) tamamlanınca o günün
-- planına işlenir; aynı gün tekrar açılmaz. Web ve mobil aynı kaydı okur.

ALTER TABLE daily_plans
  ADD COLUMN IF NOT EXISTS ritual_completed_at TIMESTAMPTZ;
