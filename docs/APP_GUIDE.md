# LifeOS — Uygulama Kullanım Rehberi

> Kişisel yaşam işletim sistemi: Görevler + Planlama + Beslenme

---

## Ekranlar ve Ne İşe Yarar

### 1. Dashboard (`/dashboard`)

Ana sayfa. Günün özet görünümü. 3 bölüm:

| Bölüm | İçerik |
|-------|--------|
| **Sol — Zaman Blokları** | Bugünün zaman blokları (kompakt liste). Planlama sayfasına link |
| **Orta — Görevler** | Bugüne atanan görevler + tamamlananlar. Hızlı görev ekleme (QuickTaskInput) |
| **Sağ — İstatistik** | Görev ilerleme, efor toplamı, enerji seviyesi, beslenme özeti |

**QuickTaskInput sözdizimi:**
```
Raporu hazırla #iş !3 @yarın >2026-05-01
```
- `#etiket` → görev etiketi (birden fazla olabilir)
- `!1-5` → efor skoru
- `@bugün` / `@yarın` / `@2026-04-20` → planlanma tarihi (scheduled_date)
- `>2026-04-20` → son tarih (due_date)

---

### 2. Görevler (`/dashboard/tasks`)

Tüm görevlerin yönetildiği ekran. **3 görünüm sekmesi:**

| Sekme | Açıklama |
|-------|---------|
| **Kanban** | Durum sütunları: Backlog → Planlandı → Devam → Bloke → Tamamlandı |
| **Liste** | Öncelik puanına göre sıralı düz liste |
| **Backlog** | Sadece henüz planlanmamış (backlog) görevler |

**Filtreleme:** Üstte durum dropdown + etiket filtreleri. "Tümünü temizle" ile sıfırla.

**Görev detayı:** Bir göreve tıklayınca sağdan drawer açılır:
- Başlık düzenleme
- WSJF puanı slider'ları (Değer, Aciliyet, Risk, Efor, Sürtünme)
- Checklist (ekle/sil/toggle)
- Durum değiştirme
- Silme

**WSJF Önceliklendirme:**
```
Öncelik = (Değer + Aciliyet + Risk) ÷ (Efor + Sürtünme)
```
Her parametre 1-5 arası. Yüksek puan = daha öncelikli.

---

### 3. Planlama (`/dashboard/planning`)

Günlük zaman planlamasının yapıldığı ekran. **2 bölüm:**

#### Sol — Timeline (Zaman Çizelgesi)
- 06:00–23:00 arası görsel zaman çizelgesi
- Mevcut zaman blokları renkli olarak gösterilir
- **Boş alana tıkla** → yeni blok ekleme modal'ı açılır
- **Bloğa tıkla** → blok detay modal'ı (bilgi + silme)
- Tarih navigasyonu: ← Dün | Bugün | Yarın →

#### Sağ — Panel
| Bileşen | Açıklama |
|---------|---------|
| **Enerji Seviyesi** | 1-5 emoji seçici. Günün enerji durumunu kaydet |
| **Günlük Efor** | Tüm görevlerin toplam efor puanı / 25 limit (progress bar) |
| **Esnek Görevler (FlexPool)** | Güne atanmış ama zaman bloğu verilmemiş görevler |
| **Taşan Görevler** | Önceki günlerden tamamlanmamış görevler (⚠️ uyarı) |

**Blok Tipleri:**
| Tip | Renk | Kullanım |
|-----|------|----------|
| 🎯 Odak (focus) | Mavi | Derin çalışma |
| ✅ Görev (task) | Yeşil | Belirli bir görev |
| 🔄 Rutin (routine) | Mor | Tekrarlayan aktiviteler |
| ☕ Mola (break) | Gri | Dinlenme |
| 🍽️ Yemek (meal) | Turuncu | Öğün |
| 🏋️ Egzersiz (workout) | Kırmızı | Spor |

**Esnek → Timeline akışı:**
Esnek görevlerin yanındaki **+** butonuna tıkla → görev timeline'a 09:00-10:00 varsayılan zaman bloğu olarak eklenir. Sonra bloğu tıklayıp düzenleyebilirsin.

---

### 4. Beslenme (`/dashboard/nutrition`)

Günlük beslenme takibi. **2 bölüm:**

#### Üst — Makro Dashboard
- Kalori progress bar (mevcut / hedef)
- 4 makro: Protein, Karbonhidrat, Yağ, Lif (gram + progress bar)
- Hedef yoksa varsayılan değerler kullanılır

#### Alt — Öğün Listesi
- Her öğün: tip ikonu + öğe listesi + toplam kalori
- **"Öğün Ekle"** butonu → MealAddModal açılır

**Öğün ekleme:**
1. Öğün tipi seç (Kahvaltı / Öğle / Akşam / Atıştırma)
2. Serbest metin gir: `"2 yumurta, 1 dilim tam buğday ekmek, çay"`
3. **AI ile Analiz Et** → Claude makroları hesaplar
4. Sonuçları incele, gerekirse düzenle
5. Kaydet

**Not:** AI parse Supabase Edge Function üzerinden çalışır. Supabase deploy edilmeden AI analiz çalışmaz, ama manuel değer girişi yapılabilir.

---

### 5. Ayarlar (`/dashboard/settings`)

| Sekme | İçerik |
|-------|--------|
| **Profil** | İsim, e-posta (salt okunur), saat dilimi |
| **Beslenme Hedefleri** | Günlük kalori, protein, karbonhidrat, yağ, lif hedefleri |
| **Tercihler** | Tema, sabah brifing saati, akşam özet saati, haftalık efor limiti |

---

## Görevler vs Planlama — Fark Nedir?

| | Görevler | Planlama |
|---|---------|----------|
| **Odak** | NE yapılacak | NE ZAMAN yapılacak |
| **Birimi** | Görev (task) | Zaman bloğu (time block) |
| **Zamanlama** | scheduled_date ile güne ata | start_time/end_time ile saate ata |
| **Görünüm** | Kanban/Liste/Backlog | Görsel timeline |
| **WSJF** | ✅ Öncelik puanı | ❌ Sadece zaman dilimi |

**Tipik akış:**
1. **Görevler sayfasında** → yeni görevler oluştur, WSJF puanla
2. **Planlama sayfasında** → esnek görevlerden seçip timeline'a at
3. **Dashboard'da** → günün özetini gör

---

## Mobil Uygulama

Expo (React Native) tabanlı. Çalıştırmak için:

```bash
# Proje kökünde
pnpm dev:mobile
```

Bu komutle Expo Dev Server başlar. Ardından:

| Yöntem | Nasıl |
|--------|-------|
| **Telefonda** | Expo Go uygulamasını indir (App Store / Play Store), QR kodu tara |
| **Android Emülatör** | Android Studio'da emülatör başlat, terminalde `a` tuşuna bas |
| **iOS Simulator** | (Mac gerekli) Terminalde `i` tuşuna bas |
| **Web preview** | Terminalde `w` tuşuna bas (sınırlı) |

**Not:** Mobilde web ile aynı Supabase backend kullanılır. `.env` dosyasındaki Supabase URL ve anon key hem web hem mobile geçerli.

---

## Hızlı Başlangıç

```bash
# 1. Bağımlılıkları kur
pnpm install

# 2. .env dosyasını oluştur (.env.example'dan kopyala)
cp .env.example .env.local
# Supabase URL + anon key doldur

# 3. Web'i başlat
pnpm dev:web

# 4. Tarayıcıda aç
# http://localhost:3000
```

**Supabase kurulumu (backend):**
```bash
# Supabase CLI ile local DB
supabase start

# Migration'ları çalıştır
pnpm db:migrate

# Seed data yükle (96 Türk yiyeceği)
pnpm db:reset

# TypeScript tiplerini generate et
pnpm db:types
```
