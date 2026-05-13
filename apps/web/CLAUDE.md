# apps/web — Claude Code Context

## Bu Nedir?
LifeOS Next.js 15 App Router uygulaması.

## Klasör Yapısı
```
app/
  layout.tsx          → Root layout (metadata, globals.css)
  page.tsx            → / → /dashboard redirect
  (auth)/
    login/            → Login sayfası (Server + Client bileşen ayrımı)
    register/         → Kayıt sayfası
  dashboard/
    layout.tsx        → Sidebar + auth check (Server Component)
    page.tsx          → Ana dashboard (grid: timeline + tasks + stats)
    tasks/            → Görev yönetimi (kanban/list/backlog)
    nutrition/        → Beslenme takibi
    settings/         → Kullanıcı ayarları
components/
  ui/                 → Genel UI (Sidebar, Button, Modal, Sheet...)
  tasks/              → TaskCard, TaskDetailDrawer, QuickTaskInput
  planning/           → DayTimeline, TimeBlockItem, FlexPool
  nutrition/          → MacroProgress, MealCard, MealAddModal
lib/
  supabase/
    client.ts         → Browser client (singleton, 'use client')
    server.ts         → Server client (cookies, async)
  hooks/              → Web-specific custom hooks
middleware.ts         → Auth guard (public: /login, /register)
```

## Önemli Kurallar
- `app/dashboard/layout.tsx` auth check yapar → session yoksa /login
- Server Component'ten client'a veri geçişi: props veya Zustand store hydration
- `lib/supabase/client.ts` → browser, `lib/supabase/server.ts` → server
- Tailwind class order: prettier-plugin-tailwindcss halleder
- Path alias: `@/` → proje kökü (`tsconfig.json` paths)

## Supabase Pattern (Web)
```typescript
// Server Component
const supabase = await createServerClient()
const { data } = await supabase.from('tasks').select('*')

// Client Component
'use client'
import { supabase } from '@/lib/supabase/client'
const { data } = await supabase.from('tasks').select('*')
```
