# Bildirim ve beslenme düzeltmeleri — 2026-09-01

Branch: `master` · son commit: `b27671c` · **hiçbir şey commit edilmedi, hiçbir şey deploy edilmedi.**

---

## Görev

Kullanıcının isteği, kendi cümleleriyle:

1. "son yapılan degısıklıklerı ıncele bazı uygulama uzerınde bazı eksıklıklerı kapattık
   ozellıkle bıldırımler ve besın tarafında her seyın tamam oldugundan emın olmak ıstıyorum"
2. "hepsini duzelt, once eval vakalarini ekle"
3. "tamm kalan islerde son derece yetkilisin yerine koy business reqs karsilaniyo mu md
   olustur baska chatte devam etcem"

Yani: commit edilmemiş değişiklikleri denetle, bulunan eksikleri kapat (önce kırmızı eval
vakası, sonra düzeltme), iş gereksinimlerinin karşılanıp karşılanmadığını değerlendir.

---

## Tamamlananlar

### Bildirimler

| Dosya | Ne yapıldı |
|---|---|
| `supabase/functions/_shared/push.ts` | `PushResult` artık `failed: string[]` döndürüyor — teslimi doğrulanamayan token'lar. HTTP/ağ hatası, ticket sayısı uyuşmazlığı ve `DeviceNotRegistered` dışındaki ticket hataları token'ı `failed`'a yazıyor. |
| `supabase/functions/event-notifications/index.ts` | Gönderim artık işaretlemeden ÖNCE. Kullanıcının bütün token'ları başarısızsa `notification_log` kilidi geri alınıyor (`retry`), blok bir sonraki turda tekrar deneniyor. Tercih/token sorgusu hata verirse 500 dönülüyor (eskiden sessizce boş küme gibi davranıyordu). `content` tipi açık yazıldı — gerçek bir tip hatasıydı. |
| `supabase/functions/daily-digest/index.ts` | `tokensError` kontrolü eklendi. `locked` Map'i ile kullanıcı başına kilit takibi; gönderim sonrası başarısız kullanıcının kilidi tek tek `.eq()` ile geri alınıyor (asla `in()` — çapraz çarpım başka kullanıcıların kilidini de siler). |
| `supabase/migrations/037_push_token_dedupe.sql` | 5 adım: (1) `(user_id, platform)` tekilleştirme, (2) idempotent UNIQUE kısıtı, (3) token bazlı tekilleştirme (en yenisi kalır), (4) `push_tokens_claim()` SECURITY DEFINER trigger'ı — aynı token başka kullanıcıdaysa sahiplik DEVREDİLİR, (5) 30 günden eski `notification_log` temizliği. |
| `apps/mobile/src/notifications/setup.ts` | `unregisterPushTokenAsync()` eklendi. |
| `apps/mobile/app/(tabs)/profile.tsx` | Çıkış yaparken token siliniyor — `signOut`'tan ÖNCE, çünkü silme RLS altında çalışıyor ve oturum kapandıktan sonra kimlik kalmaz. |

### Beslenme — çözümleme hattı

| Dosya | Ne yapıldı |
|---|---|
| `supabase/functions/_shared/nutrition/normalize.ts` | Türkçe ondalık virgül korunuyor (`1,5 porsiyon` artık 5 değil 1.5). `bir buçuk` genişletmesi. İki geçişli miktar çıkarımı (`2 yemek kaşığı 15 g`), yalnız İKİSİNİN de açık birimi varsa birleştiriyor. Virgül iki rakamın arasındaysa ayırıcı sayılmıyor. Sondaki miktar grubuna göre bölme (`trailingGroupCuts`). Öğün bağlamı sözcükleri (`yemeginde`, `ogunde`, `yemekte`) eleniyor. |
| `supabase/functions/_shared/nutrition/index.ts` | `MAX_ITEMS` sessiz kısaltması kaldırıldı — limiti aşan kalemler `gaps` + `questions`'a düşüyor. |
| `supabase/functions/_shared/nutrition/lexical.ts` | `bySurface` çakışması artık deterministik: ağırlık (isim > İngilizce isim > alias), eşitlikte `id`. Eskiden "ilk yazan kazanır"dı ve o sıra `food_items` sorgusunun fiziksel satır sırasıydı. |
| `scripts/nutrition-eval/cases.json` | 44 → 55 vaka. D01–D09 (ondalık virgül, `bir buçuk`, artık miktar, sondaki miktar bölmesi, virgül-ayırıcı korumaları), C01–C02 (öğün bağlamı sözcüğü, `1 porsiyon nohut yemeği` koruması). E08 ve A12'nin beklenen etiketi determinizm düzeltmesine göre güncellendi. |
| `scripts/nutrition-eval/run.ts` | Uyarı metnindeki sabit "34" yerine `results.length`. |

### Beslenme — katalog verisi (bu oturumda bulundu)

| Dosya | Ne yapıldı |
|---|---|
| `supabase/migrations/038_countable_whole_foods.sql` | Armut, Şeftali, Kivi, Mandalina, Domates, Domates (büyük) → `is_countable = true`. "1 armut" artık gramaj sorusu yerine kalem olarak çözülüyor. |
| `supabase/migrations/039_fix_per100g_serving_mismatch.sql` | **26 satırda besin değerleri porsiyona ölçeklenmemişti.** Değerler `× serving_size/100` ile düzeltiliyor. Ayrıntı aşağıda. |
| `scripts/nutrition-eval/audit-catalog.ts` | Yeni: `pnpm audit:foods`. Kataloğun FİZİKSEL tutarlılığını denetler. Bu hata sınıfını eval yakalayamıyor. |
| `package.json` | `audit:foods` ve `typecheck:functions` script'leri. |

---

## Kök nedenler / bulgular

### 1. Katalogda 26 satır 3–10 kat fazla kalori yazıyor (EN KRİTİK)

`008_expand_food_db.sql` içinde satırlar 100 g'lık besin tablosundan alınmış, makul porsiyon
boyutlarıyla eşleştirilmiş, ama **değerler ölçeklenmemiş**:

```
('Kaju', 553, 18, 33, 44, 3, 30, 'g', ...)
--        ^^^ kajunun 100 g degeri     ^^ porsiyon 30 g
```

Satır kendi içinde tutarlı olduğu için (calories, makroların Atwater toplamıyla örtüşüyor)
hiçbir kontrole takılmadı. Üç bağımsız kanıt aynı sonucu verdi:

- **Kütle korunumu.** Hindistan Cevizi Yağı 10 g porsiyonda 100 g yağ yazıyor. 10 g'a 100 g sığmaz.
- **Fiziksel sınır.** Saf yağ 900 kcal/100g'dır. Bu satırlar 923–8620 kcal/100g ima ediyor.
- **Doğru ikizler.** 9 satırın katalogda doğru girilmiş eşi var ve ölçeklenmiş değer birebir
  tutuyor: `Fıstık Ezmesi 588×0.30 = 176` ↔ `"Fıstık ezmesi" 176 kcal/30 g`;
  `Kuru Üzüm 299×0.30 = 90` ↔ `"Kuru üzüm" 90 kcal/30 g`.

Etkisi: "1 yemek kaşığı tereyağı" **717 kcal** yazıyor (doğrusu 72). "30 g kaju" **553** (doğrusu 166).

Ferrero Rocher da kütle ihlali veriyor ama satır DOĞRU — bir Ferrero ~12.5 g / 73 kcal, ihlal
yuvarlamadan geliyor. Genel bir eşik Ferrero'yu (13/12 = 1.08) ayıklarken Yulaf Ezmesi'ni de
(86/80 = 1.08) ayıklıyor, ikisi mekanik olarak ayrılamıyor. Bu yüzden 039'daki liste **açık yazıldı**.

`034_fix_curated_food_data.sql` daha önce benzer bir denetim yapmış ama o zamanki 63 satırı
kapsıyordu; 008'in satırları dışarıda kalmış.

### 2. Eval bu hata sınıfına kör

`eval:nutrition` beklenen kaloriyi **etiketlenen yiyeceğin DB satırından türetiyor**. Satırın
kendisi yanlışsa beklenen de yanlış olur ve test yeşil kalır. Bu bilinçli bir tasarım (etiket
"hangi yiyecek" konusunda yanılabilir ama ima ettiği kalori konusunda yanılamaz) — ama veri
doğruluğunu ölçmüyor. `pnpm audit:foods` tam olarak bu boşluğu kapatıyor.

### 3. Eşleşme deterministik değildi

`food_items` sorgusunda `ORDER BY` yok. `buildLexicalIndex` çakışan yüzeyde "ilk yazan kazanır"
uyguluyordu, yani kazanan fiziksel satır sırasına bağlıydı. Bir `UPDATE` veya `VACUUM` sonrası
aynı girdi başka bir yiyeceğe oturabilirdi.

Ölçüm: **255 kurate satır, 60 çakışan yüzey.** 24'ü ağırlıkla çözülüyor, 36'sı berabere
(id ile kırılıyor). Beraberlerin 24'ünde tarafların 100 g kalorisi gerçekten farklı — yani
seçim önemliydi ve rastgeleydi.

### 4. Bildirim kaybı ve mükerrer bildirim

- Gönderim başarısız olsa bile `notification_log` kilidi konuyordu → bildirim kalıcı olarak kayboluyordu.
- Tercih/token sorgusu hata verdiğinde boş küme gibi davranılıyordu → sessiz sıfır bildirim.
- Aynı token birden fazla kullanıcıda kayıtlıydı: **1 token / 3 kullanıcı**, üçünün de digest
  saatleri aynı → cihaz aynı bildirimi 3 kez alıyordu. `notification_log` bunu doğruladı.
  `(user_id, platform)` mükerrer kaydı **yoktu**, yani sorun oradan gelmiyordu.

---

## Doğrulama durumu

```
pnpm eval:nutrition   → 55/55 (%100 vaka, %100 yiyecek eşleşme, %0.0 kcal medyan APE)
pnpm typecheck        → 2/2 başarılı (@lifeos/web, @lifeos/mobile)
pnpm audit:foods      → HATA: 23 satır fiziksel sınırı aşıyor  ← 039 UYGULANMADIĞI İÇİN
```

`audit:foods` 039 uygulandıktan sonra yalnızca Ferrero Rocher uyarısıyla yeşile dönmeli.
039 simülasyonu (canlı satırlar üzerinde, yazmadan) doğrulandı: 26/26 satır eşleşiyor, hepsi
düzeltme sonrası sağlıklı, ikinci çalıştırma no-op.

---

## Business requirements — karşılanıyor mu?

| Gereksinim | Durum | Kanıt / şerh |
|---|---|---|
| Bildirim gerçekten gönderiliyor (`push_tokens`'tan okunuyor) | Kod tamam, **deploy bekliyor** | Her iki fonksiyon da `push_tokens` okuyor. |
| Aynı bildirim iki kez gitmiyor | Kod tamam, **deploy bekliyor** | `notification_log` PK kilidi + 037 token sahipliği devri. Mükerrerin kaynağı token paylaşımıydı; 037 olmadan çözülmez. |
| Gönderilemeyen bildirim kaybolmuyor | Kod tamam, **deploy bekliyor** | `failed` → kilit geri alınıyor → sonraki turda tekrar. |
| Saat hesabı kullanıcının timezone'una göre | **Karşılanıyor** | `localWallTimeToInstant` / `safeTimeZone`. Bu oturumda değiştirilmedi. |
| Çıkışta token temizleniyor | **Karşılanıyor** | `profile.tsx`, `signOut`'tan önce. |
| Serbest Türkçe metin doğru parse ediliyor | **Karşılanıyor** | 55/55 eval. Şerh: set küçük ve doygun; %100 "bu set bu hattı ayırt edemiyor" da demek olabilir. |
| Öğünün bir kısmı sessizce düşmüyor | **Karşılanıyor** | `MAX_ITEMS` artık soru üretiyor. |
| Kalori değerleri doğru | **KARŞILANMIYOR — 039 uygulanana kadar** | 26 satır 3–10 kat fazla. Kalori takibinde en ağır hata sınıfı. |
| Aynı girdi hep aynı yiyeceğe oturuyor | Kod tamam, **deploy bekliyor** | Ağırlık + id tiebreak. Şerh: 60 çakışmanın 2'si eval kapsamında, 58'i doğrulanmadı. |
| "1 armut" adet olarak çözülüyor | Kod tamam, **deploy bekliyor** | 038. |
| Katalog verisi denetlenebilir | **Karşılanıyor** | `pnpm audit:foods`. |

**Özet:** Kod tarafı tamam. Ama **hiçbir migration ve hiçbir edge function deploy edilmedi** —
yani şu an canlıda kullanıcılar hâlâ mükerrer bildirim alıyor ve tereyağı 717 kcal yazıyor.
Deploy edilmeden hiçbir "kod tamam" satırı kullanıcıya ulaşmıyor.

---

## Yarım kalan

Kod değişikliği yarım kalmadı. **Deploy hiç yapılmadı** — bilinçli bir karar:

- Geri alınması zor ve dışa dönük bir işlem; kullanıcı başka bir sohbete devrediyor.
- `supabase db push` bu ortamda DB parolası istiyor, parola mevcut değil.
- Docker çalışmıyordu (`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the
  file specified`), bu yüzden **037/038/039 gerçek bir Postgres'e karşı hiç çalıştırılmadı.**
  039 yalnızca canlı satırlar üzerinde JS ile simüle edildi (yazma yok).

Son çalıştırılan komut: `pnpm typecheck` → 2/2 başarılı, hata yok.

---

## Sonraki adımlar

**1. Migration'ları uygula.** Fonksiyonlardan ÖNCE — `push_tokens_claim` trigger'ı yoksa token
sahipliği devredilmez ve mükerrer bildirim sürer.

```bash
supabase db push
```

**2. Katalog düzeltmesini doğrula.** HATA bölümü boş olmalı, yalnızca Ferrero Rocher uyarısı kalmalı.

```bash
pnpm audit:foods
```

**3. Eval'i tekrar çalıştır.** 039 sonrası da 55/55 kalmalı.

```bash
pnpm eval:nutrition
```

**4. Edge function'ları deploy et.**

```bash
supabase functions deploy daily-digest && supabase functions deploy event-notifications
```

**5. Bildirimi canlıda doğrula.** Yanıt `{"sent":N,...}` olmalı; `sent:0` + HTTP 200 bu projede
daha önce aylarca sessiz başarısızlığı gizledi.

```bash
supabase functions invoke daily-digest --no-verify-jwt
```

**6. Token tekilleştirmesini doğrula.** Boş dönmeli.

```bash
supabase db execute "SELECT token, count(*) FROM push_tokens GROUP BY token HAVING count(*) > 1;"
```

**7. Commit et.** (Bu projede `Co-Authored-By` trailer'ı EKLENMEZ.)

```bash
git add -A && git commit -m "Bildirim teslim garantisi ve katalog kalori duzeltmeleri"
```

### Kapatılmamış işler (aciliyet sırasına göre)

1. **Katalogda ikiz satırlar.** 60 çakışan yüzey var; 9'u aynı yiyeceğin iki kaydı
   (`Fıstık Ezmesi` / `Fıstık ezmesi`). 039 sonrası ikisi de aynı değeri verdiği için kalori
   açısından zararsız, ama tekilleştirilmeli. **Satır SİLMEYİN** — `meals.items` içindeki
   `food_item_id` referansları kırılır; alias'ları tek satırda birleştirip diğerini gizlemek gerekir.
2. **Determinizm düzeltmesinin kapsamı.** 60 çakışmanın yalnızca 2'si eval kapsamında
   (E08, A12 — beklentileri bu oturumda güncellendi). Kalan 58'in kazananı değişmiş olabilir ve
   doğrulanmadı. Riskli olanlar: `protein shake` (400 vs 40 kcal/100g), `kahve`, `portakal suyu`
   (alias'ı `Cappy meyve suyu`'na gidiyor), `nohut`, `wrap`.
3. **`repo.ts`'te `ORDER BY` yok ve `user_id` seçilmiyor.** Kullanıcının kendi `food_items`
   satırının birebir alias eşleşmesinde global satıra önceliği yok. Ana düzeltme yolunu
   `user_alias` basamağı kapsıyor, ama tam değil.
4. **Porsiyon verisi gözden geçirilmeli.** 038'den bilerek dışarıda bırakılanlar:
   Hurma 30 g (~4 tane), Kayısı/İncir 80 g (belirsiz), Salatalık 100 g (bir salatalık 150–200 g).
   Bunlar için doğru düzeltme bayrak değil, porsiyon verisidir.
5. **`Brokoli` (150 g/34 kcal) ve `Somon` (150 g/208 kcal)** aynı 100g/porsiyon hatasını taşıyor
   ama porsiyon 100'den büyük olduğu için kütle ihlali vermiyor — mekanik kanıt yok, 039'a
   alınmadı. Değerleri **eksik** gösteriyorlar (fazla değil), o yüzden daha az zararlı.
6. **E-posta bildirimi yok.** `RESEND_API_KEY` secret'ı tanımlı değil.

---

## Denenip işe yaramayanlar

- **`tsc --noResolve` ile edge function'ları tip kontrolü.** Deno import'ları (`npm:...`, `Deno`
  global'i) yüzünden gürültüden okunmuyor. Çözüm: scratchpad'de shim'li bir tsconfig harness'i
  kuruldu ve `event-notifications`'ta **gerçek bir tip hatası** buldu (`content` union'ı
  `Record<string, string>`'e atanamıyordu) — yani bu fonksiyonlar hiç tip kontrolünden
  geçmemişti. Kalıcı çözüm olarak `pnpm typecheck:functions` (`deno check`) eklendi; Deno kurulu
  değilse çalışmaz.
- **Eşik tabanlı bir kuralla 039'un kapsamını belirlemek.** Makro/porsiyon oranı eşiği Ferrero
  Rocher'ı (1.08) ayıklarken Yulaf Ezmesi'ni de (1.08) ayıklıyor. İkisi mekanik olarak
  ayrılamıyor; listeyi açık yazmak zorunlu.
- **`UNIQUE(token)` kısıtı ile mükerrer bildirimi çözmek.** Kısıt yeni girişi REDDEDER; gerekense
  sahipliğin DEVREDİLMESİ. Bu yüzden 037'de trigger kullanıldı.
- **`notification_log` kilidini `in()` ile toplu geri almak (daily-digest).** Çapraz çarpım başka
  kullanıcıların kilidini de siler. Kullanıcı başına tek tek `.eq()` gerekiyor.
- **`UNIT_TAIL_WORDS`'e `cay`/`yemek`/`tatli` eklemek.** S07 vakasını (`… beyaz peynir çay`)
  bozuyor; bu sözcükler çok sözcüklü birimi yalnızca BAŞLATIR, kapatmaz.
- **Miktar birleştirmeyi koşulsuz yapmak.** `%3 yağlı süt 200 ml` ifadesindeki `3` ikinci miktar
  sanılıyor ve hacim 600 ml oluyor. Birleştirme yalnızca İKİSİNİN de açık birimi varsa yapılıyor.
