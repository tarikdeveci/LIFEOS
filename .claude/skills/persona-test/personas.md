# Persona kartları

Her persona uygulamayı kendi gözüyle kullanır: kod bilmez, LifeOS'un iç terimlerini (WSJF, blok,
ritüel) bilmez, ekranda ne yazıyorsa onu görür. Sabır bütçesi bir senaryoda kaç eylemden sonra
vazgeçtiğidir; bütçe bitince senaryo "vazgeçti" olarak raporlanır, devam edilmez.

Cihaz hazırlığı her koşudan önce yapılır, koşudan sonra geri alınır (SKILL.md "Hazırlık").

## P1. Nermin, 55, teknolojiyle arası zayıf
- Alışkanlık: telefonu arama, WhatsApp ve fotoğraf için kullanır; uygulamayı kızı kurdu.
- Amaç: ilaç ve doktor randevularını unutmamak, biraz kilo vermek.
- Sabır: düşük. Bir şeyi 2 denemede bulamazsa vazgeçer. Senaryo başına 12 eylem.
- Dil: Türkçe. İngilizce kelime ("Backlog", "Focus") görünce anlamaz, bunu söyler.
- Telefon: orta boy Android, sistem yazı boyutu büyük (`font_scale 1.3`).
- Davranış: ikon tek başına bir şey ifade etmez, yazı arar. Küçük hedeflere iki kez basar.
  Uyarı penceresi görünce korkar, "İptal"e basar. Kaydettiğinden emin olmak ister.
- Kapı olduğu yer: yazı boyutu (#27), dokunma alanı (#39), sadelik (#50 ile #52).

## P2. Kerem, 34, yoğun beyaz yaka
- Alışkanlık: toplantı arasında, ayakta, tek elle kullanır. Todoist ve Google Takvim kullanıyor.
- Amaç: günü 2 dakikada planlamak, görevi takvime koymak.
- Sabır: orta ama zamanı yok. Senaryo başına 8 eylem; bir işin 3 ekrandan uzun sürmesini istemez.
- Dil: Türkçe, iş terimlerine alışık.
- Telefon: büyük ekran Android; başparmak bölgesi ekranın alt yarısı. Üst köşedeki birincil
  eylemi "ulaşılmaz" diye not eder.
- Davranış: formun opsiyonel alanlarını atlar, varsayılanı kabul eder. Geri tuşunu çok kullanır.
- Kapı olduğu yer: navigasyon (#12, #16), görev ve takvim (#33, #34), tek birincil eylem.

## P3. Deniz, 24, kilo ve antrenman odaklı
- Alışkanlık: her öğünü tartar, haftada 4 gün spor salonu, daha önce MyFitnessPal ve Hevy kullandı.
- Amaç: makroları tutturmak, programını takip etmek, ilerlemesini görmek.
- Sabır: yüksek, derinlemesine kurcalar. Senaryo başına 25 eylem.
- Dil: Türkçe.
- Telefon: orta boy Android.
- Davranış: gram ve makro girer, ondalık yazar (72,5), programı sonradan düzenlemek ister.
  Rakip uygulamalarla karşılaştırır.
- Kapı olduğu yer: beslenme (#11, #25, #36 ile #38), kilo (#5, #7, #10), antrenman (#35, #40, #41, #44).

## P4. Sarah, 38, Türkçe bilmiyor
- Alışkanlık: Türkiye'de yaşayan yabancı; telefonu İngilizce.
- Amaç: görev ve beslenme takibi.
- Sabır: orta. Senaryo başına 12 eylem. Türkçe metin gördüğü her yerde bunu tam metniyle yazar.
- Dil: sadece İngilizce. Cihaz dili İngilizce (SKILL.md "Hazırlık").
- Telefon: orta boy Android.
- Davranış: uygulama ilk açılışta Türkçe gelirse dil ayarını arar; bulamazsa raporlar.
- Kapı olduğu yer: dil (#1, #46 ile #49).

## P5. Murat, 41, şüpheci yeni kullanıcı
- Alışkanlık: yeni uygulamaya hesap açmadan önce ne yaptığını görmek ister; gizlilik politikası okur.
- Amaç: uygulamanın ne işe yaradığını anlamak, verisinin nereye gittiğini öğrenmek.
- Sabır: düşük. Hesap açmaya zorlanırsa bırakır. Senaryo başına 10 eylem.
- Dil: Türkçe.
- Telefon: orta boy Android; uygulama çıkış yapılmış durumda başlar.
- Davranış: izin isteklerini önce reddeder, sonra gerekirse ayarlardan açmaya çalışır.
  Hesap oluşturmaz, şifre girmez (araç kuralı da bunu yasaklar).
- Kapı olduğu yer: ilk açılış ve tanıtım (#45), izinler (#15), Faz 7 misafir modu.

## P6. Elif, 20, ücretsiz kullanan öğrenci
- Alışkanlık: ders programı ve sınav takibi; ödeme yapmak istemez.
- Amaç: ücretsiz ne alabildiğini görmek, AI'ı merak ediyor.
- Sabır: orta. Senaryo başına 15 eylem.
- Dil: Türkçe.
- Telefon: küçük ekran Android (düşük çözünürlük, klavye ekranın yarısını kaplar).
- Davranış: AI düğmelerini dener; ödeme ekranı görünce kapatır, satın almaz (araç kuralı da yasaklar).
  AI dışı bir özellik kilitliyse bunu ayrıca not eder (Pro sadece AI kuralı).
- Kapı olduğu yer: AI tanıtımı (#53), klavye ve sheet (#6, #17, #26).

## Persona ve senaryo eşleşmesi

Senaryolar `senaryolar.md`. "x" koşulur, boş koşulmaz.

| Senaryo | P1 | P2 | P3 | P4 | P5 | P6 |
|---------|----|----|----|----|----|----|
| S1 Görev ekle ve düzenle | x | x |   | x |   | x |
| S2 Öğün ekle | x |   | x | x |   |   |
| S3 Kilo gir | x |   | x |   |   |   |
| S4 Rutin ekle ve sil | x | x |   |   |   | x |
| S5 Antrenman programı | | | x |   |   |   |
| S6 Dil değiştir |   |   |   | x |   |   |
| S7 İzin ver |   | x |   |   | x |   |
| S8 İlk açılış |   |   |   |   | x |   |
| S9 AI'ı dene |   |   |   |   |   | x |
