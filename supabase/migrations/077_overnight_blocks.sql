-- Gece yarısını geçen blok: 23:30 ile 00:00, 23:00 ile 07:00 (uyku).
--
-- Eski kısıt `end_time > start_time` bu blokları reddediyordu. Yeni model bayrak eklemez:
-- bitiş saati başlangıçtan küçük ya da eşit değil, sadece FARKLI olmalı. `end_time < start_time`
-- "ertesi gün bitiyor" demektir; blok `date` günündedir (başladığı gün). Süre:
-- end > start ? end - start : 24 saat - start + end. Sıfır süreli blok (start = end) hâlâ geçersiz.
--
-- Veri taşıması yok: mevcut satırların hepsi end > start, yeni kısıtı zaten sağlar.
-- Bildirim (event-notifications) sadece start_time'a bakar, etkilenmez.

ALTER TABLE public.time_blocks DROP CONSTRAINT IF EXISTS valid_time_range;
ALTER TABLE public.time_blocks
  ADD CONSTRAINT valid_time_range CHECK (end_time <> start_time);

-- Rutin şablonu aynı kısıtı taşıyordu; "23:00 ile 07:00 uyku" rutini de yazılabilsin.
ALTER TABLE public.routines DROP CONSTRAINT IF EXISTS routines_time_order;
ALTER TABLE public.routines
  ADD CONSTRAINT routines_time_order CHECK (start_time IS NULL OR end_time <> start_time);
