# supabase/ — Claude Code Context

## Bu Nedir?
LifeOS Supabase backend yapılandırması: migrations, edge functions, seed data.

## Klasör Yapısı
```
supabase/
  config.toml           → Local dev ayarları
  migrations/
    001_core_schema.sql  → user_profiles, tasks, task_details, time_blocks, daily_plans
    002_nutrition_schema.sql → nutrition_targets, meals, food_items
  functions/
    parse-meal/          → AI ile öğün parse (Claude API)
    daily-digest/        → Sabah/öğlen/akşam bildirimleri (saat başı cron)
    event-notifications/ → Yaklaşan time_block hatırlatıcısı (5dk cron)
    ai-suggest/          → Görev önceliklendirme + günlük plan AI önerileri
  seed.sql              → Türk mutfağı yiyecek veritabanı (60+ yiyecek)
```

## Migration Kuralları
- Her migration dosyası sıralı numaralandırılır: 001_, 002_, ...
- Yeni tablo ekleme → yeni migration dosyası
- RLS politikası her tabloda zorunlu
- GENERATED ALWAYS AS STORED → WSJF priority_score
- updated_at trigger → `update_updated_at()` fonksiyonu

## Edge Functions
- Deno runtime (TypeScript)
- `npm:@anthropic-ai/sdk` ile Claude API
- CORS headers her function'da ekli
- Service role key → cron'dan tetiklenenler: daily-digest, event-notifications
- Anon key + auth header → parse-meal, ai-suggest
- Push token DAİMA `push_tokens` tablosundan okunur (detay: kök CLAUDE.md)

## Ortam Değişkenleri (Edge Functions)
```
SUPABASE_URL          → Otomatik sağlanır
SUPABASE_ANON_KEY     → Otomatik sağlanır
SUPABASE_SERVICE_ROLE_KEY → Dashboard'dan set et
ANTHROPIC_API_KEY     → Dashboard'dan set et
```
