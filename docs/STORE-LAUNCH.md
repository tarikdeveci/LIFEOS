# LifeOS — Mağaza Yayın Rehberi

Son güncelleme: 2026-07-28 akşam. Durum bilgileri App Store Connect API, Google
Play Developer API, RevenueCat API/paneli ve canlı HTTP kontrolleriyle doğrulandı.

---

## 1. Şu an nerede duruyoruz

| Alan | Durum |
|---|---|
| ASC sürüm 1.0 | `DEVELOPER_REJECTED` — düzenlenebilir, yeniden gönderilmeyi bekliyor |
| ASC build | ✅ Build 5 (paywall'lı) yüklendi, `VALID`, **sürüme bağlandı** |
| ASC abonelikler | `PRO_1` + `PRO_2` → ikisi de **`MISSING_METADATA`** ← **tek blocker** |
| ASC ekran görüntüleri | 6 adet 1290×2796, `COMPLETE` |
| ASC metinler / fiyat / yaş / iletişim | Tamam |
| App Privacy formu | **Doğrulanmadı** (API'den okunamıyor) |
| DSA tacir doğrulaması | Beklemede — gönderimi engellemez |
| RevenueCat bundle ID | ✅ `tr.lifeos.app` |
| RevenueCat SDK key | ✅ Geçerli |
| RevenueCat offering | ✅ `default` → `$rc_monthly→PRO_1`, `$rc_annual→PRO_2` |
| RevenueCat entitlement | ✅ `pro`, 2 ürün bağlı |
| RevenueCat in-app purchase key | ✅ Valid credentials |
| RevenueCat ASC API key | ✅ Valid credentials (vendor no 94552100) |
| RevenueCat webhook | ✅ Kuruldu + doğrulandı (401/401/200) |
| Uygulama içi paywall | ✅ Yazıldı ve build 5'te |
| lifeos.tr | ✅ Canlı, `/hesap-silme` 200 |
| TestFlight beta grubu | ⚠️ Hiç grup/testçi yok — build görünmezse grup açmak gerekir |
| Play kapalı test | 1.0.0 (13) yayında |
| Play abonelik ürünleri | **Hiç yok** |

> **Kalan tek gerçek blocker:** abonelik inceleme görselleri (Adım B).
> Diğer her şey hazır.

---

## 2. Sıra neden önemli — bağımlılık tuzağı

Apple, `Missing Metadata` durumundaki abonelik ürünlerini **StoreKit üzerinden
döndürmez**. Bu bir kısır döngü yaratıyor:

```
Ürün Ready to Submit değil
        └─> StoreKit ürünü döndürmez
                └─> paywall fiyat gösteremez
                        └─> paywall'ın dolu ekran görüntüsünü çekemezsin
                                └─> inceleme görselini yükleyemezsin
                                        └─> ürün Ready to Submit olmaz  ⟲
```

**Kırma yöntemi:** Önce paywall'ın *fiyatsız* hâlinden bir ekran görüntüsü yükle
(Adım B). Ürünler `Ready to Submit`'e geçer, StoreKit ürünleri döndürmeye başlar,
sonra gerçek görüntüyü çekip eskisiyle değiştirirsin (Adım E). İnceleme görseli
gönderim öncesi istediğin kadar değiştirilebilir — bu normal bir akış, hile değil.

---

## Adım A — RevenueCat key uyarısı

**Hata:** "The key is not valid or is not compatible with the Bundle ID of your app"

Bu uyarı **SDK key'inle ilgili değil.** SDK key'ini test ettim, çalışıyor:
offering'ler ve iki ürün doğru dönüyor. Hata, RevenueCat'e yüklediğin
**In-App Purchase Key** (`.p8`) doğrulamasından geliyor.

**Sırayla kontrol et:**

1. **RevenueCat panelde bundle ID'yi doğrula.** Project → Apps → App Store
   uygulaması → Bundle ID **`tr.lifeos.app`** olmalı.
   ⚠️ Bu kritik: paket kimliği bir ara `com.lifeos.app`'ten `tr.lifeos.app`'e
   değişti. RevenueCat'te eski değer kaldıysa hata tam olarak budur.

2. **Doğru key tipini yüklediğinden emin ol.** İhtiyacın olan
   *In-App Purchase Key*, *App Store Connect API Key* değil. Üretme yeri:
   App Store Connect → Users and Access → Integrations → **In-App Purchase** →
   `+` → indirilen `.p8` dosyasını RevenueCat'e yükle.

3. **RevenueCat'in olay bildirimi.** Panelde "newly created apps" için bu hatanın
   aktif bir incident olduğu yazıyor. 1 ve 2 doğruysa bu onların tarafında —
   status sayfasını takip et, saatlerce uğraşma.

**Ne bloke ediyor:** Makbuz doğrulama. Yani kullanıcı satın alır ama RevenueCat
`pro` hakkını vermez. Build almayı ve TestFlight'ı engellemez, ama **gerçek satın
alma testi bu çözülmeden anlamlı sonuç vermez.**

**Aynı ekranda hallet — webhook:**
RevenueCat → Integrations → Webhooks → Authorization alanına Supabase'deki
`REVENUECAT_WEBHOOK_SECRET` değerinin aynısını yapıştır. Fonksiyon fail-closed
çalışıyor: secret eşleşmezse her isteği 401'liyor, satın almalar Supabase'e
hiç yansımıyor.

> Not: Uygulama artık `isPro` için **Supabase satırı VEYA RevenueCat hakkı**na
> bakıyor. Yani webhook gecikse bile satın alan kullanıcı anında Pro oluyor.
> Webhook yine de gerekli — web (PayTR) ile mağaza aboneliklerinin tek yerde
> birleşmesi ve iptal/yenileme takibi ona bağlı.

---

## Adım B — Abonelik inceleme görselleri (asıl blocker)

İki abonelik de `MISSING_METADATA`. Eksik olan tek şey **App Store inceleme
ekran görüntüsü**. Ad, ürün kimliği, süre, fiyat, Türkçe lokalizasyon — hepsi
zaten girilmiş durumda (API'den doğruladım).

1. App Store Connect → LifeOS → Subscriptions → **PRO** grubu
2. **Pro Aylık** (`PRO_1`) → aşağı in → *App Store Promotion / Review Information*
   → **App Review Screenshot** → paywall görüntüsünü yükle
3. İstersen *Review Notes* alanına şunu yaz:
   > Paywall, uygulamada Profil sekmesindeki üyelik kartına dokununca ve
   > herhangi bir AI özelliği kullanılmak istendiğinde açılır.
4. Aynısını **Pro Yıllık** (`PRO_2`) için tekrarla
5. Kaydet → durum `Ready to Submit`'e dönmeli

**Görseli nereden bulacaksın:** Adım C'deki build'i TestFlight'tan kurup Profil →
üyelik kartına dokun, açılan paywall'ın ekran görüntüsünü al. Fiyatlar henüz
görünmeyecek — sorun değil, Adım E'de değiştireceğiz.

---

## Adım C — Build 5 (paywall'lı)

Paywall bugün yazıldı ve `master`'a push'landı ama **hiçbir build'de yok**.
Build 4 paywall'sız; onu göndermek 3.1.1 reddi demek.

```bash
cd LIFEOS/apps/mobile && npx eas build --platform ios --profile production
```

`autoIncrement` açık, buildNumber otomatik 5 olacak. Bitince:

```bash
cd LIFEOS/apps/mobile && npx eas submit --platform ios --latest
```

`eas.json` içindeki ASC API key bilgileri hazır, submit ek soru sormadan geçmeli.

---

## Adım D — TestFlight + sandbox testi

1. Build 5 işlendikten sonra TestFlight'ta göründüğünde kendine kur
2. **Sandbox test hesabı:** App Store Connect → Users and Access → Sandbox →
   Testers → yeni tester ekle (gerçek Apple ID'nden farklı bir e-posta)
3. iPhone'da Ayarlar → App Store → Sandbox Account → bu hesapla giriş yap
4. Uygulamada Profil → üyelik kartı → paywall
5. **Kontrol listesi:**
   - [ ] İki plan da fiyatıyla görünüyor mu? (Adım B tamamlanmadan görünmez)
   - [ ] Yıllıkta tasarruf rozeti çıkıyor mu?
   - [ ] Satın alma akışı tamamlanıyor mu?
   - [ ] Satın alma sonrası rozet `FREE` → `PRO` oluyor mu?
   - [ ] "Satın alımları geri yükle" çalışıyor mu?
   - [ ] Üç yasal link de açılıyor mu?

Fiyatlar hâlâ gelmiyorsa sorun Adım A ya da B'dedir — paywall kodunda değil.

---

## Adım E — Gerçek inceleme görselini yükle

Paywall fiyatlarla dolu göründüğünde tekrar ekran görüntüsü al ve Adım B'deki
geçici görselleri bununla değiştir. İncelemeci ürünün gerçekte nasıl sunulduğunu
görmüş olur — reddedilme riskini en çok düşüren adım budur.

---

## Adım F — App Privacy formu

App Store Connect → LifeOS → **App Privacy** → Get Started.

Doldurulacak içeriğin tamamı hazır ve koddan çıkarılmış:
`lifeos-play-assets/veri-guvenligi-ve-iarc-taslak.txt` → **Bölüm 6**.

Özet: e-posta, ad, sağlık/fitness, satın alma geçmişi, kullanıcı içeriği,
kullanıcı kimliği, cihaz kimliği → hepsi **Linked to You**, **hiçbiri Tracking
değil**. Konum/kişiler/analitik/crash → hayır. Takvim verisi cihazdan çıkmadığı
için **beyan edilmez**.

⚠️ Play Veri Güvenliği beyanıyla çelişmemeli. Aynı uygulama, aynı veri.

---

## Adım G — Gönderim

1. Sürüm 1.0 → **Build** bölümünden build 5'i seç
   (şu an build 3 bağlı — bunu ben API'den de yapabilirim, söylemen yeter)
2. Abonelikler `Ready to Submit` mi, son kez bak
3. App Privacy tamam mı, son kez bak
4. **Add for Review** → Submit

**DSA tacir doğrulaması:** İkametgah belgesi Apple'a iletildi, sonuç bekleniyor.
Bu yalnızca AB mağazalarında yayına çıkmayı etkiler — **incelemeye göndermeyi
engellemez**, bekleme.

---

## 3. Play tarafı (Apple'dan sonra)

1. **Abonelik ürünlerini oluştur.** Play Console → Monetize → Subscriptions →
   `PRO_1` (aylık) ve `PRO_2` (yıllık). Kimlikleri iOS ile **aynı tut** —
   `purchases.ts` içindeki `PRO_PRODUCT_IDS` bunlara bakıyor.
2. **RevenueCat Android key.** Panelden Google Play SDK key'ini al ve
   `eas.json` → `build.production.env` altına
   `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` olarak ekle. Şu an yalnızca iOS key'i
   var; Android'de `initRevenueCat` key bulamayıp sessizce çıkıyor.
3. **Android push.** `tr.lifeos.app`'i Firebase projesi `lifeos-d0aa4`'e kaydet,
   yeni `google-services.json`'ı koy.
4. **Production erişimi:** Kişisel hesap → 20 testçi × 14 gün kapalı test şartı.

---

## 4. PayTR (web ödemesi)

PayTR tüccar panelinde:
- Bildirim (IPN) URL: `https://lifeos.tr/api/payment/notification`
- Callback URL: `https://lifeos.tr/api/payment/callback`
- Tüccar hesabının canlı/onaylı olduğunu doğrula
- Gerçek kartla tek bir test satın alması yap

Beş yasal sayfa + hesap silme sayfası canlıda ve oturumsuz erişilebilir durumda.

---

## 5. Referans

| | |
|---|---|
| ASC app id | `6789708836` |
| Bundle id | `tr.lifeos.app` |
| Abonelik grubu | PRO (`22242497`) |
| Ürünler | `PRO_1` 99,90₺ / $4.99 · `PRO_2` 790₺ / $39.99 |
| EAS proje | `53ebf64f-970f-4f76-a8e4-27c5ac22e681` (owner `tariikdevecii`) |
| Play paket | `tr.lifeos.app` (app id `4973480413179150219`) |
| Supabase | `ulmwvssyyfmuqxrgaewe` |
| Vercel | proje `lifeos` → lifeos.tr |
| Gizlilik | https://lifeos.tr/gizlilik-kvkk |
| Hesap silme | https://lifeos.tr/hesap-silme |
