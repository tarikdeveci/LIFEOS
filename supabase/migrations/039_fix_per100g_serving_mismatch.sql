-- ============================
-- 039 — Porsiyon/100g karışması: besin değerleri porsiyona ölçeklenmemiş
-- ============================
--
-- SORUN: Bir grup satırda calories ve makrolar 100 GRAM BAŞINA yazılmış, ama
-- serving_size gerçek porsiyonu tutuyor. Satır kendi içinde tutarlı olduğu için
-- (calories, makroların Atwater toplamıyla örtüşüyor) hiçbir kontrole takılmadı;
-- yanlış olan tek şey ikisinin EŞLEŞTİRİLMESİ.
--
-- Sonuç sessiz ve büyük: "1 yemek kaşığı tereyağı" 72 kcal yerine 717 kcal,
-- "30 g kaju" 166 yerine 553 kcal yazıyor. Kalori takibinde bundan daha kötü bir
-- hata sınıfı yok — sayı makul görünüyor ama 3-10 katı.
--
-- KAYNAK: 008_expand_food_db.sql. Kolon sırası
-- (name, calories, protein, carbs, fat, fiber, serving_size, ...) ve satırlar
-- 100 g'lık besin tablosundan alınıp makul porsiyon boyutlarıyla eşleştirilmiş,
-- ama değerler ölçeklenmemiş:
--   ('Kaju', 553, 18, 33, 44, 3, 30, 'g', ...)   → 553 kcal, kajunun 100 g değeri.
-- 034 denetimi yalnızca o zamanki 63 satırı kapsıyordu; 008'in satırları dışarıda
-- kalmış.
--
-- KANIT — üç bağımsız yol, hepsi aynı sonucu veriyor:
--
--  1) Kütle korunumu. Makrolar yiyeceğin kütlesinin bir alt kümesidir, porsiyonu
--     aşamazlar. Hindistan Cevizi Yağı 10 g porsiyonda 100 g yağ yazıyor; 10 g'a
--     100 g yağ sığmaz. Aşağıdaki her satır bu ihlali veriyor.
--
--  2) Fiziksel üst sınır. Saf yağ 900 kcal/100g'dır, hiçbir yiyecek bunu aşamaz.
--     Bu satırların ima ettiği değerler 923 ile 8620 kcal/100g arasında.
--
--  3) Doğru ikizler. Dokuz satırın katalogda doğru girilmiş bir eşi var ve
--     ölçeklenmiş değer eşiyle birebir tutuyor:
--       Fıstık Ezmesi  588×0.30 = 176  ||  "Fıstık ezmesi"  176 kcal / 30 g
--       Kuru Üzüm      299×0.30 =  90  ||  "Kuru üzüm"       90 kcal / 30 g
--       Kuru Kayısı    241×0.30 =  72  ||  "Kuru kayısı"     73 kcal / 30 g
--       Antep Fıstığı  560×0.30 = 168  ||  "Antep fıstığı"  172 kcal / 30 g
--       Kaşar Peyniri  390×0.30 = 117  ||  "Kaşar peyniri"  110 kcal / 30 g
--       Bal            304×0.20 =  61  ||  "Bal (1 kaşık)"   64 kcal / 21 g
--       Reçel          250×0.20 =  50  ||  "Reçel (1 kaşık)" 52 kcal / 20 g
--       Tereyağı       717×0.10 =  72  ||  "Tereyağı (1 yk)" 100 kcal / 14 g
--       Yulaf Ezmesi   368×0.80 = 294  ||  "Yulaf ezmesi (kuru)" 152 kcal / 40 g
--     Üçüncü yol ikincisinden bağımsız: ikizlerin ikisi de 900 sınırının altında.
--
-- DÜZELTME: değerleri porsiyona ölçekle (× serving_size/100), porsiyonu koru.
-- Alternatif "serving_size = 100 yap" da satırı tutarlı kılardı ama küratörün
-- porsiyon niyetini (10 g tereyağı, 30 g kuruyemiş) yok ederdi; porsiyon merdiveni
-- serving_default basamağında bunu kullanıyor.
--
-- SATIR SİLİNMİYOR (034 ile aynı gerekçe): meals.items içindeki food_item_id
-- referansları kırılmasın. İkiz satırların tekilleştirilmesi ayrı bir iş; bu
-- düzeltmeden sonra ikizler zaten aynı değeri verdiği için hangisinin eşleştiği
-- kalori açısından fark etmiyor.
--
-- LİSTE AÇIK YAZILDI, kural olarak değil. Ferrero Rocher da kütle ihlali veriyor
-- (12 g porsiyon, makro toplamı 13 g) ama satır DOĞRU: bir Ferrero ~12.5 g ve
-- 73 kcal, ihlal yuvarlamadan geliyor. Ölçekleseydik bir çikolata 9 kcal olurdu.
-- Genel bir eşik Ferrero'yu (13/12 = 1.08) ayıklarken Yulaf Ezmesi'ni de
-- (86/80 = 1.08) ayıklıyor — ikisi ayrılamıyor, o yüzden karar satır satır.
--
-- calories INTEGER; round() ile yazılıyor. Makrolar NUMERIC(6,1).
--
-- Koşuldaki kütle ihlali testi migration'ı ETKİSİZ-TEKRARLANABİLİR kılar:
-- düzeltilmiş satır artık koşulu sağlamaz, ikinci çalıştırma hiçbir şey yapmaz.

UPDATE food_items SET
  calories = GREATEST(round(calories * serving_size / 100.0)::int, 1),
  protein  = round(protein * serving_size / 100.0, 1),
  carbs    = round(carbs   * serving_size / 100.0, 1),
  fat      = round(fat     * serving_size / 100.0, 1),
  fiber    = round(fiber   * serving_size / 100.0, 1)
WHERE user_id IS NULL
  AND serving_size > 0
  AND serving_unit = 'g'
  AND protein + carbs + fat > serving_size
  AND name IN (
    'Hindistan Cevizi Yağı',
    'Tereyağı',
    'Tahin',
    'Susam',
    'Bal',
    'Sarımsak',
    'Badem Ezmesi',
    'Reçel',
    'Kaju',
    'Fıstık Ezmesi',
    'Fıstık (çiğ)',
    'Gofret',
    'Antep Fıstığı',
    'Corn Flakes',
    'Çikolatalı Gevrek',
    'Çekirdek (ay)',
    'Bisküvi (sade)',
    'Çekirdek (kabak)',
    'Kraker',
    'Kuru Üzüm',
    'Hurma',
    'Kuru Kayısı',
    'Tam Buğday Gevreği',
    'Kaşar Peyniri',
    'Taze Kaşar',
    'Yulaf Ezmesi'
  );
