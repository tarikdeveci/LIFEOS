# Görev senaryoları

Hedef personaya kullanıcı diliyle verilir: buton veya ekran adı söylenmez ("Görevler sekmesine
git" değil, "yarın için bir iş ekle"). Başarı ölçütü gözlenebilirdir; ajan bunu kendisi kontrol eder.
"İlgili maddeler" sadece kalibrasyon içindir, personaya gösterilmez.

Her senaryo sonunda ortak kontrol: Android geri tuşuyla başlangıç ekranına dönülür, her basışta
nereye gittiği not edilir (#2, #12, #16). Senaryonun oluşturduğu test verisi en sonda silinir.

## S1. Görev ekle ve düzenle
- Başlangıç: giriş yapılmış test hesabı, Bugün ekranı.
- Hedef: "Yarın için 'Dis hekimi randevusu' diye bir iş ekle, yarım saat sürsün. Sonra adını
  'Dis hekimi kontrol' yap ve bunun önemli olduğunu belirt."
- Başarı: görev yarının tarihinde, 30 dk; ekrandan çıkıp tekrar açınca yeni ad, süre ve önem yerinde.
- Ara kontrol: düzenlemede bir kez İptal'e bas, tekrar aç: değişiklik yazılmamış olmalı.
- İlgili: #18, #19, #20, #21, #22, #24, #33, #34.

## S2. Öğün ekle
- Başlangıç: Bugün ekranı.
- Hedef: "Öğle yemeğinde 2 yumurta ve 1 dilim tam bugday ekmegi yedin, kaydet."
- Başarı: öğün listede, kalori ve makrolar görünüyor, günün toplamı arttı.
- Ara kontrol: aynı akışı ikinci kez aç, önceki girdiden değer kalmış mı (#38).
- İlgili: #11, #25, #36, #37, #38, #46.

## S3. Kilo gir
- Başlangıç: Bugün ekranı.
- Hedef: "Bugün tartıldın, 72,5 kilosun. Kaydet."
- Başarı: 72,5 kaydedildi; profildeki kilo da 72,5 (#7).
- Ara kontrol: önce 7250 yaz, uygulama ne diyor (#10); sonra 72.5 ile de dene (#5).
  Profil vücut bilgilerinde bir değeri değiştirip İptal'e bas: yazılmamış olmalı (#9).
- İlgili: #5, #7, #8, #9, #10, #48.

## S4. Rutin ekle ve sil
- Başlangıç: Bugün ekranı.
- Hedef: "Her sabah 07:30'da 'Yuruyus' rutini ekle. Bugünkünü yapıldı olarak işaretle. Sonra bu rutini tamamen sil."
- Başarı: rutin 07:30'da görünüyor; işaretlendi; silinince hiçbir günde görünmüyor.
- Ara kontrol: saat alanı elle mi yazılıyor, seçiciden mi (#32). Sheet'i aşağı çekip ve arka plana
  dokunup kapatmayı dene (#6, #17). Silme düğmesinin "küçük hedef" bayrağı var mı (#39).
- İlgili: #6, #17, #26, #27, #28, #29, #31, #32, #39.

## S5. Antrenman programı ekle ve başlat
- Başlangıç: Bugün ekranı.
- Hedef: "Haftada 3 gün çalışacağın bir program kur ve bugünkü antrenmanı başlat. Sonra programa bir egzersiz ekle."
- Başarı: program kayıtlı; antrenman başladı; program sonradan düzenlenebildi (#40).
- Ara kontrol: Bugün ekranında program ve sıradaki gün görünüyor mu (#41); planda blok olarak var mı (#44).
- İlgili: #14, #35, #40, #41, #44.

## S6. Dil değiştir
- Başlangıç: cihaz dili İngilizce, uygulama ilk açılış veya çıkış yapılmış.
- Hedef: "Use the app in English. Then switch it to Turkish and back to English."
- Başarı: ilk açılışta İngilizce (#1); dil değişince beş sekmenin, ayarların, kilo ve beslenme
  ekranlarının bütün metni seçilen dilde. Türkçe kalan her metin tam haliyle listelenir.
- İlgili: #1, #46, #47, #48, #49.

## S7. İzin ver
- Başlangıç: izinler sıfırlanmış (SKILL.md "Hazırlık"), giriş yapılmış.
- Hedef: "Bildirim almak istiyorsun, izin ver. Takvimini bağla. Sağlık verisini paylaş."
  P5 önce sistem penceresinde reddeder, sonra uygulamadan tekrar açmayı dener.
- Başarı: her izin için uygulama içindeki düğme bir şey yapıyor (sistem penceresi veya ayarlara
  yönlendirme); sonuç ekranda görünüyor. "Bağlı" yazısı tek başına başarı sayılmaz.
- İlgili: #13, #15.

## S8. İlk açılış (şüpheci)
- Başlangıç: uygulama verisi silinmiş (`pm clear`), çıkış yapılmış.
- Hedef: "Hesap açmadan bu uygulamanın ne işe yaradığını anla. Gizlilik politikasını bul."
- Başarı: hesap açmadan değer görebildi mi; gizlilik metnine kaç adımda ulaştı. Hesap açılmaz.
- İlgili: #45.

## S9. AI'ı dene (öğrenci)
- Başlangıç: ücretsiz test hesabı, Bugün ekranı.
- Hedef: "Uygulamanın yapay zekasıyla gününü planlamayı dene. Para ödemek istemiyorsun."
- Başarı: AI'ın ne yaptığını ödeme ekranından önce anladı mı; AI dışı bir özellik kilitli mi.
  Satın alma düğmesine basılmaz.
- İlgili: #53.
