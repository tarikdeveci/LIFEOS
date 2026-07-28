-- Global food_items tekilleştirme + tekrarın önlenmesi
--
-- seed.sql üç kez çalıştırılmış: her global gıda 3 kopya halinde duruyordu
-- (63 gıda → 189 satır). food_items'da hiçbir unique kısıt yoktu, bu yüzden
-- her çalıştırma sessizce yeniden ekledi.
--
-- Kullanıcıya yansıyan kalori hatası yok — kopyalar birebir aynı değerlere
-- sahip, eşleşme hangisini seçerse seçsin sonuç değişmiyor. Ama parse-meal
-- her istekte tüm tabloyu çekiyor (3 kat gereksiz veri) ve ileride tek bir
-- kopya düzenlenirse veriler tutarsızlaşır.
--
-- Silmek güvenli: meals.items JSONB'dir, food_item_id oraya gömülüdür,
-- food_items'a foreign key YOKTUR. Kayıtlı öğünler kendi makro değerlerini
-- zaten içlerinde taşıyor.

-- 1) Aynı isimli global kayıtlardan birini bırak
DELETE FROM food_items a
USING food_items b
WHERE a.user_id IS NULL
  AND b.user_id IS NULL
  AND a.name = b.name
  AND a.ctid > b.ctid;

-- 2) Bir daha olmasın
CREATE UNIQUE INDEX IF NOT EXISTS food_items_global_name_key
  ON food_items (name)
  WHERE user_id IS NULL;
