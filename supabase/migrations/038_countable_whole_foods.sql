-- Bir tane sayılan yiyecekler is_countable=true olmalı.
--
-- SORUN: "1 armut" yazan kullanıcı kalem yerine gramaj sorusu alıyordu. Armut
-- küratörlü tabloda var, porsiyonu da 150 g — yani bir armut — ama is_countable
-- false olduğu için porsiyon merdiveni (portion.ts, 5. basamak) adetle çarpmayı
-- reddediyor ve soruya düşüyor.
--
-- BAYRAĞIN ANLAMI: is_countable, "serving_size TEK bir parçayı temsil eder"
-- demektir; ölçü porsiyonunu değil. portion.ts'teki "10 badem tuzağı" yorumu
-- bunu anlatıyor: bademin porsiyonu 30 g'dır ve bu bir tane badem değildir,
-- adetle çarpmak 300 g verirdi.
--
-- Bu yüzden liste BİLEREK dar tutuldu. Yanlış true sessizce kat kat fazla kalori
-- yazar; yanlış false yalnızca bir soru üretir. Asimetri açık: şüphede olan satır
-- listeye alınmaz.
--
-- Alınanlar, mevcut true kümesinin desenini birebir izliyor
-- (Elma 150, Portakal 150, Muz 120, Yumurta 50): porsiyon = bir adet.
--
-- Bilerek DIŞARIDA bırakılanlar ve sebepleri:
--   Çilek 100, Kiraz 100, Üzüm 100, Karpuz 200, Kavun 200, Ananas 150
--     → porsiyon, tane değil. "1 karpuz" bir karpuzun tamamı olurdu.
--   Hurma 30   → bir hurma ~7 g; 30 g yaklaşık dört tane.
--   Kayısı 80, İncir 80 → bir tanesi 40-60 g; porsiyon mu tane mi belirsiz.
--   Salatalık 100 → bir salatalık 150-200 g; porsiyon eksik kalır.
-- Bu satırlar için doğru düzeltme bayrak değil, porsiyon verisinin gözden
-- geçirilmesidir; o ayrı bir iştir.
--
-- serving_size koşulu kasıtlı: porsiyon verisi ileride değişirse bu migration
-- yanlış satırı sayılabilir işaretlemesin, sessizce hiçbir şey yapmasın.

UPDATE food_items SET is_countable = true
WHERE user_id IS NULL AND is_countable IS DISTINCT FROM true
  AND (
    (name = 'Armut'            AND serving_size = 150) OR
    (name = 'Şeftali'          AND serving_size = 150) OR
    (name = 'Kivi'             AND serving_size = 80)  OR
    (name = 'Mandalina'        AND serving_size = 100) OR
    (name = 'Domates'          AND serving_size = 100) OR
    (name = 'Domates (büyük)'  AND serving_size = 150)
  );
