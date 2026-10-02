-- Egzersiz görselleri RepDB çizimleri (512x512 WebP) oldu.
--
-- 062 kovayı yalnızca image/jpeg kabul edecek kurmuştu; free-exercise-db
-- fotoğrafları lisans yüzünden kaldırıldı, yerine gelen RepDB çizimleri WebP.
-- Yükleme scripts/import-exercise-images.mjs ile, lisans şartları orada.
--
-- RepDB hareketlerin çoğunu iki pozla çizer: image_url bitiş (tepe) pozu,
-- image_start_url başlangıç pozu. Tek pozlu harekette (kardiyo, esneme)
-- image_start_url NULL kalır. Büyük görünümler ikisini yan yana gösterir,
-- küçük liste ikonu yalnızca image_url'i.

ALTER TABLE exercises ADD COLUMN IF NOT EXISTS image_start_url TEXT;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/webp']
WHERE id = 'exercise-images';
