# İş akışı

Her değişiklik (özellik, hata düzeltmesi, yeniden düzenleme) aşağıdaki on kapıdan geçer.
Bu dosya, test mühendisinin 2026-10 geri bildiriminden doğdu: 53 maddenin ana tespiti
"inceleme ve kontroller eksik kalmış, UX kullanımı zor". `#n` o listedeki madde sırasıdır
(liste ve fazlar: `docs/KALAN_ADIMLAR.md`).

Kural eklerken: her kural bir sebebe bağlanır. Sebep listedeki bir madde ise `#n` yazılır,
kullanıcı kararı ise tarihi yazılır. Sebebi olmayan kural eklenmez.

## Kapılar

### 1. Kabul kriteri
Her madde için tek satır: "kullanıcı X yapınca Y görür / Y kaydedilir". Büyük işte
(birden fazla ekran veya yeni akış) `docs/superpowers/specs/` altında spec.
Kriter gözlenebilir olmalı: "kaydedilir" demek, ekran kapatılıp açıldığında değerin
yerinde durması demektir.

Sebep: "kaydettim" denen ama kaydetmeyen alanlar (#20 WSJF skoru, #24 süre ve tarih,
#7 günlük kilo). Kriter yazılmadığı için kimse geri dönüp bakmadı.

### 2. `feature/*` dalı
`develop`'tan `feature/<konu>` (acil düzeltme `hotfix/*`). `master`'a doğrudan push yok.
Feature dalına push serbest; PR açmadan önce kullanıcıya sorulur.
Yeni migration numarası `KALAN_ADIMLAR.md`'deki ayrılmış numaralara bakılarak seçilir.

Sebep: kullanıcı kararı (2026-09-30, gitflow). Paralel oturumlar aynı migration numarasını
kullanıp çakışma yaşattı.

### 3. Uygulama
Varsayılan uygulayıcı `ajan` katmanıdır (Claude kotası harcamaz); karar ve son kontrol ana
oturumdadır. Görev metninde dosya kapsamı açık yazılır, aynı dosyaya iki yazıcı salınmaz.
Her `ajan` koşusundan sonra `git status --short` ile depo kökü taranır, artık dosya silinir.
Kod yazmadan önce ilgili kural dosyaları okunur (`DESIGN.md`, `UX.md`).

Sebep: `ajan --oku` incelemeleri bile kökte dosya bıraktı (2026-10-01). Kurallar
okunmadan yazılan ekranlar aynı hataları tekrar etti (#16 geri tuşu, #18 elle tarih).

### 4. Otomatik kontrol
```bash
pnpm typecheck
pnpm test
pnpm lint
```
Edge function değiştiyse Deno yok: scratchpad'de `tsc` ile ayrıca kontrol edilir.
i18n testi (mobil kaynakta i18n dosyaları dışındaki Türkçe string literal'leri yakalar)
Faz 4'te eklenir ve bu kapıya girer.
Davranış hatası düzeltiliyorsa önce başarısız olan test, sonra düzeltme.

Sebep: #46 ile #49 arasındaki sabit Türkçe metinler bir testle yakalanabilirdi.
Testsiz düzeltilen hatalar geri geldi.

### 5. Codex review
Diff ve ilgili kural dosyaları prompt'a gömülür (Windows sandbox dosya okuyamıyor), salt okunur:
```bash
codex exec -s read-only --skip-git-repo-check --ephemeral -C <klasör> -o <scratchpad>/codex.md "<talimat + diff + kurallar>"
```
Bulgular kodla doğrulanmadan uygulanmaz. Hangisi alındı, hangisi neden reddedildi: PR
açıklamasına yazılır. Güvenlik, ödeme, RLS veya maliyete dokunan işte ek olarak güvenlik
odaklı Claude incelemesi.

Sebep: tek gözle yazılıp tek gözle kontrol edilen kod, test mühendisine 53 madde bıraktı.

### 6. Canlı kontrol
Dokunulan her ekran Android emülatörde açılır ve şu durumlarda denenir:
- TR ve EN (#1, #46 ile #49).
- Küçük ekran ve klavye açık: odaktaki alan görünür kalır (#26).
- Android donanım geri tuşu ve ekrandaki geri: açıldığı yere döner (#12, #16).
- Açık ve koyu tema.
- Kaydet sonrası ekranı kapatıp açma: değer yerinde mi (#7, #20, #24).
- İlgili Maestro akışları (Faz 3'te yazılır).

Etiket kanıt değildir: "Bağlı", "Kaydedildi" yazısı verinin gittiğini göstermez; veri
ekranda veya DB'de doğrulanır. Ekran görüntüsüyle tıklayan Claude ajanı açılmaz (kota);
metin tabanlı döküm (`maestro hierarchy`, `adb uiautomator dump`) kullanılır.

Sebep: #12, #16, #26 gibi maddeler sadece emülatörde görülür; kod incelemesi yakalamaz.

### 7. Persona ajanı turu
UX'e dokunan her değişiklikte (yeni ekran, akış, form, metin) `persona-test` skill'i ile
ilgili personalar ilgili senaryoları koşar. Raporlardaki yeni bulgular `KALAN_ADIMLAR.md`'ye
madde olarak girer.

Sebep: "uygulama aşırı karmaşık" (#50, #51, #52). Ekibin gözü uygulamaya alıştı; son
kullanıcının gözünü taşıyan bir kapı yoktu.

### 8. PR, develop
PR açıklamasında: kabul kriterleri, hangi kapılardan geçti, atlanan kapı ve sebebi, Codex
bulgularının akıbeti, eklenen/silinen satır ve ölü kod taraması. PR açmak ve birleştirmek
kullanıcı onayıyla.

Sebep: kullanıcı kararı (2026-09-30): PR'larda sorulur.

### 9. Dahili test build'i
Değişiklik dahili test build'ine (TestFlight / Play dahili test) girer, test mühendisi dener.
Test listesinden gelen madde ancak onun onayıyla kapanır; geliştirici "yaptım" diyerek kapatmaz.

Sebep: test mühendisinin bulduğu maddelerin bir kısmı bizim tarafta "bitti" sayılmıştı.

### 10. Yayın sonrası canlı kontrol
Yayından sonra: edge function logları, Supabase advisors, `events` tablosu (ilgili olay
geliyor mu), çökme raporları. Sayı beklenenden düşükse "hata yok" sayılmaz, sebebi bulunur.

Sebep: eski `send-notification` aylarca `{"sent":0}` ve HTTP 200 döndürdü, cron başarılı
sanıldı (`CLAUDE.md` Bildirim Sistemi).

## Kapı atlama
Sadece doküman veya yorum değişikliği: 6, 7, 9 atlanır. Sadece sunucu (`supabase/`) değişikliği:
7 atlanır, 6 yerine fonksiyon çağrısı ve log ile doğrulama. Başka her atlama PR'da sebebiyle yazılır.

## Roller

| Rol | Kim | Ne yapar |
|-----|-----|----------|
| Koordinasyon ve son karar | Ana Claude oturumu | Kapsamı böler, kural dosyalarını uygular, bulguları doğrular, kapıları işletir |
| Uygulama | `ajan` katmanı (gerekirse implementer) | Kodu yazar, kapsam dışına çıkmaz, commit/push yapmaz |
| Review | Codex (salt okunur) | Diff ve kurallara göre bağımsız inceleme |
| Son kullanıcı gözü | Persona ajanı (`persona-test`) | Uygulamayı ekrandan kullanır, birinci ağızdan rapor verir |
| Son onay | Test mühendisi | Dahili build'de dener, maddeyi kapatır |
| Onaylar | Kullanıcı | PR, `db push`, deploy, secret, mağaza gönderimi |
