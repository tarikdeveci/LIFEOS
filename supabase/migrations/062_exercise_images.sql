-- Egzersiz görselleri.
--
-- Kaynak free-exercise-db (Unlicense, kamu malı). Görseller herkese açık
-- 'exercise-images' kovasına scripts/import-exercise-images.mjs ile yüklenir,
-- kovanın public adresi exercises.image_url'e yazılır. Yazma yalnızca service
-- role ile (RLS'i atlar); okuma public URL üzerinden, policy gerekmez.
--
-- NULL = görsel yok. Uygulama o zaman görsel alanını hiç çizmez.

ALTER TABLE exercises ADD COLUMN IF NOT EXISTS image_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('exercise-images', 'exercise-images', true, 1048576, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;
