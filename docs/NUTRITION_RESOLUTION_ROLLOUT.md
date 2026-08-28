# Beslenme Çözümleme Hattı — Rollout Özeti

## Tamamlananlar

- Besin değeri artık model çıktısından alınmıyor; yalnızca `food_items` veya
  `food_corpus` satırından `100 g değeri × gram / 100` ile hesaplanıyor.
- Ücretsiz deterministik katman Pro kontrolünün dışında çalışıyor. Pro kullanıcıda
  model yalnızca ifade çıkarımı, kapalı listeden doğrulama ve gram tahmini yapıyor.
- Model/sağlayıcı hatasında istek deterministik hatta düşüyor; tüm öğün akışı
  kapanmıyor.
- USDA FoodData Central tabanlı 13.339 satırlık ayrı korpus, kullanıcı alias'ları,
  porsiyon hafızası, boşluk kuyruğu ve öğün parse trace şeması eklendi.
- Web ve mobilde kalori aralığı, çözüm/porsiyon basamağı, belirsiz kalem soruları,
  kullanıcı düzeltme hafızası ve küratörsüz kaynak onayı bağlandı.
- Fotoğraf/kamera özelliği eklenmedi. Dış case study/proje adları kullanılmadı.
- 34 vakalık deterministik eval harness eklendi.

## Doğrulananlar

- `pnpm --dir packages/shared exec tsc --noEmit --incremental false`
- `pnpm --dir apps/mobile exec tsc --noEmit --incremental false`
- `pnpm --dir apps/web exec tsc --noEmit --incremental false`
- `pnpm eval:nutrition` — 34/34 vaka geçti
- `pnpm build` — production web build geçti
- `pnpm lint` — yeni beslenme dosyalarında hata/uyarı yok; repoda önceden bulunan
  diğer ekran uyarıları devam ediyor
- `git diff --check` — temiz

## Dağıtım Durumu

Uzak ortama uygulandı (proje `ulmwvssyyfmuqxrgaewe`):

- [x] `pnpm db:migrate` — 032_nutrition_resolution uzak veritabanına uygulandı.
- [x] `pnpm db:corpus` — 13.339 satır yüklendi ve sayım doğrulandı.
- [x] `supabase functions deploy parse-meal` — `_shared/nutrition/*` ile birlikte deploy edildi.
- [x] Şema doğrulaması — korpus araması (trgm), `food_items` araması ve
      `meals.parse_trace` / `meals.parse_version` kolonları canlıda sorgulandı.
- [ ] Gerçek Free ve Pro hesapla arayüz smoke testi — giriş gerektirdiği için
      kullanıcı tarafından yapılmalı:
   - deterministik tam eşleşme
   - belirsiz yiyecek kısa listesi
   - bilinmeyen porsiyon gram sorusu
   - USDA eşleşmesinde zorunlu kullanıcı onayı
   - model anahtarı/kredisi yokken fallback
   - listeden seçerek ekleme (ücretsiz hesapta da çalışmalı)

## Elle Ekleme Akışı (ücretsiz katman)

`searchFoodChoices` küratörlü `food_items` ve küratörsüz `food_corpus` satırlarını
tek kapalı listede birleştirir; seçilen satır `buildItemFromChoice` ile öğün
kalemine çevrilir. Model çağrısı yoktur, bu yüzden ücretsiz planda da çalışır.
Besin değeri yine yalnızca veritabanı satırından hesaplanır. Seçim ve gramaj
`food_aliases` / `portion_memory` üzerinden hatırlanır, böylece serbest metin
hattı bir dahaki sefere aynı satırı kendisi bulur.

RLS: `food_corpus` üzerinde `FOR SELECT TO authenticated USING (TRUE)` — oturum
açmış her kullanıcı (Free dahil) korpusu okuyabilir.

## Yerel Doğrulama Sınırları

- Korumalı beslenme ekranı giriş gerektirdiğinden canlı tarayıcı kontrolü giriş
  sayfasına kadar yapılabildi; TypeScript, lint, eval ve production build geçti.
- Deno kurulu olmadığı için Edge Function için `deno check` çalıştırılamadı;
  fonksiyon deploy sırasında sunucu tarafında derlendi.
