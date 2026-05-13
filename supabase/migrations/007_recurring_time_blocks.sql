-- Tekrarlayan zaman blokları desteği
-- time_blocks tablosuna recurrence alanları ekle

ALTER TABLE time_blocks
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recurrence_type TEXT CHECK (recurrence_type IN ('daily','weekly','biweekly','monthly')),
  ADD COLUMN IF NOT EXISTS recurrence_days INTEGER[] DEFAULT '{}', -- 0=Pzr, 1=Pzt, ..., 6=Cmt
  ADD COLUMN IF NOT EXISTS recurrence_end DATE;
