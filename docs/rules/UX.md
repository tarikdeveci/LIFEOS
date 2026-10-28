# UX kuralları

Kapsam: mobil öncelikli, web'de de aynı davranış beklenir. `#n` test mühendisi listesindeki
madde sırasıdır (`docs/KALAN_ADIMLAR.md`). Görsel değerler ve bileşen seçimi: `DESIGN.md`.

## 1. Navigasyon

- Geri, ekranın açıldığı yere döner. Alt sayfadan geri için `router.back()`; geçmiş yoksa
  (`!router.canGoBack()`, ör. bildirimden açılış) mantıksal üst sekmeye `router.replace(...)`.
  "Geri" düğmesi sabit bir rotaya `push` etmez (#12, #16). Örnek: `app/exercise/[id].tsx` geri düğmesi.
- Android donanım geri tuşu ekrandaki geri ile aynı yere gider. Açık sheet önce sheet'i kapatır
  (`Modal onRequestClose`), ekranı değil.
- Bir özet kart veya başlık dokunulabilir görünüyorsa dokununca kendi sekmesine/ayrıntısına gider (#3).
- Aynı ekran içindeki sekmeler (`Segmented` veya sekme çubuğu) dokunarak geçilebilir (#23).
- Geçiş animasyonu tutarlı: alt sayfa sağdan, sheet aşağıdan (#2).

## 2. Pop up

- Sheet (`BottomSheet`): form, seçim, ayrıntı; bulunulan bağlam korunur.
- Uyarı (`Alert`): sadece geri alınamaz onay ("Silinsin mi?") ve izin için ayarlara yönlendirme.
  Bilgi vermek veya hata göstermek için uyarı açılmaz; ekranda gösterilir (`DESIGN.md` 6).
- Sheet aşağı çekilerek, arka plana dokunarak ve Android geri tuşuyla kapanır (#6, #17).
  Kapatmak İptal'dir: hiçbir şey yazılmaz.
- Klavye açılınca odaktaki alan ve Kaydet görünür kalır; klavye içeriği örtmez (#26).
- Sheet içinde sheet açılmaz; ikinci adım gerekiyorsa aynı sheet'in içeriği değişir veya ayrı ekran açılır.

## 3. Formlar

- İptal (ve sheet'i kapatmak) hiçbir şey yazmaz ve taslağı sıfırlar; bir sonraki açılış kayıtlı
  değerle başlar, yarım taslakla değil (#9, #22, #38).
- Kaydet tek yazma noktasıdır. Alan değişince arka planda kayıt yapılmaz.
  İstisna: Kaydet düğmesi olmayan, değişikliği anında uygulayan ayar (anahtar, tema seçimi).
  Bir ekran ya hep anında uygular ya hep Kaydet bekler; ikisi karışmaz.
- Kaydet başarılıysa ekran kapanır veya geri bildirim verir; başarısızsa girdiler korunur ve hata görünür.
- Sayısal alanlarda aralık doğrulaması, hata alanın altında (#10). Faz 2 önerisi: yaş 13 ile 100,
  kilo 30 ile 300 kg, boy 100 ile 250 cm.
- Ondalık alanlar virgül ve nokta kabul eder (72,5 ve 72.5), `keyboardType="decimal-pad"` (#5).
- Aynı veri iki yerde gösteriliyorsa tek kaynaktan gelir; birini güncellemek ötekini günceller
  (#7 günlük kilo ve profil kilosu, #11 kalori ve makrolar).

## 4. Girdiler

- Tarih ve saat elle yazılmaz, seçiciden seçilir (`DateField`, `TimeField`) (#18, #32).
- Birim alanın yanında görünür (kg, dk, g).
- Sabit seçenekler serbest metinle alınmaz: `Segmented` veya liste.
- Varsayılan değer mantıklı olur ve kullanıcının dilindedir (#47 birim varsayılanı "gün").

## 5. Dil

- Kullanıcıya görünen her metin i18n'den gelir (`useLang().t`; `src/i18n.ts`, `src/i18nForms.ts`,
  `src/i18nWorkout.ts`). Buna uyarı başlıkları, placeholder, `accessibilityLabel`, varsayılan
  değerler ve hesaplanan açıklama metinleri dahil (#46 ile #49).
- İlk açılışta cihaz dili: `tr` ise Türkçe, değilse İngilizce. Kullanıcı seçim yaptıysa kayıtlı seçim geçerli (#1).
- Dil değişince ekrandaki her metin değişir; önceden hesaplanıp state'e yazılmış metin kalmaz (#46).
- Yeni anahtar iki dile birlikte eklenir. `src/i18n.ts` depoda CRLF: düzenlerken satır sonunu koru,
  commit öncesi `git diff --ignore-cr-at-eol` ile bak.

## 6. Sadelik

- Sekme başına tek birincil eylem, en üstte; ikincil özellikler "Daha fazla" altında katlanır (#50, #51, #52).
- Opsiyonel alanlar varsayılan kapalı, bir düğmeyle açılır; kapalıyken mantıklı varsayılan kullanılır
  (#21: WSJF "Önceliği ayarla" ile açılır, kapalıyken hepsi 3).
- Kullanıcının bilmediği kavram (WSJF gibi) tek cümlelik açıklamayla gelir (#19).
- Yeni yetenek önce mevcut bir yuvaya (var olan kartta ek satır, bildirim, sunucu kuralı) eklenir;
  yeni kart ancak emülatörde ekranın bugünkü hali tartıldıktan sonra (kaç kart, kaç kaydırma,
  neyin önüne geçiyor) ve kullanımı zorlaştırmadığı gösterilince eklenir.

## 7. Silme

- Silme hedefi en az 44x44 (#39).
- Onay (`Alert`, `danger` eylem) veya geri al seçeneği; ikisinden biri zorunlu.
- Silme yolu görünür: sadece gizli kaydırma hareketi yetmez, menüde veya ayrıntıda "Sil" de bulunur (#28).
- Silme gerçekten siler: bağlı kayıtlar (ör. rutinin tamamlama kayıtları) silmeyi engellemez (#31).

## 8. Kullanıcının önceki kararları

Bunlar test listesinden değil, ürün sahibinin daha önce verdiği kararlardan gelir. Değiştirmek için sorulur.

- Sekmeye taşımak silmek sayılır. Mevcut bir özellik ana akıştan çıkarılmaz; kaldırma gerekiyorsa
  gerekçeli seçenek sunulur, karar kullanıcınındır (2026-09-30).
- Kart ait olduğu sekmede durur; günün ilk girdisi üstte (2026-09-18/19). Örnekler: Antrenman'da
  "Antrenman Başlat" en üstte; Beslenme'de önce "Bugün" makro özeti, altında hızlı arama, sonra öğünler.
- Anasayfa sadece sekme özetlerinden oluşur; sekmesi olmayan kart anasayfaya konmaz.
  İstisna: sağlık bağlı değilken tek satırlık Health Connect daveti (App Store 2.5.1).
- Ölçümler (kilo takibi, aktivite ve uyku) Profil'de.
- Pro sadece AI: LLM çağrısı yapmayan hiçbir özellik kilitlenmez (2026-09-29).
- Bildirim saati sabit kalabilir ama metni her gün, güne ve veriye göre değişir
  (`supabase/functions/daily-digest/copy.ts` havuz deseni).
- Yeni yetenek herkes için tasarlanır, ürün sahibine özel kişiselleştirme değil; mevcut kartların
  varsayılan görünümü değişmez (2026-10-05).
