# AI model yönlendirme, net gelire göre bütçe ve yedek zinciri

Tarih: 2026-10-16. Durum: tasarım onaylandı, uygulama planı bekliyor.

## 1. Amaç

Üyelik fiyatı düşük (TR yıllık ₺790, aylık ₺99,90). Bugünkü yapıda AI maliyeti
fiyattan bağımsız büyüyebiliyor: sohbet rotalarının hepsi Opus 5'te, bütçe brüt
fiyattan hesaplanıyor ve sert sınır bütçenin 3 katında. Sonuç olarak yoğun bir Pro
kullanıcı her planda zarar ettirebiliyor.

Hedef:

- Her AI işinin modeli ayrı ayrı ve uzaktan, build ve deploy olmadan değişebilsin.
- Anthropic dışındaki sağlayıcılar (Gemini, ileride Kimi, DeepSeek, OpenRouter)
  tabloya bir satırla eklenebilsin.
- Bir Pro kullanıcının maksimum AI maliyeti net gelirinin bir payıyla sınırlansın;
  her Pro kullanıcı tanım gereği kâr bıraksın.
- Bütçe dolunca AI durmasın, ucuz bir yedek modelle devam etsin.
- Model değişiklikleri ölçülerek yapılsın, bozulma canlıda görülebilsin.

Başarı ölçütü: her Pro planında (bütçe + yedek maliyeti) < net gelir; kötüye
kullanım dışında hiçbir kullanıcı "AI limiti doldu" görmez; model değişikliği tek
`update` ile yapılır ve geri alınır.

## 2. Kapsam dışı

- Kredi yükleme sistemi (ikinci faz, ayrı tasarım; mağaza kuralları gereği hem
  IAP hem web, uygulama içinde web'e yönlendirme yok).
- Fiyat güncellemesi (ayrı karar).
- Uygulama içi "hafif mod" notu (build gerektirir, sonraki normal build'e küçük iş).
- Antrenman sohbetinin çıktı biçimini kısaltmak (egzersiz adı yerine katalog ID;
  ayrı iş, kendi değerlendirmesiyle).
- Admin arayüzü. Ayar tabloları Supabase Studio'dan ya da SQL ile düzenlenir.

## 3. Bugünkü durum (ölçülmüş)

AI çağrı noktaları: `ai-suggest` içinde 9 rota (`daily_plan`, `replan`,
`brain_dump`, `task_priority`, `workout_plan`, `workout_program_chat`,
`nutrition_chat`, `life_setup`, `daily_report`), `parse-meal` içinde 4 rol
(çıkarıcı, doğrulayıcı, gram tahmini, yiyecek tahmini). Hepsi
`npm:@anthropic-ai/sdk` ile doğrudan Anthropic'e bağlı.

Model ayarı 4 ortam değişkeninden geliyor: `CHAT_MODEL` (claude-opus-5),
`BUDGET_CHAT_MODEL` (claude-sonnet-5), `LEGACY_SUGGEST_MODEL` (claude-sonnet-5),
`NUTRITION_MODEL` / `NUTRITION_VERIFY_MODEL` (claude-opus-4-6 / claude-sonnet-5).
Canlı `ai_used` satırlarındaki model adları kod varsayılanlarıyla aynı; secret ile
ezilmiş bir değer görünmüyor.

Rota başına ortalama (canlı `events.ai_used`):

| Rota | Girdi | Önbellek yazma | Önbellek okuma | Çıktı | Maliyet |
|---|---|---|---|---|---|
| workout_program_chat | 149 | 3.920 | 1.306 | 1.524 | $0,064 |
| life_setup | 694 | 2.415 | 604 | 704 | $0,037 |
| replan | 1.105 | 866 | 99 | 492 | $0,023 |
| task_priority | 296 | 0 | 0 | 182 | $0,002 |

Maliyetin yarısından fazlası çıktı token'ı (düşünme dahil). Promptlar büyük değil.
Düşük trafikte prompt önbelleği yazılıp okunmadan siliniyor, kazancı şimdilik yok.

## 4. Tasarım

### 4.1 Tablolar (migration 071)

**`ai_models`**: model kataloğu.

| Kolon | Tip | Not |
|---|---|---|
| `id` | text PK | Kısa ad, örn. `opus-5`, `gemini-flash-lite` |
| `provider` | text | `anthropic` ya da `openai_compat` (CHECK) |
| `api_model` | text | Sağlayıcıya giden ad, örn. `claude-opus-5` |
| `base_url` | text null | Yalnız `openai_compat`; CHECK `base_url ~ '^https://'` |
| `api_key_secret` | text | Secret ADI; CHECK `api_key_secret ~ '^AI_KEY_[A-Z0-9_]+$'` |
| `input_per_mtok` | numeric | USD / 1M girdi token |
| `output_per_mtok` | numeric | USD / 1M çıktı token |
| `cached_input_per_mtok` | numeric null | Boşsa önbellekli girdi normal fiyattan sayılır |
| `extra_params` | jsonb | İsteğe olduğu gibi eklenir, örn. `{"thinking":{"type":"disabled"}}`, `{"reasoning_effort":"none"}` |
| `enabled` | boolean | Kapalı model seçilmez |

Anthropic için önbellek fiyatı kodda kalır (yazma 1,25x, okuma 0,1x girdi).

**`ai_model_routes`**: hangi iş hangi modelde.

| Kolon | Tip | Not |
|---|---|---|
| `route` | text PK | 9 sohbet rotası + `meal_extract`, `meal_verify`, `meal_portion`, `meal_estimate` |
| `primary_model` | text FK → ai_models | |
| `fallback_model` | text null FK → ai_models | Boşsa bütçe aşımında da birinci model |
| `updated_at` | timestamptz | `update_updated_at()` tetikleyicisi |

Güvenlik: iki tabloda RLS açık, `anon` ve `authenticated` için politika yok;
yalnız service role okur ve yazar. `api_key_secret` ve `base_url` kısıtları,
tabloya yazabilen birinin örneğin `SUPABASE_SERVICE_ROLE_KEY`'i kendi sunucusuna
göndermesini engeller. Kod da aynı kontrolü tekrar yapar. Anthropic anahtarı
`AI_KEY_ANTHROPIC` adıyla da tanımlanır (mevcut `ANTHROPIC_API_KEY` geçiş
süresince kalır).

İlk veri, bugünkü modellerle birebir:

| Rota | Birinci | Yedek |
|---|---|---|
| replan, workout_plan, workout_program_chat, nutrition_chat, life_setup, daily_report | opus-5 | sonnet-5 |
| brain_dump | opus-5-nothink | sonnet-5-nothink |
| daily_plan, task_priority | sonnet-5-nothink | boş |
| meal_extract, meal_estimate | opus-4-6 | sonnet-5-nothink |
| meal_verify, meal_portion | sonnet-5-nothink | boş |

Modele özgü bütün parametreler katalogdadır, rotada değil: `opus-5` ve `sonnet-5`
satırlarında `{"output_config":{"effort":"low"}}`, `*-nothink` satırlarında
`{"thinking":{"type":"disabled"}}`, `opus-4-6` satırında `{"temperature":0}`. Bu,
bugün kodda dağınık duran `CHAT_EFFORT`, `thinking` ve `sampling` kararlarının
birebir karşılığıdır.

Gemini satırları migration'a girmez: model adları ve fiyatları yayın sırasında
Google'ın güncel listesinden doğrulanıp tek `insert` ile eklenir, değerlendirmeden
sonra rotalara tek tek atanır.

`events_name_check` kısıtına `ai_fallback_notified` adı eklenir (4.4).

Yeni migration'dan sonra eski 4 ortam değişkeni okunmaz; kaldırılır.

### 4.2 Sağlayıcı katmanı (`supabase/functions/_shared/ai/llm/`)

- **`generate.ts`** (+ `types.ts`): tek giriş noktası.
  - `LlmRequest`: `system` (düz metin ya da mevcut `SystemBlock[]`: sabit blok
    önce, değişken blok sonra), `messages`, `maxTokens`, isteğe bağlı `tool` (ad,
    açıklama, JSON şema, strict). Effort ve düşünme istekte değil, katalogda.
  - `LlmResult`: `text`, `toolInput`, `usage` (input, output, cacheRead,
    cacheWrite), `modelId`, `stopReason` (`end` | `max_tokens` | `tool`), `mode`
    (`primary` | `fallback`).
  - `generate(route, request, ctx)`: router'dan modeli alır, adaptörü çağırır.
- **`providers/anthropic.ts`**: mevcut SDK. Sabit sistem metni `cache_control`
  bloğu olarak olduğu gibi gider, `tool` → `tools` + zorunlu `tool_choice`,
  `extra_params` isteğe eklenir. Anthropic SDK import'u yalnız bu dosyada.
- **`providers/openaiCompat.ts`**: SDK yok, `fetch` ile
  `{base_url}/chat/completions`. Sabit metin öne konur (otomatik önek önbelleği
  için). `tool` → `tools:[{type:'function'}]` + zorunlu `tool_choice`, argüman JSON'u
  ayrıştırılır. `finish_reason:'length'` → `max_tokens`. Kullanım
  `prompt_tokens`, `completion_tokens`, `prompt_tokens_details.cached_tokens`
  alanlarından. Sağlayıcıya özgü ayarlar `extra_params` ile.
- **`router.ts`**: iki tabloyu service role istemcisiyle okur, 60 saniye bellekte
  tutar. Rota ve bütçe durumuna göre modeli seçer, anahtarı
  `Deno.env.get(api_key_secret)` ile çözer (ad kuralı tekrar kontrol edilir).
  Tablo okunamazsa koddaki varsayılan eşlemeye döner (4.1'deki ilk veriyle aynı);
  ayar hatası AI'ı durdurmaz.

**Hata anında yedek:** birinci model 5xx, 429 ya da zaman aşımı verirse aynı istek
bir kez yedek modelle tekrarlanır (yedek varsa). Defterde gerçekten kullanılan
model yazılır. Yedek de düşerse bugünkü hata davranışı korunur.

**Çağrı noktaları:** 9 handler'da `client.messages.create` yerine `generate`,
`firstText(response)` yerine `result.text`. Öğün tarafında `createAnthropic*`
fabrikaları `createLlm*` olur; `Extractor`, `Verifier` arayüzleri ve iç mantık
değişmez. Prompt kurucuları (`systemBlocks`) olduğu gibi kalır.

**Bilinen risk:** Gemini'nin strict şema desteği Claude'unkinden dar. Öğün
şemaları basit (enum, sayı, metin); uyumsuzluk 4.5'teki değerlendirmede görünür.
Öğün hattının mevcut korumaları (kapalı liste, güven tavanı, kullanıcı onayı)
yerinde kalır.

### 4.3 Bütçe ve net gelir

**`subscriptions` yeni kolonlar:**

- `net_monthly_usd numeric null`: vergi ve mağaza payı düşülmüş aylık net gelir.
- `ai_budget_override_usd numeric null`: elle verilen hesaplar için sabit aylık
  bütçe.

**Net gelirin yazılması:**

- RevenueCat webhook (`INITIAL_PURCHASE`, `RENEWAL`):
  `price × (1 − tax_percentage − commission_percentage)`, yıllık planda `/ 12`.
  Oranlar gelmezse `AI_DEFAULT_TAX_PCT` (0,167, yani %20 KDV'nin fiyat içindeki
  payı) ve `AI_DEFAULT_COMMISSION_PCT` (0,15). Denemede fiyat 0; mevcut değer
  ezilmez.
- PayTR IPN (`apps/web/app/api/payment/notification/route.ts`): ödenen TL tutarı
  → KDV ve `PAYTR_COMMISSION_PCT` düşülür → `AI_USD_TRY` kuruyla dolara çevrilir,
  yıllıkta `/ 12`. Kur web ortam değişkeni; eskimesi bütçeyi birkaç sent kaydırır.

**Formül** (`_shared/ai/usage.ts`):

```
deneme  → AI_TRIAL_BUDGET_USD (0,50)
diğer   → ai_budget_override_usd
          ?? net_monthly_usd × AI_BUDGET_SHARE (0,4)
          ?? AI_DEFAULT_BUDGET_USD (0,38)
```

Ücretsiz katman değişmez (ömür boyu 3 hak, birinci model).

**Sert sınır kalkar.** Yerine kötüye kullanım koruması: bu ayki toplam maliyet
`AI_ABUSE_CAP_USD` (5) değerini geçerse 429 `ai_budget_exhausted`. Mevcut
uygulama mesajı bu durum için aynen kalır.

Yeni bütçeler (pay 0,4; %15 Apple payı varsayımı ASC Proceeds ile doğrulanmadı):

| Plan | Net/ay | Bütçe | Garanti pay |
|---|---|---|---|
| TR yıllık | $0,96 | $0,38 | ≥ $0,58 |
| TR aylık | $1,45 | $0,58 | ≥ $0,87 |
| ABD yıllık | $2,83 | $1,13 | ≥ $1,70 |
| ABD aylık | $4,24 | $1,70 | ≥ $2,54 |

Garanti paydan yedek model maliyeti (çağrı başı yaklaşık $0,001) ve altyapı gideri
düşülür.

Elle verilen mevcut Pro hesapları (tariikdevecii, kubranurakbaba,
aysemelisdevecii) için `ai_budget_override_usd` değerleri uygulama sırasında
kullanıcıya sorularak yazılır.

### 4.4 Yedek zinciri ve bildirim

Her istekte sıra: erişim (free / deneme / Pro) → kötüye kullanım koruması →
bütçe (aşıldıysa yedek, değilse birinci model) → çağrı (hata anında bir kez
yedek) → yanıta `ai_mode: 'primary' | 'fallback'` alanı. Eski istemciler bu alanı
yok sayar.

**Öğün ayrıştırma:** bugünkü `budgetLimited` dalı kalkar. Bütçe aşımında dört rol
kendi yedek modeline geçer; kural katmanı yalnız iki model de düşerse ya da
anahtar yoksa devreye girer. Yanıttaki `ai.error: 'budget'` artık üretilmez,
uygulamadaki bütçe uyarısı kendiliğinden görünmez olur.

**Bildirim:** kullanıcının bütçeyi aştığı ilk istekte, o takvim ayı (UTC) için
`events` içinde `ai_fallback_notified` satırı yoksa satır yazılır ve
`_shared/push.ts` → `sendExpoPush` ile `push_tokens`'taki cihazlara gönderilir.
Token yoksa ya da gönderim düşerse istek etkilenmez. Metin (TR / EN):

> Bu ayki hızlı AI kullanımın doldu. AI özelliklerin çalışmaya devam ediyor, ay
> sonuna kadar daha hafif bir modelle. Yenilenme: 1 {Ay}.

> Your fast AI allowance for this month is used up. Your AI features keep working
> with a lighter model until the end of the month. Renews: {Month} 1.

Sayıdan sonra ek yazılmaz (`daily-digest/copy.ts` kuralı); bu yüzden "1 Kasım'da"
yerine "Yenilenme: 1 Kasım."

Bildirimde ödeme, kredi ya da web sitesi geçmez.

### 4.5 Ölçüm ve kalite kontrolü

**Defter alanları** (`ai_used.props`, mevcutlara ek): `route`, `mode`,
`text_chars` (görünen çıktı uzunluğu; düşünme payı için), `parse_ok` (yanıt
ayrıştırıcıdan geçti mi). Maliyet, `pricePerMTok` regex'i yerine `ai_models`
fiyatlarından; tabloda olmayan model bugünkü gibi pahalı sayılır.

**Canlı izleme:** `analytics.ai_route_health` görünümü. Rota, model, mod ve ay
bazında çağrı sayısı, toplam ve ortalama maliyet, `parse_ok` oranı, yedek payı,
`text_chars / output_tokens` oranı.

**Değerlendirme aracı:** `pnpm eval:ai -- --route <rota> --model <id> --baseline <id>`
(`scripts/ai-eval/`).

- Üretimdeki prompt kurucuları, `generate` ve ayrıştırıcılar kullanılır.
- Rota başına 10 ile 20 vakalık sentetik Türkçe fixture; gerçek kullanıcı verisi
  yok.
- Ölçütler: ayrıştırma başarısı ve `max_tokens` kesilmesi (geçme: referansın en
  fazla 2 puan altı), rota kontrolleri (plan blokları güne sığıyor ve korunan
  bloklara çakışmıyor; antrenman egzersizlerinin katalogda bulunma oranı; görev
  puanları 1 ile 5 arasında; beyin boşaltmada beklenen görev sayısı), maliyet,
  p95 gecikme, düşünme payı.
- Öğün doğruluğu: `pnpm eval:nutrition`'a `--model <id>` bayrağı; etiketli
  vakalarda kalori hatası model katmanıyla ölçülür.
- Rapor ve 10 çiftlik yan yana markdown işletim sisteminin geçici klasörüne
  yazılır, yol ekrana basılır. Ton ve Türkçe kalitesine kullanıcı karar verir.

**Node uyumu:** `tests/support/ts-resolve.mjs`'e `npm:<paket>` → `<paket>` eşlemesi;
`@anthropic-ai/sdk` kök `devDependencies`'e eklenir. Üretim kodu değişmez.

**Geçiş sırası** (her biri değerlendirme + onay + tek `update`):

1. task_priority, brain_dump
2. meal_verify, meal_portion
3. daily_report, replan, daily_plan
4. workout_program_chat, workout_plan, life_setup, nutrition_chat, meal_extract,
   meal_estimate

## 5. Testler

- `llm.ts` / adaptörler (`fetch` taklidiyle): araç çağrısı, kullanım eşlemesi,
  `length` → `max_tokens`, `extra_params` birleşimi, Anthropic önbellek bloğu.
- `router.ts`: 60 sn önbellek, `AI_KEY_` kontrolü, kapalı model, tablo
  okunamayınca varsayılan, birinci hata verince yedek.
- `usage.ts` (`aiAccess.test.ts` güncellenir): override > net > varsayılan,
  deneme, bütçe altı / üstü, `fallback_model` boş, $5 üstü 429.
- RevenueCat webhook: oranlı, oransız, yıllık, deneme (0 fiyat ezmez).
- PayTR IPN: TL → net USD.
- Bildirim: ayda bir kez, ertesi ay yeniden, token yokken hata yok.
- Öğün: bütçe aşımında yedek modele geçiş, iki model düşünce kural katmanı.
- Migration: yerel PostgreSQL ile CHECK kısıtları ve ilk veri.

## 6. Yayın sırası

1. Migration 071 (tablolar, kolonlar, görünüm, ilk veri) yerelde denenir, sonra
   kullanıcı onayıyla `db push`; ardından `pnpm db:types`.
2. Secret'lar: `AI_KEY_ANTHROPIC`, `AI_KEY_GEMINI` (ücretli katman, eğitimde
   kullanılmaz), bütçe ayarları.
3. Edge function deploy: `ai-suggest`, `parse-meal`, `revenuecat-webhook`. İlk veri
   bugünkü modellerle aynı olduğu için deploy anındaki davranış değişiklikleri
   şunlardır: yeni bütçe formülü, sert sınırın kalkması ve bütçe aşımında öğün
   ayrıştırmanın kural katmanı yerine yedek modelle (sonnet-5) çalışması.
4. Web deploy (PayTR net gelir).
5. Gizlilik politikası ve mağaza veri beyanlarına Google'ın veri işleyen olarak
   eklenmesi; Gemini'ye ilk rota atanmadan önce.
6. 4.5'teki sırayla rota geçişleri.

Mobil build gerekmez.
