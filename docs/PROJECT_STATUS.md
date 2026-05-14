# LifeOS — Proje Durum Raporu

> Son güncelleme: 14 Mayıs 2026 — Checkpoint 17  
> Aşama: MVP Faz 2 — %90 tamamlandı

### Checkpoint 17 — 14 Mayıs 2026
**Vercel build hatası düzeltildi:**
- Login sayfasında prerendering hatası: `TypeError: Cannot read properties of undefined (reading 'trim')`
- Root cause: LoginForm (Client Component) Server Component olan login/page.tsx tarafından import ediliyordu; prerendering sırasında LoginForm sunucu-tarafında execute ediliyordu
- LoginForm `useLang()` hook'unu çağırıyor ve bu Context sunucu-tarafında initialize edilmiyordu
- İlk çözüm denemesi `ssr: false` kullandi ama Next.js hata verdi: `ssr: false` is not allowed with `next/dynamic` in Server Components
- Nihai çözüm: Yeni wrapper component [apps/web/app/(auth)/login/LoginFormClient.tsx](apps/web/app/(auth)/login/LoginFormClient.tsx) oluşturuldu (`'use client'` marked)
- LoginFormClient wrapper'ında dynamic import `{ ssr: false }` kullanıldı; page.tsx (Server Component) tarafından wrapper import edildi
- Vercel build başarılı hale geldi ✅

### Checkpoint 15 — 30 Nisan 2026
**Dumbbell ve makine egzersizleri ciddi şekilde genişletildi:**
- [supabase/migrations/012_expand_dumbbell_machine_library.sql](supabase/migrations/012_expand_dumbbell_machine_library.sql) eklendi; dumbbell bench/row/press/curl/lunge/RDL varyasyonlari ile machine chest press, row, pulldown, smith, leg press, leg curl, hip abduction, cable ve core makineleri kataloga dahil edildi
- [apps/mobile/app/(tabs)/workout.tsx](apps/mobile/app/(tabs)/workout.tsx) artik `Makine` ekipman filtresini de sunuyor; dumbbell ve machine filtre regex'leri yeni katalog isimlerini daha dogru yakaliyor
- [apps/web/components/workout/WorkoutView.tsx](apps/web/components/workout/WorkoutView.tsx) tarafinda da ayni filtreleme mantigi genisletildi; web ve mobil katalog gorunumu uyumlu hale geldi

### Checkpoint 16 — 30 Nisan 2026
**Workout ekipman filtreleri detaylandirildi:**
- [apps/mobile/app/(tabs)/workout.tsx](apps/mobile/app/(tabs)/workout.tsx) tarafina `Barbell`, `Kettlebell` ve `Cable` filtreleri eklendi; mevcut dumbbell/pull-up bar/machine ayirimlari da daraltildi
- [apps/web/components/workout/WorkoutView.tsx](apps/web/components/workout/WorkoutView.tsx) ayni ekipman ayrimini kullanacak sekilde guncellendi; web ve mobil filtre seti birebir esitlendi

### Checkpoint 14 — 30 Nisan 2026
**Workout AI program akışı ve egzersiz kütüphanesi genişletildi:**
- [apps/mobile/app/(tabs)/workout.tsx](apps/mobile/app/(tabs)/workout.tsx) içinde AI program oluşturma akışı güncellendi: egzersiz kütüphanesi boşsa önce store'dan yükleniyor, ardından stale closure yerine store'daki güncel egzersiz listesi kullanılıyor
- Aynı dosyada AI taslağını forma aktarma sırasında da güncel egzersiz kütüphanesi referans alınıyor; ilk açılışta boş liste yüzünden eşleşme kaybı engellendi
- [supabase/functions/ai-suggest/index.ts](supabase/functions/ai-suggest/index.ts) `workout_program_chat` kolu güçlendirildi: boş katalog durumunda kontrollü mesaj dönüyor, AI çıktısı yalnızca katalogdaki egzersizlere filtreleniyor, bozuk JSON çıktısında uygulama sert şekilde patlamıyor
- [supabase/migrations/011_more_exercises.sql](supabase/migrations/011_more_exercises.sql) ile kalistenik, salon, yüzme, esneme, yoga, pilates, yürüyüş ve grup fitness tarafına çok daha geniş bir egzersiz havuzu eklendi

### Checkpoint 13 — 29 Nisan 2026
**Mobil UI/UX standardizasyonu — Button ve stil tutarlılıkları çözüldü:**
- `apps/mobile/src/theme.ts` genişletildi: `T.btn.*` sizing standardları (primary, secondary, ghost, danger, pill) + padding/radius values
- Block type renkleri `T.blockType` altında organize edildi (task, routine, break, focus, meal, workout)
- Tüm ekranlar button styling'i standardize edildi:
  - [apps/mobile/app/(tabs)/tasks.tsx](apps/mobile/app/(tabs)/tasks.tsx) — Tab filter button'ları, sort button theme'den al
  - [apps/mobile/app/(tabs)/planning.tsx](apps/mobile/app/(tabs)/planning.tsx) — Cancel button'ı standardize
  - [apps/mobile/app/(tabs)/workout.tsx](apps/mobile/app/(tabs)/workout.tsx) — Region/equipment filter button'ları turuncu ama theme'den
  - [apps/mobile/app/(tabs)/today.tsx](apps/mobile/app/(tabs)/today.tsx) — Profile button'ı secondary style
  - [apps/mobile/app/(tabs)/nutrition.tsx](apps/mobile/app/(tabs)/nutrition.tsx) — Add meal button primary, filter button'ları pill style
- **Result:** Tutarlı button boyutları, renkler, padding ve border radius tüm ekranlarda

### Checkpoint 12 — 29 Nisan 2026
**Beslenme parsing hataları düzeltildi:**
- `supabase/functions/parse-meal/index.ts` modelinde hata: `claude-sonnet-4-20250514` → `claude-opus-4-6` (Spec'e uygun)
- Parse-meal fonksiyonunda bracket kapatma hatası düzeltildi (döngü ve if blokları eksik kapatılıyordu)
- AI sistem prompt'u geliştirildi: kaloriler için uyarı eklendi (Patates 77 kcal/100g, Hamburger 250-280 kcal/100g gibi)
- Yiyecek veritabanı eksik kayıtlarla genişletildi:
  - Triplex Smash Burger (210g, 550 kcal)
  - Sweetchill Tavuk Burger (180g, 420 kcal)
  - Pâté (50g, 210 kcal)
  - Mango / Fusetea Mango (330ml, 150 kcal)
- Parse-meal matching algoritması güçlendirildi: Kelime skoru sistemi, "tavuk burger" → "Tavuk göğsü" gibi yanlış eşleşmeler engellendi
- Edge Function deploy edildi ✅

### Checkpoint 11 — 28 Nisan 2026
- Mobilde [apps/mobile/app/(tabs)/planning.tsx](apps/mobile/app/(tabs)/planning.tsx) tamamen yeniden tasarlandı: temiz hafta şeridi, tek timeline odaklı plan workspace, tek AI öneri paneli, hızlı blok ekleme.
- [apps/mobile/app/(tabs)/today.tsx](apps/mobile/app/(tabs)/today.tsx) dashboard mantığında bırakıldı; Planlama detayına yönlendirme korunarak ekran ayrımı netleştirildi.
- Webde [apps/web/components/planning/PlanningView.tsx](apps/web/components/planning/PlanningView.tsx) AI buffer seçici kaldırıldı, buffer değeri sabitlenerek kullanıcıdan gizlendi.

---

## Nedir Bu Proje?

LifeOS, kişisel bir yaşam işletim sistemidir. Görev yönetimi (WSJF önceliklendirme), günlük zaman planlaması (time blocks), beslenme takibi ve Claude AI destekli karar yardımını tek bir platformda birleştirir. Hem web (Next.js) hem mobil (Expo) uygulaması vardır.

---

## Mimari Özet

```
lifeos/
├── apps/
│   ├── web/          → Next.js 15, App Router, Tailwind CSS
│   └── mobile/       → Expo SDK 52, Expo Router, NativeWind
├── packages/
│   ├── shared/       → Tipler, Supabase sorguları, Zustand store'ları, utils
│   └── ui/           → Paylaşılan UI hook'ları
├── supabase/
│   ├── migrations/   → SQL migrationlar (sıralı)
│   ├── functions/    → Deno Edge Functions (AI, bildirim)
│   └── seed.sql      → Türk mutfağı yiyecek veritabanı (96 kayıt)
```

**Ortak paket adları:** `@lifeos/shared`, `@lifeos/ui`, `@lifeos/web`, `@lifeos/mobile`

---

## Tamamlanan Bileşenler

### Veritabanı Şeması (✅ Tam)

#### `001_core_schema.sql`
| Tablo | Açıklama |
|-------|---------|
| `user_profiles` | Auth kullanıcılarına ek bilgi: display_name, timezone, preferences (JSONB) |
| `tasks` | WSJF puanlı görevler. 5 skor parametresi, `priority_score` otomatik hesaplanır |
| `task_details` | Her göreve ait notlar (markdown), checklist (JSONB), ekler (JSONB) |
| `time_blocks` | Günlük zaman blokları. Tip: task/routine/break/focus/meal/workout |
| `daily_plans` | Günlük plan özeti: enerji seviyesi (1-5), AI önerileri (JSONB) |

#### `002_nutrition_schema.sql`
| Tablo | Açıklama |
|-------|---------|
| `nutrition_targets` | Günlük makro hedefleri (kalori, protein, karbonhidrat, yağ, lif) |
| `meals` | Öğün kayıtları: serbest metin + ayrıştırılmış JSONB + toplam makrolar |
| `food_items` | Yiyecek veritabanı (user_id=NULL → global, aliases[] ile arama desteği) |

**Her tabloda:** RLS aktif, sadece kendi datasını görebilir. Realtime açık (`tasks`, `time_blocks`, `daily_plans`, `meals`).

**WSJF Formülü:**
```sql
priority_score = (value_score + urgency_score + risk_score) / (effort_score + friction_score)
-- PostgreSQL GENERATED ALWAYS AS STORED kolonu
-- Tüm parametreler 1-5, default 3
```

---

### Shared Paket — Tipler (✅ Tam)

`packages/shared/src/types/`

| Dosya | İçerik |
|-------|--------|
| `task.ts` | `TaskStatus` (backlog/planned/in_progress/blocked/done/deferred), `WsjfScores`, `Task`, `CreateTaskInput`, `UpdateTaskInput` |
| `nutrition.ts` | `MealType`, `FoodCategory`, `Macros`, `MealItem`, `Meal`, `FoodItem`, `NutritionTarget`, `MacroProgress`, `DailyNutritionSummary` |
| `planning.ts` | `BlockType`, `TimeBlock`, `DailyPlan`, `AiSuggestion` |
| `user.ts` | `UserPreferences`, `UserProfile`, `UpdateProfileInput` |
| `database.ts` | Supabase'den otomatik generate, `pnpm db:types` ile yenilenir |

---

### Shared Paket — Supabase Sorgu Fonksiyonları (✅ Tam)

`packages/shared/src/supabase/`

**tasks.ts** — 11 fonksiyon:
- `getTasks`, `getTaskById`, `createTask`, `updateTask`, `deleteTask`
- `updateTaskStatus` (done olunca `completed_at` otomatik set)
- `updateTaskDetails` (notes/checklist güncelleme)
- `getTasksByDate`, `getBacklogTasks`, `reorderTasks`, `getSubtasks`
- `subscribeToTasks` (Realtime listener)

**nutrition.ts** — 6 fonksiyon:
- `getMealsByDate`, `createMeal`, `updateMeal`, `deleteMeal`
- `getNutritionTarget`, `getDailySummary`

**planning.ts** — 9 fonksiyon:
- `getTimeBlocks`, `createTimeBlock`, `updateTimeBlock`, `deleteTimeBlock`
- `getDailyPlan`, `updateDailyPlan`
- `getFlexTasks`, `assignTaskToDate`, `getCarryoverTasks`

---

### Shared Paket — Zustand Store'ları (✅ Tam)

`packages/shared/src/stores/`

| Store | Durum & Aksiyonlar |
|-------|-------------------|
| `taskStore.ts` | `tasks[]`, `selectedTask`, optimistic CRUD, realtime handler |
| `nutritionStore.ts` | `meals[]`, `target`, `dailySummary`, tarih tabanlı fetch |
| `planningStore.ts` | `timeBlocks[]`, `dailyPlan`, `flexTasks[]`, `carryoverTasks[]` |

Pattern: Optimistic update (önce UI günceller, sonra Supabase'e yazar).

---

### Shared Paket — Utilities (✅ Tam)

`packages/shared/src/utils/`

| Dosya | Fonksiyonlar |
|-------|-------------|
| `priority.ts` | `calculateWsjf()`, `wsjfToPriorityLabel()`, `DEFAULT_WSJF_SCORES` |
| `nutrition.ts` | `calculateMacroProgress()`, `compareMacrosToTarget()`, `sumMacros()`, `remainingCalories()` |
| `date.ts` | `todayDate()`, `toDateString()`, `relativeDateLabel()` (Türkçe), `shiftIsoDate()`, `minutesBetween()`, `weekStart()` |

`packages/shared/src/constants/`
- Task/block/meal tipi için Türkçe etiketler ve renkler
- Tasarım token'ları (primary: `#1A1A2E`, accent: `#4A90D9`)
- Uygulama varsayılanları (effor limit: 25h, timezone: Europe/Istanbul)

---

### Web Uygulaması — Sayfalar (✅ Tam)

`apps/web/app/`

| Route | Açıklama |
|-------|---------|
| `/` | Dashboard'a yönlendirir |
| `/(auth)/login` | Giriş sayfası |
| `/(auth)/register` | Kayıt sayfası |
| `/dashboard` | Ana dashboard (timeline + günün görevleri + workout widget) |
| `/dashboard/tasks` | Tüm görevler (kanban/liste/backlog tabları) |
| `/dashboard/nutrition` | Beslenme takibi |
| `/dashboard/workout` | Antrenman takibi (Bugün/Kütüphane/Geçmiş tabları, AI fitness koçu) |
| `/dashboard/settings` | Kullanıcı ayarları |

**Middleware:** `middleware.ts` — SSR auth guard (`@supabase/ssr`). `/login` ve `/register` herkese açık, geri kalan her şey korumalı.

---

### Web Uygulaması — Bileşenler (✅ Tam)

`apps/web/components/` — 24 bileşen:

**UI (temel):**
- `Button`, `Input`, `Modal`, `Sheet`, `Badge`, `Sidebar`
- `Toast` — Toast bildirim sistemi (success/error/info/warning, auto-dismiss)
- `ErrorBoundary` — React error boundary (Türkçe hata mesajı, retry)

**Görev Yönetimi:**
- `TaskCard` — Görev kartı (öncelik rozeti, durum, WSJF)
- `TaskDetailDrawer` — Yan panel (detay, notlar, checklist CRUD)
- `TaskStatusSelect` — Durum dropdown
- `WsjfSliders` — 5 parametre slider'ı (önizleme ile)
- `QuickTaskInput` — Hızlı görev oluşturma (#tag !efor @tarih >son_tarih)
- `DashboardClient` — Dashboard state yönetimi
- `TasksClientPage` — Görevler sayfası (durum + etiket filtreleme)

**Zaman Planlama:**
- `DayTimeline` — 06:00–23:00 görsel timeline
- `TimeBlockItem` — Tek zaman bloğu (renkli, sürüklenebilir)
- `FlexPool` — Zamanlanmamış görevler havuzu
- `PlanningView` — Timeline + FlexPool + blok detay modal

**Beslenme:**
- `MacroProgress` — Makro ilerleme çubukları
- `MealCard` — Öğün kartı (ikon + makrolar)
- `MealAddModal` — Öğün ekleme/düzenleme modal (hata toast bildirimi)
- `NutritionClient` — Beslenme sayfası state (güvenli auth token)

**Workout:**
- `WorkoutView` — Antrenman takibi (Bugün/Kütüphane/Geçmiş tabları, AI koç, MET tabanlı kalori hesabı)

**Diğer:**
- `RealtimeProvider` — Supabase realtime aboneliklerini başlatır
- `SettingsClient` — Ayarlar formu (profil, makro hedefleri, fitness ayarları)

---

### Mobil Uygulama — Ekranlar (✅ Tamamlandı)

`apps/mobile/app/`

| Ekran | Durum |
|-------|-------|
| `(auth)/login.tsx` | ✅ Login formu |
| `(auth)/register.tsx` | ✅ Kayıt formu |
| `(tabs)/tasks.tsx` | ✅ Görev listesi, durum değiştirme, görev ekleme, bugün/tümü tabları |
| `(tabs)/today.tsx` | ✅ Zaman blokları, enerji seviyesi, beslenme özeti, **blok ekleme modal** |
| `(tabs)/nutrition.tsx` | ✅ Makro özeti, öğün listesi, öğün ekleme/silme modal |
| `(tabs)/profile.tsx` | ✅ Profil, **📏 Vücut (boy/kilo/yaş/cinsiyet/aktivite)**, beslenme hedefleri, TDEE hesaplama, çıkış |
| `(tabs)/workout.tsx` | ✅ Antrenman başlat/bitir, set ekle, egzersiz kütüphanesi, AI koç |
| `task/[id].tsx` | ✅ Görev detay, WSJF parametreleri, durum değiştirme, başlık düzenleme |

**Not:** `_layout.tsx` — Auth dinleyici + bottom tab navigator kurulu. Supabase SecureStore adaptörü (`src/lib/supabase.ts`) hazır. Push notification kaydı (`src/notifications/setup.ts`) hazır — **Expo Go SDK 53 uyumsuzluğu için guard eklendi** (development build gerektirir).

### Mobil — NativeWind v5 Migration (✅ Tamamlandı — 16 Nisan 2026)

Expo SDK 54 + Metro 0.83 uyumsuzluğu nedeniyle NativeWind v4→v5 migration yapıldı:

| Bileşen | Eski | Yeni |
|---------|------|------|
| NativeWind | v4.2.3 | **5.0.0-preview.3** |
| react-native-css | react-native-css-interop 0.2.3 | **react-native-css 3.0.7** |
| TailwindCSS | v3.4.17 | **v4.2.2** |
| PostCSS | — | **v8.5.9 + @tailwindcss/postcss v4.2.2** |
| lightningcss | — | **1.30.1** (pnpm override) |

**Değişen dosyalar:**
- `babel.config.js` — NativeWind preset'leri kaldırıldı (v5 metro transformer kullanır)
- `metro.config.js` — `withNativeWind(config)` (input parametresi kaldırıldı)
- `global.css` — TW4 import'ları + `@import "nativewind/theme"` + `@theme {}` custom renkleri
- `tailwind.config.js` — NativeWind preset kaldırıldı, sadece content paths
- `postcss.config.mjs` — Yeni dosya (`@tailwindcss/postcss` plugin)
- `nativewind-env.d.ts` — `react-native-css/types` referansı

---

### Supabase Edge Functions (✅ Tam)

`supabase/functions/`

#### `parse-meal/index.ts` — Öğün AI Parser
- **Endpoint:** `POST /functions/v1/parse-meal`
- **Input:** `{ raw_input: string, user_id: string }`
- **Output:** `{ items: MealItem[], matched_from_db: number, estimated_by_ai: number }`
- **Akış:**
  1. Türkçe metni virgül/satır ile ayır
  2. `food_items` tablosunda eşleştir (isim + aliases)
  3. Eşleşmeyenler için Claude'a gönder
  4. Birleşik sonuç döndür

#### `ai-suggest/index.ts` — AI Öneri Motoru
- **Endpoint:** `POST /functions/v1/ai-suggest`
- **İki mod:**
  - `daily_plan` → Enerji seviyesi + görev listesi analiz → sıra + odak önerileri
  - `task_priority` → Tek görev için WSJF puanı öner
- **Output (daily_plan):** `[{ type, message, task_id? }]`
- **Output (task_priority):** `{ value_score, urgency_score, ..., reasoning }`

#### `send-notification/index.ts` — Push Bildirim
- **Üç tip:** `task_reminder` (15 dk öncesi), `morning_briefing`, `evening_nutrition`
- **Kanal:** Expo Push API
- **Token yeri:** `user_profiles.preferences.push_token`
- **Tetikleyici:** pg_cron (henüz yapılandırılmadı)

---

### Seed Verisi (✅ Tam)

`supabase/seed.sql` — 96 Türk yiyeceği (`user_id = NULL` → global):

- Proteinler: yumurta, tavuk göğsü/but, kıyma, levrek, ton balığı, somon
- Süt ürünleri: beyaz peynir, kaşar, yoğurt, ayran, lor
- Tahıllar: ekmek (beyaz/tam buğday), pilav, bulgur, makarna, simit
- Sebzeler: domates, salatalık, biber, brokoli, ıspanak, mercimek çorbası
- Meyveler: muz, elma, portakal, çilek, karpuz
- Yağlar/Kuruyemişler: zeytinyağı, badem, ceviz, fıstık ezmesi
- İçecekler: çay, türk kahvesi, protein shake
- Hazır yemekler: kuru fasulye, döner, lahmacun, menemen, tost, mantı

Her kayıtta: porsiyon boyutu + birimi, kalori, protein, karbonhidrat, yağ, lif

---

## Checkpoint Geçmişi

### Checkpoint 10 — 27 Nisan 2026: TDEE Hesaplama + Vücut Bilgileri + Mobil Hata Düzeltmeleri

| # | Değişiklik |
|---|-----------|
| 1 | **packages/shared/src/utils/nutrition.ts**: `calculateTDEE()` (Harris-Benedict), `suggestMacrosFromTDEE()`, `ACTIVITY_LABELS` eklendi — shared utility |
| 2 | **apps/mobile/app/(tabs)/profile.tsx**: Tamamen yeniden yazıldı — 3 sekme (Profil / 📏 Vücut / 🎯 Beslenme). Yeni: cinsiyet, ağırlık, boy, yaş, haftalık aktivite, fitness hedefi, TDEE hesaplama ve beslenme hedeflerine uygulama |
| 3 | **apps/mobile/app/(tabs)/profile.tsx**: NativeWind v5 preview `TextInput` `path.split is not a function` hatası — `StyleSheet.create` ile workaround |
| 4 | **apps/mobile/src/notifications/setup.ts**: Expo Go SDK 53 push notification uyumsuzluğu — `Constants.appOwnership === 'expo'` guard + `getExpoPushTokenAsync` try-catch eklendi |
| 5 | **apps/web/components/settings/SettingsClient.tsx**: Fitness sekmesi genişletildi — cinsiyet seçimi, boy, yaş, haftalık aktivite (5 seviye radio), fitness hedefi, canlı TDEE hesaplama önizlemesi, "Beslenme Hedeflerine Uygula" butonu |
| 6 | Tüm yeni fonksiyonlar `@lifeos/shared`'den import edildi — web+mobil kod tekrarı yok |

### Checkpoint 9 — 20 Nisan 2026: EAS Build + Push Notification + Mobil Haftalık Stats
| # | Değişiklik |
|---|-----------|
| 1 | **apps/mobile/eas.json**: EAS build konfigürasyonu oluşturuldu (development/preview/production profilleri, iOS simulator + Android APK/AAB) |
| 2 | **apps/mobile/app.json**: `newArchEnabled: true`, `runtimeVersion`, splash, iOS background notification modu, Android permissions eklendi |
| 3 | **apps/mobile/app/_layout.tsx**: `registerForPushNotificationsAsync()` auth sonrası otomatik çağrılır, `addNotificationResponseListener()` deep-link yönlendirmesi ile entegre edildi |
| 4 | **apps/mobile/app/(tabs)/workout.tsx**: `handleFinishWorkout` MET tabanlı kalori tahmini + `finishWorkout()` çağrısına kalori eklendi (web ile aynı akış) |
| 5 | **apps/mobile/src/components/WeeklyStatsMobile.tsx**: 7 günlük haftalık stats bileşeni — skor çemberi, görev/kalori/antrenman bar'ları, renk kodlama |
| 6 | **apps/mobile/app/(tabs)/today.tsx**: "📈 Bu Hafta" bölümü eklendi (WeeklyStatsMobile entegre) |
| 7 | TypeScript strict — tüm paketler temiz ✅ |

**EAS Build Sonraki Adımlar (manuel):**
```bash
cd apps/mobile
npx eas-cli init          # Expo hesabı ile proje ID al → app.json extra.eas.projectId
npx eas-cli build --profile preview --platform android   # Android APK
npx eas-cli build --profile preview --platform ios       # iOS (Mac gerektirir)
```

### Checkpoint 8 — 20 Nisan 2026: Haftalık İstatistikler Chart + Workout→Kalori Bağlantısı

| # | Değişiklik |
|---|-----------|
| 1 | **recharts** kuruldu (`apps/web`) — haftalık chart için |
| 2 | **packages/shared/types/planning.ts**: `WeeklyDayStat` tipi eklendi (7 günlük görev/kalori/antrenman verisi) |
| 3 | **packages/shared/supabase/tasks.ts**: `getWeeklyTaskStats()` — 7 günlük görev tamamlama istatistiği |
| 4 | **packages/shared/supabase/workouts.ts**: `getWeeklyWorkoutStats()` — 7 günlük antrenman durumu + kalori |
| 5 | **packages/shared/supabase/workouts.ts**: `completeWorkout()` opsiyonel `totalCaloriesBurned` param aldı — tek sorguda kalori yazılır |
| 6 | **packages/shared/stores/workoutStore.ts**: `finishWorkout()` kalori parametresi eklendi, store state atomik güncellendi |
| 7 | **apps/web/components/WeeklyStatsChart.tsx**: Recharts ComposedChart — 7 günlük görev % bar + kalori çizgisi + antrenman durum noktaları |
| 8 | **apps/web/components/tasks/DashboardClient.tsx**: `WeekStrip` kaldırıldı → `WeeklyStatsChart` ile değiştirildi, `fetchWeeklyStats()` hook eklendi |
| 9 | **apps/web/components/workout/WorkoutView.tsx**: Artık tek `finishWorkout` çağrısı kalorisi ile birlikte (gereksiz `updateWorkout` çağrısı kaldırıldı) |
| 10 | TypeScript strict — tüm paketler temiz ✅ |

### Checkpoint 7 — 17 Nisan 2026: Cross-Module Entegrasyon + Lint/Güvenlik Temizliği

| # | Değişiklik |
|---|-----------|
| 1 | **apps/web**: `.eslintrc.json` oluşturuldu (`next/core-web-vitals` config) |
| 2 | **SettingsClient**: `useCallback` conditional hook hatası düzeltildi (hook'lar erken return'den önce tanımlandı) |
| 3 | **SettingsClient**: Fitness sekme eklendi (vücut ağırlığı, fitness hedefi, MET kalori formülü önizlemesi) |
| 4 | **SettingsClient/QuickTaskInput/WorkoutView/PlanningView**: JSX entity encoding hataları düzeltildi (`&apos;`, `&quot;`, `&rdquo;`) |
| 5 | **PlanningView**: `useCallback` gereksiz bağımlılıklar uyarısı giderildi |
| 6 | **NutritionClient**: Workout kalori banner (net kalori hesabı), yiyecek arama paneli eklendi |
| 7 | **Mobile nutrition.tsx**: Workout banner + yiyecek arama eklendi |
| 8 | **Mobile today.tsx**: Workout widget eklendi (ad, set sayısı, kalori, durum) |
| 9 | **DashboardClient**: WeekStrip bileşeni (7 günlük görev/beslenme/antrenman skoru) |
| 10 | **TaskDetailDrawer + mobile task/[id].tsx**: AI WSJF öneri butonu (🤖 AI Öner, akıl yürütme kutusu) |
| 11 | **WorkoutView**: `handleFinish` MET tabanlı kalori hesabı (`estimateCalories`), bitiş toast'ı |
| 12 | **PlanningView**: Blok tipi bazlı deep-link (workout→/dashboard/workout, meal→/dashboard/nutrition, task→/dashboard/tasks) |
| 13 | **supabase/seed_demo.sql**: Çalıştırılabilir demo verisi (aktif kullanıcı için tasks, meals, workout, time_blocks) |
| 14 | ESLint + TypeScript typecheck — tüm paketler temiz ✅ |

### Checkpoint 6 — 16 Nisan 2026: Workout Modülü Tam Entegrasyon

| # | Değişiklik |
|---|-----------|
| 1 | **packages/shared**: `types/workout.ts` — WorkoutCategory/Status/BodyRegion, MuscleGroup, Exercise, Workout, WorkoutSet, AiWorkoutPlan tipleri |
| 2 | **packages/shared**: `supabase/workouts.ts` — getMuscleGroups, getExercises, getWorkoutByDate, createWorkout, addWorkoutSet, completeWorkout (8 fonksiyon) |
| 3 | **packages/shared**: `stores/workoutStore.ts` — Zustand store (kütüphane cache, günlük antrenman, set CRUD, AI plan) |
| 4 | **packages/shared**: `constants/index.ts` — WORKOUT_CATEGORY_LABELS/COLORS, WORKOUT_STATUS_LABELS/COLORS, BODY_REGION_LABELS eklendi |
| 5 | **supabase**: `005_workout_schema.sql` — muscle_groups, exercises, workouts, workout_sets tabloları + RLS + Realtime + trigger |
| 6 | **supabase**: `006_seed_exercises.sql` — 12 kas grubu, 41 egzersiz (kuvvet/kardiyo/esneklik/mobilite) Türkçe |
| 7 | **supabase**: `ai-suggest/index.ts` — `workout_plan` tipi eklendi, son 7 günlük antrenman geçmişine bakarak AI koç önerisi üretiyor |
| 8 | **apps/web**: `/dashboard/workout` sayfası + `WorkoutView` (Bugün/Kütüphane/Geçmiş tabları, antrenman başlat/bitir, set ekleme, filtrelenebilir egzersiz listesi) |
| 9 | **apps/web**: Sidebar'a Antrenman nav linki eklendi |
| 10 | **apps/web**: DashboardClient'a workout widget eklendi (günlük antrenman durumu) |
| 11 | **apps/mobile**: `workout.tsx` ekranı (antrenman başlat/bitir/set ekle modalleri, AI koç, egzersiz kütüphanesi) |
| 12 | **apps/mobile**: `_layout.tsx` — 💪 Antrenman tab'ı eklendi |
| 13 | TypeScript strict — tüm paketler hatasız |

### Checkpoint 5 — 16 Nisan 2026: DayTimeline Drag & Drop + pg_cron

| # | Değişiklik |
|---|-----------|
| 1 | **DayTimeline**: `@dnd-kit/core` ile tam sürükle-bırak — blok dikey sürüklenir, 15 dakika snap, `onBlockDrop` ile `updateTimeBlock` tetiklenir |
| 2 | **PlanningView**: `onBlockDrop` handler bağlandı, bırakma sonrası "Blok taşındı" toast |
| 3 | **Migration 003**: pg_cron + pg_net extension + cron job tanımları |
| 4 | **Migration 004**: Cron job'lar düzeltildi (doğru URL, `app.service_role_key` ayarı) |
| 5 | pg_cron job'ları aktif: `morning-briefing` (05:00 UTC), `evening-nutrition` (18:00 UTC), `task-reminder` (her 15dk) |
| 6 | TypeScript strict — tüm paketler hatasız |

**pg_cron son adım:** Supabase SQL Editor'da çalıştır:
```sql
ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
```

### Checkpoint 4 — 16 Nisan 2026: Supabase Canlıya Alındı

| # | Değişiklik |
|---|-----------|
| 1 | `supabase link` ile proje bağlandı (ref: ulmwvssyyfmuqxrgaewe) |
| 2 | `supabase db push` — migration'lar zaten yüklüydü, doğrulandı |
| 3 | Tüm 8 tablo (`user_profiles`, `tasks`, `task_details`, `time_blocks`, `daily_plans`, `nutrition_targets`, `meals`, `food_items`) canlıda çalışıyor |
| 4 | Seed verisi doğrulandı (96 kayıt `food_items` tablosunda) |
| 5 | 3 Edge Function deploy: `parse-meal`, `ai-suggest`, `send-notification` |
| 6 | `ANTHROPIC_API_KEY` Supabase secrets'a set edildi |
| 7 | `pnpm dev:web` → localhost:3000 — auth guard çalışıyor |

### Checkpoint 3 — 16 Nisan 2026: Block Düzenleme + AI Önerileri + Mobil Tamamlama

| # | Değişiklik |
|---|-----------|
| 1 | **PlanningView**: Block detail modal'a tam edit modu eklendi (saat/tip/etiket değiştirme, `updateTimeBlock` store kullanılıyor) |
| 2 | **PlanningView**: AI önerileri paneli eklendi — `↻ Yenile` butonu `ai-suggest` edge function'ı tetikler, sonuçlar `daily_plans.ai_suggestions`'a yazılır |
| 3 | **Mobil today.tsx**: `+ Blok` butonu ve zaman bloğu ekleme modal'ı eklendi (saat/tip/etiket) |
| 4 | `packages/shared/src/supabase/planning.ts`: `updateDailyPlan` fonksiyonunda `ai_suggestions` parametresi `AiSuggestion[]` tipine çekti |
| 5 | TypeScript strict kontrolü — tüm paketlerde hatasız (`tsc --noEmit` temiz) |
| 6 | Mobil ekranların tümü store entegrasyonuyla tamamlandı (eski durum "⚠️ Kısmi" → "✅") |

### Checkpoint 2 — 16 Nisan 2026: NativeWind v5 Migration + CI Kuralları
| # | Değişiklik |
|---|-----------|
| 1 | NativeWind v4→v5 migration (Expo SDK 54 uyumsuzluğu çözüldü) |
| 2 | TailwindCSS v3→v4 upgrade (yeni import sistemi) |
| 3 | react-native-css-interop → react-native-css geçişi |
| 4 | Metro cache temizleme ve jsx-runtime resolve hatası düzeltildi |
| 5 | PostCSS config oluşturuldu (postcss.config.mjs) |
| 6 | lightningcss 1.30.1 pnpm override eklendi (deserialization hatası önleme) |
| 7 | Copilot instructions'a Git/Checkpoint, Güvenlik, Kod Kalitesi kuralları eklendi |
| 8 | Düzenli checkpoint dokümantasyonu başlatıldı |

### Checkpoint 1 — 16 Nisan 2026: Planning, Toast, Task/Nutrition UI

| # | İyileştirme |
|---|-------------|
| 1 | Toast bildirim sistemi (success/error/info/warning, auto-dismiss, slide-in animasyon) |
| 2 | ErrorBoundary bileşeni (Türkçe hata mesajı, retry butonu) |
| 3 | SettingsClient: makro yüzdesi sıfıra bölme hatası düzeltildi |
| 4 | NutritionClient: auth access_token null güvenliği eklendi |
| 5 | `updateTaskDetails()` Supabase fonksiyonu eklendi (notes/checklist güncellemesi) |
| 6 | TaskDetailDrawer: tam checklist CRUD (ekleme/silme/toggle) |
| 7 | TasksClientPage: durum + etiket bazlı filtreleme sistemi |
| 8 | PlanningView: `window.confirm` yerine blok detay modal'ı (bilgi + silme) |
| 9 | QuickTaskInput: `@bugün/@yarın/@YYYY-MM-DD` tarih parse + `>YYYY-MM-DD` son tarih |
| 10 | MealAddModal: sessiz hata yerine toast ile hata bildirimi |

---

## Sıradaki Adımlar (Faz 2)

| # | Görev | Öncelik |
|---|-------|---------|
| 1 | ~~DayTimeline drag & drop~~ | ✅ Tamamlandı |
| 2 | ~~pg_cron bildirimleri~~ | ✅ Tamamlandı |
| 3 | ~~Workout modülü (web + mobil + AI koç)~~ | ✅ Tamamlandı |
| 4 | ~~Cross-module entegrasyon (nutrition↔workout, planning deep-links, AI WSJF)~~ | ✅ Tamamlandı |
| 5 | ~~Dashboard haftalık istatistikler chart (görev trend + kalori + antrenman)~~ | ✅ Tamamlandı |
| 6 | ~~Workout→Kalori bağlantısı: antrenman bitince `total_calories_burned` kaydedilir~~ | ✅ Tamamlandı |
| 7 | ~~Expo EAS build konfigürasyonu + push notification entegrasyonu~~ | ✅ Tamamlandı |
| 8 | ~~Mobil haftalık stats (WeeklyStatsMobile bileşeni + today.tsx entegrasyonu)~~ | ✅ Tamamlandı |
| 9 | EAS build komutu çalıştır + APK test et (manuel, Expo hesabı gerekli) | 🟡 Yüksek |
| 10 | Multi-device Realtime sync testi (web + mobil aynı anda) | 🟢 Normal |
| 11 | Notification icon asset (assets/notification-icon.png) oluştur | 🟢 Normal |

## Canlı Altyapı Durumu ✅

| Bileşen | Durum |
|---------|-------|
| Supabase DB | ✅ Canlı — tüm tablolar + RLS aktif |
| Seed verisi | ✅ 96 Türk yiyeceği yüklü |
| Edge Function: `parse-meal` | ✅ Deploy edildi |
| Edge Function: `ai-suggest` | ✅ Deploy edildi (daily_plan + task_priority + workout_plan) |
| Edge Function: `send-notification` | ✅ Deploy edildi |
| Workout şeması | ✅ 4 tablo (muscle_groups, exercises, workouts, workout_sets) |
| Egzersiz seed | ✅ 12 kas grubu, 41 egzersiz |
| `ANTHROPIC_API_KEY` secret | ✅ Supabase'e set edildi |
| Web app (`pnpm dev:web`) | ✅ localhost:3000 çalışıyor |

---

## Teknik Kararlar — Neden Bu Araçlar?

| Karar | Neden |
|-------|-------|
| **Turborepo** | Web ve mobil `@lifeos/shared` paketini paylaşır. Tip değişikliği her iki uygulamaya otomatik yansır |
| **Supabase Realtime** | Gelecekte multi-device sync için altyapı hazır (web + mobil aynı anda açık) |
| **Optimistic Updates** | UI anında güncellenir, DB yazımı arka planda. Kullanıcı gecikme hissetmez |
| **WSJF DB'de GENERATED** | Puan her zaman tutarlı, client'ta hesaplamaya gerek yok |
| **Edge Functions** | Claude API key'i güvende, client'a expose edilmez |
| **SecureStore (mobile)** | Token'lar güvenli depolanır, `AsyncStorage`'dan daha güvenli |
