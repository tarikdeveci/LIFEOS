# LifeOS — Codex Context

## Proje Nedir?
LifeOS kişisel bir yaşam işletim sistemi. Görev yönetimi (WSJF önceliklendirme), günlük zaman planlaması (time blocks), beslenme takibi ve Codex AI destekli karar yardımını birleştirir.

## Monorepo Yapısı
```
lifeos/
├── apps/
│   ├── web/          @lifeos/web      → Next.js 15 App Router + Tailwind
│   └── mobile/       @lifeos/mobile   → Expo + NativeWind
├── packages/
│   ├── shared/       @lifeos/shared   → Types, Supabase client, utils, Zustand stores
│   └── ui/           @lifeos/ui       → Shared UI hooks & helpers
├── supabase/
│   ├── migrations/   → SQL migration dosyaları (sıralı: 001_, 002_, ...)
│   ├── functions/    → Edge Functions (Deno/TypeScript)
│   └── seed.sql      → Türk mutfağı yiyecek veritabanı
├── AGENTS.md         ← (bu dosya)
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example
```

## Tech Stack — Kesin, Değişmez
| Katman | Teknoloji |
|--------|-----------|
| Web | Next.js 15 (App Router, TypeScript) |
| Mobil | Expo SDK + Expo Router + NativeWind |
| Backend | Supabase (PostgreSQL, Auth, Realtime, Edge Functions, Storage) |
| AI | Codex Codex-opus-4-6 via Anthropic SDK (Edge Functions'dan çağrılır) |
| State | Zustand + Supabase Realtime |
| Styling Web | Tailwind CSS |
| Styling Mobil | NativeWind |
| Monorepo | Turborepo + pnpm workspaces |

## Paket İsimleri
- `@lifeos/shared` — her şeyin ithal ettiği ortak paket
- `@lifeos/ui` — shared UI hooks
- `@lifeos/web` — Next.js app
- `@lifeos/mobile` — Expo app

## Veritabanı Şeması (Özet)
Tablo → Açıklama:
- `user_profiles` — auth.users'a ek profil (timezone, preferences JSONB)
- `tasks` — WSJF skorlu görevler (value/urgency/risk/effort/friction 1-5, priority_score generated)
- `task_details` — notes (markdown), checklist JSONB, attachments JSONB
- `time_blocks` — günlük zaman blokları (block_type: task/routine/break/focus/meal/workout)
- `daily_plans` — günlük plan özeti (energy_level, ai_suggestions JSONB)
- `nutrition_targets` — makro hedefleri (calories, protein_g, carbs_g, fat_g, fiber_g)
- `meals` — öğün kayıtları (raw_input + items JSONB + toplam makrolar)
- `food_items` — yiyecek veritabanı (user_id NULL = global, aliases TEXT[])

**RLS**: Her tabloda aktif. Kullanıcı sadece kendi datasını görür.

## WSJF Önceliklendirme
```
priority_score = (value_score + urgency_score + risk_score) / (effort_score + friction_score)
```
Tüm parametreler 1-5, default 3. `priority_score` PostgreSQL GENERATED ALWAYS AS STORED kolonu.

## Klasör Konvansiyonları

### packages/shared/src/
```
types/       → Pure TypeScript interfaces/types (runtime kodu yok)
supabase/    → Supabase query fonksiyonları (tasks.ts, nutrition.ts, planning.ts)
stores/      → Zustand store'ları (taskStore.ts, nutritionStore.ts, planningStore.ts)
utils/       → Pure fonksiyonlar (priority.ts, nutrition.ts, date.ts)
constants/   → App-wide sabitler (index.ts)
```

### apps/web/app/
```
(auth)/      → login, register sayfaları (auth route group)
dashboard/   → korumalı ana uygulama
  page.tsx   → Ana dashboard (timeline + today's tasks)
  tasks/     → Tüm görevler (kanban/list/backlog tabs)
  nutrition/ → Beslenme takibi
  settings/  → Kullanıcı ayarları
components/  → Reusable UI bileşenleri
  tasks/     → TaskCard, TaskDetailDrawer, QuickTaskInput
  planning/  → DayTimeline, TimeBlockItem, FlexPool
  nutrition/ → MacroProgress, MealCard, MealAddModal
  ui/        → Button, Input, Modal, Sheet (shadcn/ui bazlı)
lib/         → Yardımcı fonksiyonlar, hooks
```

### supabase/functions/
Her Edge Function kendi klasöründe `index.ts` ile:
- `parse-meal/` → AI ile öğün parse (Codex Codex-opus-4-6)
- `send-notification/` → Expo push notification gönderimi
- `ai-suggest/` → Görev önceliklendirme + günlük plan AI önerileri

## Codex API Kullanımı (Edge Functions)
```typescript
// Supabase Edge Functions → Deno runtime → @anthropic-ai/sdk
import Anthropic from 'npm:@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

const response = await client.messages.create({
  model: 'Codex-opus-4-6',
  max_tokens: 1024,
  system: '...system prompt...',
  messages: [{ role: 'user', content: userInput }],
})
```

## Kod Yazma Kuralları

### Genel
- **Her zaman TypeScript strict mode** — `any` yasak, `unknown` kullan ve daralt
- **Import sırası**: 1) Node built-ins, 2) External packages, 3) @lifeos/* packages, 4) Relative
- **Named export tercih et**, default export sadece Next.js page/layout için
- **Barrel exports**: Her klasörde `index.ts` ile public API tanımla
- **Asenkron**: Async/await kullan, `.then()` zinciri yazma

### Supabase Query Fonksiyonları
```typescript
// Her fonksiyon: hata fırlatır, null döner değil
// Dönüş tipi her zaman explicit
export async function getTasks(userId: string, filters: TaskFilters): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, task_details(*)')
    .eq('user_id', userId)

  if (error) throw error
  return data
}
```

### Zustand Stores
```typescript
// Slice pattern: her store sadece kendi domain'ini yönetir
// Realtime event handler her store'da bulunur
// Optimistic update: önce UI'ı güncelle, sonra Supabase'e yaz
```

### React Components
- **Server Components default** (Next.js web) — Client component gerekiyorsa `'use client'` ekle
- **Prop tipler interface ile** tanımla, component dosyasının üstünde
- **Hook extraction**: 3'ten fazla useState varsa custom hook'a çıkar
- **Loading/Error state** her async işlem için zorunlu

## Önemli Bağlamlar

### Neden Turborepo?
Web ve mobil arasında `@lifeos/shared` paketini paylaşmak için. Type değişikliği her iki app'e otomatik yansır.

### Neden Supabase Realtime?
Gelecekte multi-device sync (web + mobil aynı anda açık) için. Şimdilik optimistic update yeterli, ama altyapı hazır olsun.

### Beslenme Parse Akışı
1. Kullanıcı serbest Türkçe metin girer ("2 yumurta, tam buğday ekmek")
2. Önce `food_items` tablosunda local match aranır
3. Eşleşmeyenler için `parse-meal` edge function → Codex Codex-opus-4-6
4. DB'deki eşleşmeler Codex tahmini yerine geçer (daha doğru)

### Bildirim Sistemi
Expo Push Notifications. Token `user_profiles.preferences.push_token`'da saklanır. `send-notification` edge function pg_cron ile tetiklenir.

## Komutlar
```bash
pnpm dev              # Tüm apps paralel
pnpm dev:web          # Sadece web
pnpm dev:mobile       # Sadece mobile
pnpm build            # Production build
pnpm typecheck        # Tüm paketlerde type check
pnpm lint             # ESLint
pnpm db:migrate       # Supabase migration push
pnpm db:reset         # DB reset + seed
pnpm db:types         # Supabase'den TypeScript tipleri generate et
```
