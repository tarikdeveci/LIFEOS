# LifeOS — GitHub Copilot Instructions

## Proje
LifeOS: Kişisel yaşam işletim sistemi. Görev yönetimi + zaman planlaması + beslenme takibi + AI.

## Stack (değişmez)
- **Web**: Next.js 15 App Router, TypeScript strict, Tailwind CSS
- **Mobil**: Expo + Expo Router, NativeWind
- **Backend**: Supabase (Postgres + Auth + Realtime + Edge Functions)
- **AI**: Claude claude-opus-4-6 via @anthropic-ai/sdk (Supabase Edge Functions'dan)
- **State**: Zustand stores
- **Monorepo**: Turborepo + pnpm workspaces

## Paket Yapısı
- `@lifeos/shared` → types, supabase queries, zustand stores, utils
- `@lifeos/ui` → shared hooks/helpers
- `@lifeos/web` → Next.js 15
- `@lifeos/mobile` → Expo

## Kod Standartları
- TypeScript strict: `any` yok, dönüş tipleri explicit
- Named exports tercih, default sadece Next.js page/layout
- Her klasörde `index.ts` barrel export
- Async/await kullan, `.then()` zinciri yazma
- Supabase query'lerde: `if (error) throw error` pattern
- React: Server Components default, gerektiğinde `'use client'`
- Optimistic updates: UI önce güncellenir, sonra Supabase

## Veritabanı Conventions
- UUID primary keys (`gen_random_uuid()`)
- `created_at` + `updated_at TIMESTAMPTZ` her tabloda
- RLS her tabloda aktif, kullanıcı sadece kendi datasını görür
- JSONB için Typescript type guard yaz
- WSJF: `priority_score = (value + urgency + risk) / (effort + friction)`

## AI (Claude) Entegrasyonu
- Sadece Supabase Edge Functions'dan çağır (client-side değil)
- Model: `claude-opus-4-6` her zaman
- System prompt'u Türkçe yaz (uygulama Türkçe)
- Response'u parse et, DB'deki gerçek datayı AI tahminine tercih et

## İsimlendirme
- Dosya: `camelCase.ts` (utils) / `PascalCase.tsx` (components)
- DB tablo: `snake_case`
- TypeScript tip: `PascalCase`
- Zustand store: `useXxxStore` hook adı, `XxxState` tip adı
- Supabase fonksiyon: `verbNoun` (getTasks, createMeal, updateTimeBlock)

## Git & Checkpoint Kuralları
- **Her checkpoint'te `git add + commit + push` yapılır** — değişiklik birikmeden sık commit
- Commit mesajı formatı: `type: kısa açıklama` (feat/fix/refactor/docs/chore)
- Her checkpoint'te `docs/PROJECT_STATUS.md` güncellenir (yapılan değişiklik, tarih, durum)
- Push öncesi `pnpm typecheck` veya ilgili doğrulama çalıştırılır (mümkünse)

## Güvenlik Kuralları (OWASP Top 10)
- **API key'ler asla client-side'da olmamalı** — sadece `EXPO_PUBLIC_` ve `NEXT_PUBLIC_` prefix'li env var'lar client'a geçer
- Supabase RLS her tabloda zorunlu — bypass eden query yazma
- User input'u her zaman sanitize et (XSS, SQL injection koruması)
- Edge Functions'da rate limiting uygula
- CORS policy'leri kısıtlı tut (wildcard `*` kullanma)
- JWT token'ları localStorage'da tutma, httpOnly cookie tercih et (web)
- Hassas veri (şifre, token) asla log'a yazılmaz
- Dependency'lerde bilinen güvenlik açıkları varsa hemen güncelle

## Kod Kalitesi Hedefleri
- **Performans**: Gereksiz re-render yok, memo/useMemo/useCallback doğru kullan
- **Stabilite**: Error boundary'ler, graceful degradation, retry logic
- **Temiz kod**: DRY prensibi, tek sorumluluk, okunabilir fonksiyon isimleri
- **Dokümantasyon**: Her checkpoint'te değişiklik özeti `docs/` altında tutulur
