# LifeOS — Servis Kurulum Rehberi

> Bu rehber, LifeOS'u çalıştırmak için ihtiyaç duyulan tüm dış servislerin adım adım kurulumunu açıklar.  
> Sırayla takip et — her adım bir sonraki için gerekli.

---

## Gerekli Servisler

| Servis | Kullanım | Ücretsiz Plan |
|--------|---------|--------------|
| **Supabase** | Veritabanı, Auth, Realtime, Edge Functions | ✅ 500MB DB, 2 proje |
| **Anthropic** | Claude AI (öğün parse, AI öneriler) | ✅ $5 başlangıç kredisi |
| **Expo** | Mobil build + push bildirimleri | ✅ Sınırsız (EAS'de limit var) |

---

## ADIM 1 — Supabase Kurulumu

### 1.1 Hesap Aç

1. [supabase.com](https://supabase.com) → **Start your project** → GitHub ile giriş yap

### 1.2 Yeni Proje Oluştur

1. Dashboard'da **New project** → Organization seç (veya kişisel)
2. Doldur:
   - **Name:** `lifeos` (ya da istediğin bir isim)
   - **Database Password:** Güçlü bir şifre oluştur, **kaydet** (bir daha göremezsin)
   - **Region:** `West EU (Ireland)` — Türkiye için en yakın
3. **Create new project** — ~2 dakika bekle

### 1.3 API Anahtarlarını Al

Proje oluştuktan sonra **Settings → API** sayfasına git:

```
Project URL:        https://xxxxxxxxxxxx.supabase.co
anon public key:    eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
service_role key:   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> ⚠️ `service_role` anahtarı tüm RLS'yi bypass eder. Asla client'a expose etme.

### 1.4 Supabase CLI Kur ve Login Ol

```bash
# Supabase CLI zaten package.json'da devDependency olarak tanımlı
# Ama global kurulum daha kolay:
npm install -g supabase

# Login ol:
supabase login
# Tarayıcı açılır, GitHub ile giriş yap
```

### 1.5 Yerel Projeyi Remote'a Bağla

```bash
cd C:/Users/Lenovo/Desktop/uygulamalar/LIFEOS

# Proje ID'ni öğren: supabase.com/dashboard/project/xxxxxxxxxxxx
# xxxxxxxxxxxx kısmı proje ID'dir (URL'den kopyala)
supabase link --project-ref xxxxxxxxxxxx
# Şifreyi sorarsa 1.2'de oluşturduğun DB şifresini yaz
```

### 1.6 Env Dosyasını Doldur

Proje kökündeki `.env` dosyasını aç:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...   # anon public key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...       # service_role key

# Anthropic — ADIM 2'den sonra doldur
ANTHROPIC_API_KEY=sk-ant-...

# Expo — ADIM 3'ten sonra doldur (şimdilik boş bırak)
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...   # anon public key ile aynı
```

### 1.7 Veritabanı Migrasyonlarını Uygula

```bash
cd C:/Users/Lenovo/Desktop/uygulamalar/LIFEOS

# İki migration dosyasını push et:
# - supabase/migrations/001_core_schema.sql (user_profiles, tasks, task_details, time_blocks, daily_plans)
# - supabase/migrations/002_nutrition_schema.sql (nutrition_targets, meals, food_items)
pnpm db:migrate
```

Başarılıysa Supabase Dashboard → **Table Editor**'da 8 tablo görürsün.

### 1.8 Seed Verisini Yükle

```bash
# 96 Türk yiyeceğini food_items tablosuna yükler
pnpm db:reset
```

> ⚠️ `db:reset` önce tüm tabloları sıfırlar, sonra migration + seed çalıştırır.  
> Eğer sadece seed yüklemek istersen:

```bash
supabase db execute --file supabase/seed.sql
```

### 1.9 Realtime'ı Etkinleştir

Supabase Dashboard → **Database → Replication** sayfasına git:

"Source" altında şu tabloların yanındaki toggle'ı **aktif** et:
- `tasks`
- `time_blocks`
- `daily_plans`
- `meals`

### 1.10 Authentication Ayarları

Supabase Dashboard → **Authentication → Providers**:

- **Email** — varsayılan açık, bırak
- **Confirm email** — başlangıçta kapatabilirsin (geliştirme kolaylığı için)

Dashboard → **Authentication → URL Configuration**:
```
Site URL:              http://localhost:3000
Redirect URLs:         http://localhost:3000/**
```

Production'a geçince burayı gerçek domain ile güncelle.

---

## ADIM 2 — Anthropic API Kurulumu

### 2.1 Hesap Aç

1. [console.anthropic.com](https://console.anthropic.com) → **Sign up**
2. Email ile doğrula

### 2.2 API Anahtarı Oluştur

1. Sol menü → **API Keys** → **Create Key**
2. İsim ver: `lifeos-edge-functions`
3. Anahtarı kopyala: `sk-ant-api03-...`

> ⚠️ Anahtar sadece bir kez gösterilir. Hemen kaydet.

### 2.3 Env Dosyasına Ekle

`.env` dosyasında:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### 2.4 Edge Function'lara Secret Olarak Ekle

Edge Functions bu anahtarı Supabase Vault üzerinden okur:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
```

Doğrulamak için:
```bash
supabase secrets list
# ANTHROPIC_API_KEY görmeli
```

### 2.5 Edge Function'ları Deploy Et

```bash
# Tüm fonksiyonları deploy et:
supabase functions deploy parse-meal
supabase functions deploy ai-suggest
supabase functions deploy send-notification
```

Başarılı deploy sonrası URL'ler:
```
https://xxxxxxxxxxxx.supabase.co/functions/v1/parse-meal
https://xxxxxxxxxxxx.supabase.co/functions/v1/ai-suggest
https://xxxxxxxxxxxx.supabase.co/functions/v1/send-notification
```

### 2.6 Kullanım ve Maliyet

Claude API kullanımı Edge Functions üzerinden çalışır:

| Fonksiyon | Model | Ne Zaman Çağrılır |
|-----------|-------|-------------------|
| `parse-meal` | `claude-opus-4-6` | Öğün eklerken, eşleşmeyen yiyecekler için |
| `ai-suggest` | `claude-opus-4-6` | "Günü planla" veya "Görevi puanla" butonunda |

Başlangıç kredisi ($5) ile yüzlerce AI çağrısı yapabilirsin. Limit aşılmadan önce Anthropic size email atar.

---

## ADIM 3 — Expo Kurulumu (Mobil)

### 3.1 Expo Hesabı Aç

1. [expo.dev](https://expo.dev) → **Create account**
2. Email ile kaydol

### 3.2 Expo CLI Kur

```bash
npm install -g @expo/eas-cli
eas login
# expo.dev hesabınla giriş yap
```

### 3.3 Projeyi Expo'ya Bağla

```bash
cd C:/Users/Lenovo/Desktop/uygulamalar/LIFEOS/apps/mobile

eas init
# Proje adı sorarsa: lifeos-mobile
# Bu komut app.json'a "extra.eas.projectId" ekler
```

### 3.4 Push Notification Kurulumu

Push bildirimleri otomatik çalışır — Expo'nun altyapısını kullanır.

**iOS için** (gerçek cihazda test gerekir):
```bash
eas credentials
# iOS → Push Notifications → oluştur
```

**Android için** — Firebase setup gerekir:
1. [console.firebase.google.com](https://console.firebase.google.com) → yeni proje → lifeos
2. **Project Settings → Cloud Messaging** → `google-services.json` indir
3. `apps/mobile/` klasörüne koy
4. `eas.json`'a ekle:
   ```json
   {
     "build": {
       "development": {
         "android": { "googleServicesFile": "./google-services.json" }
       }
     }
   }
   ```

### 3.5 Geliştirme için (Fiziksel Cihaz Gerekmez)

Başlangıçta push bildirim test etmeden uygulamayı çalıştırabilirsin:

```bash
cd C:/Users/Lenovo/Desktop/uygulamalar/LIFEOS
pnpm dev:mobile
# QR kod çıkar → Expo Go uygulamasıyla tara (Android/iOS)
```

> **Expo Go** → App Store veya Google Play'den ücretsiz indir

---

## ADIM 4 — TypeScript Tiplerini Güncelle

Supabase şeması değiştiğinde tipleri yenile:

```bash
cd C:/Users/Lenovo/Desktop/uygulamalar/LIFEOS
pnpm db:types
# packages/shared/src/types/database.ts otomatik güncellenir
```

---

## ADIM 5 — İlk Çalıştırma

Tüm adımlar tamamlandıktan sonra:

```bash
cd C:/Users/Lenovo/Desktop/uygulamalar/LIFEOS

# Web uygulaması:
pnpm dev:web
# → http://localhost:3000 aç

# Mobil (ayrı terminal):
pnpm dev:mobile
# → Expo Go ile QR tara
```

### İlk Kullanım Akışı

1. `http://localhost:3000/register` → hesap oluştur
2. Dashboard'a yönlendirilirsin
3. **Ayarlar** → makro hedeflerini gir
4. **Görevler** → ilk görevi ekle (WSJF skor ver)
5. **Beslenme** → "2 yumurta, tam buğday ekmek" yaz → AI parse eder

---

## Sorun Giderme

### "Invalid API key" hatası (Supabase)
- `.env` dosyasında boşluk veya tırnak işareti var mı kontrol et
- Anon key mi, service_role key mi kullandığını kontrol et
- `pnpm dev:web` i yeniden başlat

### "Edge function returned 500" (AI özellikleri)
```bash
# Edge function loglarını kontrol et:
supabase functions logs parse-meal --tail
# ANTHROPIC_API_KEY secret olarak set edilmiş mi kontrol et:
supabase secrets list
```

### Migration hatası
```bash
# Migration durumunu kontrol et:
supabase migration list
# Hatalı migration'ı düzelt ve tekrar dene:
pnpm db:migrate
```

### Realtime çalışmıyor
- Dashboard → Database → Replication → tabloları aktif et
- `RealtimeProvider` component'i dashboard layout'unda var mı kontrol et

### Mobil "Network request failed"
- `.env`'deki `EXPO_PUBLIC_SUPABASE_URL` doğru mu?
- Expo Go ve bilgisayar aynı WiFi'de mi?

---

## Ortam Değişkenleri Referansı

`.env` dosyasının tam yapısı (`.env.example`'ı kopyala):

```bash
# ── Supabase ──────────────────────────────────────────────
# Web tarafında kullanılır (Next.js)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# Sadece server-side / Edge Functions (açığa çıkarma!)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...

# ── Anthropic ─────────────────────────────────────────────
# Edge Functions üzerinden kullanılır (client'a expose edilmez)
ANTHROPIC_API_KEY=sk-ant-api03-...

# ── Expo (Mobil) ──────────────────────────────────────────
# Mobil uygulamada kullanılır
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

**Güvenlik kuralı:**
- `NEXT_PUBLIC_` ve `EXPO_PUBLIC_` önekli değişkenler client bundle'a dahil olur → sadece public key'leri buraya yaz
- `SUPABASE_SERVICE_ROLE_KEY` ve `ANTHROPIC_API_KEY` asla client'a gitmez → sadece server/edge'de kullan
- `.env` dosyasını **asla git'e commit etme** (`.gitignore`'da zaten var)

---

## Checklist

```
□ Supabase hesabı açıldı
□ Supabase projesi oluşturuldu (Region: West EU)
□ API anahtarları kopyalandı (URL, anon key, service_role)
□ supabase CLI kuruldu ve login olundu
□ supabase link ile proje bağlandı
□ .env dosyası dolduruldu
□ pnpm db:migrate çalıştırıldı (8 tablo oluştu)
□ pnpm db:reset çalıştırıldı (96 yiyecek yüklendi)
□ Realtime tablolar aktif edildi (Dashboard → Replication)
□ Auth → Confirm email kapatıldı (geliştirme için)
□ Auth → Redirect URL eklendi (http://localhost:3000/**)

□ Anthropic hesabı açıldı
□ API anahtarı oluşturuldu (sk-ant-...)
□ supabase secrets set ANTHROPIC_API_KEY=... çalıştırıldı
□ supabase functions deploy (3 fonksiyon) çalıştırıldı

□ Expo hesabı açıldı (isteğe bağlı, sadece mobil için)
□ eas login + eas init çalıştırıldı (isteğe bağlı)

□ pnpm dev:web → http://localhost:3000 açılıyor
□ /register ile hesap oluşturuldu
□ Dashboard görünüyor
```
