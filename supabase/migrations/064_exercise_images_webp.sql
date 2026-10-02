-- Egzersiz görselleri RepDB çizimleri (512x512 WebP) oldu.
--
-- 062 kovayı yalnızca image/jpeg kabul edecek kurmuştu; free-exercise-db
-- fotoğrafları lisans yüzünden kaldırıldı, yerine gelen RepDB çizimleri WebP.
-- Yükleme scripts/import-exercise-images.mjs ile, lisans şartları orada.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/webp']
WHERE id = 'exercise-images';
