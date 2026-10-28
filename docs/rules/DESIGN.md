# Tasarım kuralları (mobil)

Kapsam: `apps/mobile`. Web için ayrı kural yazılana kadar aynı ilkeler geçerlidir.
`#n` test mühendisi listesindeki madde sırasıdır (`docs/KALAN_ADIMLAR.md`).

## 1. Değerler tek kaynaktan

Renk, boşluk, köşe yarıçapı ve yazı boyutu `apps/mobile/src/theme/tokens.ts`'de tanımlıdır.
Bu dosya değerleri kopyalamaz; değer değişirse sadece `tokens.ts` değişir.

| Ne | Nereden | Not |
|----|---------|-----|
| Temaya göre değişen renk (zemin, metin, kenar, input, gölge) | `const { colors } = useTheme()` | `light` ve `dark` nesnelerini doğrudan import etme |
| İki temada aynı anlamsal renk (vurgu, başarı, uyarı, tehlike, blok ve durum renkleri) | `palette` | |
| Boşluk | `spacing[n]` | 4'ün katları ölçeği; ara değer gerekiyorsa önce ölçeğe ekle |
| Köşe | `radius.*` | |
| Yazı | `fontSize.*`, `fontWeight.*` | |

```ts
import { useTheme } from '@/src/contexts/ThemeContext'
import { palette, radius, spacing, fontSize, fontWeight } from '@/src/theme/tokens'
```

- Bileşende hex, `rgba(...)` veya sayısal boşluk literal'i yazılmaz. Gereken değer yoksa
  `tokens.ts`'e eklenir: tema rengiyse hem `light` hem `dark`'a.
- Kart yüzeyi kendin boyanmaz, `GlassCard` kullanılır (Android'de opak yüzey ve kenar uyumu orada çözülü).
- Gölge `colors.shadowCard` veya `colors.shadowSoft`.

Sebep: aynı rengin iki yerde ayrı yazılması kart kenarında kontur bıraktı (`tokens.ts` içindeki
`GLASS_LIGHT` notu). Kopyalanan değer zamanla kayar.

## 2. Yazı boyutu

- Okunması gereken her metin (etiket, buton, liste satırı, açıklama) en az `fontSize.sm`.
  Gövde metni `fontSize.base`.
- `fontSize.xs` sadece eylem için okunması gerekmeyen ek bilgide: birim, rozet, grafik ekseni, zaman damgası.
- `fontSize`'ın altında sayısal literal yazılmaz (bugün `fontSize: 10` olan yerler borçtur, aşağıda).
- Sistem yazı büyütmesi kapatılmaz: `allowFontScaling={false}` ve `maxFontSizeMultiplier` kullanılmaz.
  Büyük yazıda satır taşıyorsa düzen düzeltilir, yazı kilitlenmez.

Sebep: haftalık hedeflerde yazılar çok küçük (#27). 55 yaş personası büyük yazı ile kullanır.

## 3. Dokunma alanı

- Dokunulabilen her öğe en az 44x44. Görsel küçükse `hitSlop` ile büyütülür.
  Örnekler: `TaskCheckbox` (24px daire, hitSlop ile 44), `ReportStates.tsx` içindeki `BackButton` (44x44 kutu).
- Silme ikonları dahil, istisna yok (#39).
- Sadece ikon olan buton `accessibilityRole="button"` ve `accessibilityLabel` (i18n'den) taşır.
- Yan yana dokunma hedefleri arasında en az `spacing[2]`.

Sebep: silme butonları çok küçük (#39).

## 4. Açık ve koyu tema

`ThemeContext` üç mod sunar: `system`, `light`, `dark`. Her yeni ekran iki temada da açılıp
bakılır (WORKFLOW kapı 6). Metin rengi zemine göre `colors.textPrimary` / `textSecondary` /
`textMuted`; `textSubtle` sadece pasif ipucu için, okunması gereken metinde kullanılmaz.

## 5. Ortak bileşenler

Hepsi `apps/mobile/src/components/ui/` altında. Aynı işi yapan yeni bileşen yazılmaz; eksik
varsa ortak bileşene seçenek eklenir.

| Bileşen | Ne zaman | Ne zaman değil |
|---------|----------|----------------|
| `BottomSheet` | Bulunulan ekranın bağlamında kısa iş: form, seçim listesi, ayrıntı. Uzun içerik veya klavyeli form: `scrollable` | Geri alınamaz onay (uyarı kullan, `UX.md`), çok adımlı akış (ayrı ekran) |
| `Button` | Her metinli eylem. `primary` ekranda veya sheet'te tek birincil eylem; `secondary` yan eylem; `ghost` vazgeç/ikincil; `danger` silme onayı. Async işte `loading` | İkon tek başına (ikon butonu + hitSlop + etiket) |
| `Input` | Serbest metin ve sayı. Üstünde `label`; doluyken temizleme için `onClear` + `clearLabel` | Tarih ve saat (seçici), sabit seçenekler (`Segmented` veya liste) |
| `Segmented` | Aynı içeriğin görünümleri arasında geçiş (Gün / Hafta), 2 ile 4 seçenek | Sayfa navigasyonu, 4'ten fazla seçenek |
| `GlassCard` | Kart yüzeyi | |
| `ScreenBackground` | Sekme ve tam ekranların zemini ve güvenli alanı | |
| `StatCard`, `ProgressBar` | Sayısal özet, hedefe göre ilerleme | |
| `StatusBadge`, `Pill` (`Badge.tsx`) | Görev durumu, kısa etiket | Dokunulabilen öğe |
| `TaskCheckbox` | Tek dokunuşla tamamlama | |
| `DateField`, `TimeField` | Tarih ve saat girişi (Faz 3'te `@react-native-community/datetimepicker` ile gelir) | |

`DateField`/`TimeField` gelene kadar tarih veya saat için yeni elle yazılan alan eklenmez (#18, #32);
gerekiyorsa iş Faz 3'e bağlanır.

## 6. Async ekranlarda üç durum

Veri bekleyen her ekran ve kartta yükleniyor, boş ve hata durumu tasarlanır. Örnek desen:
`src/components/report/ReportStates.tsx` (`ReportSkeleton`, `ReportError`, `ReportMissing`, `EmptyDay`).

- Yükleniyor: mümkünse yerleşimle aynı iskelet (veri gelince ekran zıplamaz), değilse `ActivityIndicator`.
  Buton kaynaklı işte `Button loading`.
- Boş: ne olduğunu ve ne yapılacağını söyleyen tek cümle, yanında birincil eylem ("Henüz öğün yok" + "Öğün ekle").
  Sekmenin birincil girdisi olan kart boşken gizlenmez. Var olan karta sonradan eklenen ek satır
  ise veri yoksa hiç görünmez (kullanıcı kararı 2026-10-05).
- Hata: anlaşılır cümle (teknik mesaj değil) ve "Tekrar dene". Sessiz başarısızlık yok: işlem
  başarısızsa kullanıcı bunu görür. Kullanıcının başlattığı bir kayıt başarısızsa girdisi kaybolmaz.

Sebep: kaydetmeyen ama hata da vermeyen ekranlar (#20, #24) ve sessizce çalışmayan butonlar (#13, #15).

## Bilinen sapmalar (kopyalama, Faz 3'te düzelir)

Kodu doğrularken bulundu (2026-10-28); yeni kodda örnek alınmaz:
- `Segmented` seçenek yüksekliği 44'ün altında (`paddingVertical: 8` + `fontSize.sm`).
- `Button` `size="sm"` 44'ün altında, `hitSlop` prop'u yok.
- `Button` içinde `'#FFFFFF'` ve `rgba(...)` literal'leri var, token değil.
- `fontSize: 10` literal'i: `app/(tabs)/nutrition.tsx`, `app/(tabs)/planning.tsx`, `app/onboarding.tsx`.
- `BottomSheet`'te aşağı çekip kapatma yok (#6, #17).
