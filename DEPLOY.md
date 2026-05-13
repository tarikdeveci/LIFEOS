# LifeOS — Deploy Rehberi
**Domain:** lifeos.tr

---

## 🚨 ADIM 0 — Key Döndür (Önce Bunu Yap)

Eski `.env` dosyasındaki key'ler açıkta kaldıysa döndür:

1. **Supabase** → lifeos projene gir → Project Settings → API → "Reset keys" 
2. **Anthropic** → console.anthropic.com → API Keys → mevcut key'i sil → yeni oluştur

---

## ADIM 1 — Supabase Kurulumu

### 1a. Supabase CLI Kur

```bash
npm install -g supabase
supabase login
```

### 1b. Projeyi Bağla

Supabase dashboard'dan Project Reference ID'yi al (URL'de: `supabase.com/dashboard/project/XXXX`)

```bash
cd C:\Users\Lenovo\Desktop\uygulamalar\LIFEOS
supabase link --project-ref PROJE_ID_BURAYA
```

### 1c. Migration'ları Uygula

```bash
pnpm db:migrate
```

✅ 13 migration çalışmalı (001 → 013_subscriptions)

### 1d. Seed Data Yükle (Türk yiyecekleri)

```bash
pnpm db:reset
```

> ⚠️ db:reset mevcut datayı siler. Temiz kurulumda çalıştır.

---

## ADIM 2 — Supabase Dashboard Ayarları

### 2a. Auth Redirect URL'leri

Supabase Dashboard → Authentication → URL Configuration:

- **Site URL:** `https://lifeos.tr`
- **Redirect URLs:** şunları ekle:
  ```
  https://lifeos.tr
  https://www.lifeos.tr
  http://localhost:3000
  lifeos://
  ```

### 2b. Edge Function Secrets

Supabase Dashboard → Settings → Edge Functions:

```
ANTHROPIC_API_KEY = sk-ant-...  (yeni aldığın key)
```

(SUPABASE_URL ve SUPABASE_ANON_KEY zaten otomatik inject ediliyor)

### 2c. Edge Functions Deploy

```bash
supabase functions deploy ai-suggest
supabase functions deploy parse-meal
supabase functions deploy send-notification
```

---

## ADIM 3 — Vercel Deploy

### 3a. Vercel Hesabı

vercel.com → Sign up (GitHub ile)

### 3b. Repo Bağla

- Vercel dashboard → "Add New Project"
- GitHub repo'nu seç
- **Root Directory:** `apps/web` olarak ayarla
- **Framework:** Next.js (otomatik algılar)

### 3c. Environment Variables

Vercel → Project Settings → Environment Variables → şunları ekle:

```
NEXT_PUBLIC_SUPABASE_URL        = https://PROJE_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   = eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY       = eyJhbGci...
NEXT_PUBLIC_APP_URL             = https://lifeos.tr
IYZICO_API_KEY                  = sandbox-...    (şimdilik sandbox)
IYZICO_SECRET_KEY               = sandbox-...    (şimdilik sandbox)
```

### 3d. Deploy Et

```bash
# Ya da Vercel dashboard'dan "Deploy" butonuna bas
vercel --prod
```

### 3e. Domain Bağla

Vercel → Project → Settings → Domains → `lifeos.tr` ekle

Vercel sana DNS kayıtları verecek. Domain sağlayıcında (kim sattıysa) şunları ekle:
```
Type: A     Name: @    Value: 76.76.21.21
Type: CNAME Name: www  Value: cname.vercel-dns.com
```

---

## ADIM 4 — İyzico Kurulumu

### 4a. Sandbox Hesabı

1. sandbox.iyzipay.com'a git
2. "Üye Ol" → bilgileri doldur
3. Dashboard → API Keys → API Key ve Secret Key'i kopyala

### 4b. Vercel'e Ekle

Vercel → Environment Variables'ı güncelle:
```
IYZICO_API_KEY    = sandbox-BURAYA
IYZICO_SECRET_KEY = sandbox-BURAYA
```

Vercel → Redeploy yap (settings değişince otomatik yapmaz)

### 4c. Test Ödemesi

Pro plan sayfasına git → Aylık Başla → İyzico form açılmalı

**Sandbox test kartı:**
```
Kart No:  5528790000000008
Son Kullanma: 12/30
CVV: 123
Ad: Test User
```

### 4d. Production'a Geç (Her şey çalışınca)

1. iyzipay.com'da merchant başvurusu yap (birkaç gün sürer)
2. Onaylanınca production key'leri al
3. Vercel'de `IYZICO_API_KEY` ve `IYZICO_SECRET_KEY`'i güncelle → redeploy

---

## ADIM 5 — Kontrol Listesi

Deploy sonrası bunları test et:

- [ ] `https://lifeos.tr` açılıyor (landing page)
- [ ] Kayıt ol → email geldi mi?
- [ ] Giriş yap → dashboard açılıyor
- [ ] Görev ekle → kaydediliyor
- [ ] Öğün ekle → AI parse çalışıyor
- [ ] AI plan önerisi → çalışıyor
- [ ] Pro plan butonuna bas → İyzico formu açılıyor
- [ ] Test kartıyla ödeme → başarılı
- [ ] Ödeme sonrası Pro badge görünüyor
- [ ] `https://lifeos.tr/robots.txt` açılıyor
- [ ] `https://lifeos.tr/sitemap.xml` açılıyor

---

## Sorun Giderme

**Edge function çalışmıyor:**
```bash
supabase functions logs ai-suggest
```

**Migration hata verdi:**
```bash
supabase db push --dry-run  # önce ne yapacağını göster
supabase db push
```

**Vercel build hatası:**
- Vercel dashboard → Deployments → hatalı deployment → Logs

**Supabase auth redirect çalışmıyor:**
- Dashboard → Auth → URL Configuration'ı tekrar kontrol et
- `lifeos.tr` ve `www.lifeos.tr` ikisi de ekli olmalı
