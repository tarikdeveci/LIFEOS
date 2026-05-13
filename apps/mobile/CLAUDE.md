# apps/mobile — Claude Code Context

## Bu Nedir?
LifeOS Expo (React Native) mobil uygulaması.

## Klasör Yapısı
```
app/
  _layout.tsx           → Root layout (auth state listener)
  (auth)/
    _layout.tsx         → Auth stack navigation
    login.tsx           → Login ekranı
    register.tsx        → Kayıt ekranı
  (tabs)/
    _layout.tsx         → Tab navigation (4 tab)
    today.tsx           → Ana ekran (bugünün planı)
    tasks.tsx           → Görev listesi
    nutrition.tsx       → Beslenme takibi
    profile.tsx         → Profil & ayarlar
  task/
    [id].tsx            → Görev detay modal
src/
  components/           → Reusable components
  hooks/                → Mobile-specific hooks
  lib/
    supabase.ts         → Supabase client (SecureStore adapter)
  notifications/
    setup.ts            → Push notification setup
global.css             → NativeWind global styles
```

## Önemli Kurallar
- Supabase client → `src/lib/supabase.ts` (SecureStore ile token)
- Auth state → `_layout.tsx` içindeki `onAuthStateChange` listener
- Push notifications → `src/notifications/setup.ts`
- NativeWind class'ları → `className` prop ile
- Navigation → Expo Router (file-based routing)
- Path alias: `@/` → proje kökü

## Store Kullanımı
```typescript
import { useTaskStore, usePlanningStore, useNutritionStore } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'

const { tasks, fetchTasks } = useTaskStore()
// userId'yi supabase.auth.getUser() ile al
```
