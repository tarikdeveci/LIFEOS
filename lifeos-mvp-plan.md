# LifeOS MVP — Implementation Plan

> Bu doküman LifeOS'un Faz 1 MVP'sinin teknik implementasyon rehberidir.
> Vibe coding aracına prompt olarak verilmek üzere hazırlanmıştır.
> Her adım bağımsız olarak çalıştırılabilir, sıralı ilerlenmelidir.

---

## Proje Özeti

LifeOS, görev yönetimi, zaman planlama, beslenme takibi ve AI destekli karar yardımını birleştiren kişisel bir yaşam işletim sistemidir. MVP kapsamında çekirdek görev motoru, hibrit günlük planlama, beslenme takibi ve bildirim sistemi yer alır.

### Tech Stack

- **Web:** Next.js 15 (App Router, TypeScript)
- **Mobil:** React Native / Expo (TypeScript)
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Edge Functions, Storage)
- **AI:** Claude API (Supabase Edge Functions üzerinden)
- **Monorepo:** Turborepo
- **State:** Zustand + Supabase Realtime subscriptions
- **Styling (Web):** Tailwind CSS
- **Styling (Mobil):** NativeWind (Tailwind for RN)

### Monorepo Yapısı

```
lifeos/
├── apps/
│   ├── web/                  # Next.js 15 (App Router)
│   └── mobile/               # Expo / React Native
├── packages/
│   ├── shared/               # TypeScript tipleri, Supabase client, utils
│   │   ├── src/
│   │   │   ├── types/        # Shared type definitions
│   │   │   ├── supabase/     # Supabase client & helpers
│   │   │   ├── utils/        # Shared utility functions
│   │   │   └── constants/    # App-wide constants
│   │   └── package.json
│   └── ui/                   # Paylaşılabilir UI logic (hooks, helpers)
├── supabase/
│   ├── migrations/           # SQL migration dosyaları
│   ├── functions/            # Edge Functions
│   └── seed.sql              # Test/dev seed data
├── turbo.json
├── package.json
└── .env.example
```

---

## ADIM 0: Proje Kurulumu

### 0.1 Turborepo + Supabase Init

```
Turborepo monorepo oluştur:
- apps/web → Next.js 15 (App Router, TypeScript, Tailwind CSS)
- apps/mobile → Expo (TypeScript, Expo Router, NativeWind)
- packages/shared → TypeScript kütüphanesi
- packages/ui → Paylaşılabilir UI hook'ları

Supabase projesi oluştur:
- supabase/ klasörü altında supabase init yap
- .env.example dosyasında SUPABASE_URL ve SUPABASE_ANON_KEY placeholder'ları olsun

Root package.json'da şu scriptler olsun:
- "dev:web" → web app dev server
- "dev:mobile" → expo start
- "dev" → turbo run dev (ikisi paralel)
- "db:migrate" → supabase db push
- "db:reset" → supabase db reset
```

### 0.2 Shared Package Setup

```
packages/shared içinde:

src/types/database.ts → Supabase'den generate edilecek tiplerin yeri
src/types/task.ts → Task, TaskStatus, TaskPriority, TaskDetail tipleri
src/types/nutrition.ts → Meal, MealItem, NutritionTarget, MacroSummary tipleri
src/types/planning.ts → TimeBlock, DailyPlan, BlockType tipleri
src/types/user.ts → UserProfile, UserPreferences tipleri

src/supabase/client.ts → createClient helper (web ve mobil farklı config ile)
src/constants/index.ts → Status renkleri, varsayılan değerler, efor ölçekleri

src/utils/priority.ts → WSJF skor hesaplama fonksiyonu:
  priorityScore = (value + urgency + risk) / (effort + friction)
  Tüm parametreler 1-5 arası, default 3

src/utils/nutrition.ts → Makro hesaplama helper'ları
src/utils/date.ts → Tarih formatlama, timezone helper'ları
```

---

## ADIM 1: Veritabanı Şeması

### 1.1 Core Migration

```sql
-- supabase/migrations/001_core_schema.sql

-- Kullanıcı profili (Supabase Auth'a ek bilgiler)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  timezone TEXT DEFAULT 'Europe/Istanbul',
  preferences JSONB DEFAULT '{
    "theme": "light",
    "morning_briefing_time": "08:00",
    "evening_summary_time": "21:00",
    "daily_effort_limit": 25,
    "week_start": "monday"
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Görev durumları enum
CREATE TYPE task_status AS ENUM (
  'backlog', 'planned', 'in_progress', 'blocked', 'done', 'deferred'
);

-- Ana görev tablosu
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  status task_status DEFAULT 'backlog',

  -- Önceliklendirme (WSJF parametreleri, 1-5 arası)
  value_score SMALLINT DEFAULT 3 CHECK (value_score BETWEEN 1 AND 5),
  urgency_score SMALLINT DEFAULT 3 CHECK (urgency_score BETWEEN 1 AND 5),
  risk_score SMALLINT DEFAULT 3 CHECK (risk_score BETWEEN 1 AND 5),
  effort_score SMALLINT DEFAULT 3 CHECK (effort_score BETWEEN 1 AND 5),
  friction_score SMALLINT DEFAULT 3 CHECK (friction_score BETWEEN 1 AND 5),
  priority_score NUMERIC GENERATED ALWAYS AS (
    (value_score + urgency_score + risk_score)::NUMERIC / NULLIF(effort_score + friction_score, 0)
  ) STORED,

  -- Planlama
  due_date DATE,
  scheduled_date DATE,
  estimated_minutes INTEGER,
  is_time_blocked BOOLEAN DEFAULT FALSE,

  -- Tekrarlama (Phase 3'te genişletilecek)
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT, -- RRULE format

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Görev detayları (zengin içerik)
CREATE TABLE task_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  notes TEXT, -- Zengin metin (markdown destekli)
  checklist JSONB DEFAULT '[]'::jsonb,
  -- checklist format: [{"id": "uuid", "text": "...", "checked": false}]
  attachments JSONB DEFAULT '[]'::jsonb,
  -- attachments format: [{"id": "uuid", "name": "...", "url": "...", "type": "..."}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Zaman blokları
CREATE TYPE block_type AS ENUM ('task', 'routine', 'break', 'focus', 'meal', 'workout');

CREATE TABLE time_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  block_type block_type DEFAULT 'task',
  label TEXT, -- Görev dışı bloklar için (ör: "Öğle yemeği", "Spor")
  color TEXT, -- Opsiyonel özel renk
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Günlük plan
CREATE TABLE daily_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  energy_level SMALLINT CHECK (energy_level BETWEEN 1 AND 5),
  notes TEXT,
  ai_suggestions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, date)
);

-- İndeksler
CREATE INDEX idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX idx_tasks_user_scheduled ON tasks(user_id, scheduled_date);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX idx_tasks_priority ON tasks(user_id, priority_score DESC);
CREATE INDEX idx_time_blocks_user_date ON time_blocks(user_id, date);
CREATE INDEX idx_daily_plans_user_date ON daily_plans(user_id, date);

-- RLS Politikaları
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own profile"
  ON user_profiles FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users can CRUD own tasks"
  ON tasks FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own task details"
  ON task_details FOR ALL
  USING (EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_details.task_id AND tasks.user_id = auth.uid()));

CREATE POLICY "Users can CRUD own time blocks"
  ON time_blocks FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own daily plans"
  ON daily_plans FOR ALL USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_task_details_updated_at
  BEFORE UPDATE ON task_details FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_time_blocks_updated_at
  BEFORE UPDATE ON time_blocks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_daily_plans_updated_at
  BEFORE UPDATE ON daily_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 1.2 Beslenme Migration

```sql
-- supabase/migrations/002_nutrition_schema.sql

-- Beslenme hedefleri
CREATE TABLE nutrition_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calories INTEGER NOT NULL DEFAULT 2500,
  protein_g INTEGER NOT NULL DEFAULT 150,
  carbs_g INTEGER NOT NULL DEFAULT 300,
  fat_g INTEGER NOT NULL DEFAULT 80,
  fiber_g INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN DEFAULT TRUE,
  -- Spor günü override
  workout_day_calories INTEGER,
  workout_day_protein_g INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, is_active) -- Tek aktif hedef
);

-- Öğün tipi
CREATE TYPE meal_type AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');

-- Öğün kaydı
CREATE TABLE meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type meal_type NOT NULL,
  raw_input TEXT, -- Kullanıcının yazdığı ham metin (AI parse için)

  -- Öğün detayları (AI veya manuel tarafından doldurulan)
  items JSONB DEFAULT '[]'::jsonb,
  -- items format: [{"name": "yumurta", "amount": 2, "unit": "adet",
  --   "calories": 155, "protein": 13, "carbs": 1.1, "fat": 11, "fiber": 0}]

  -- Toplam makro değerler (items'dan hesaplanan)
  total_calories INTEGER DEFAULT 0,
  total_protein NUMERIC(6,1) DEFAULT 0,
  total_carbs NUMERIC(6,1) DEFAULT 0,
  total_fat NUMERIC(6,1) DEFAULT 0,
  total_fiber NUMERIC(6,1) DEFAULT 0,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sık kullanılan yiyecekler (kişisel veritabanı)
CREATE TABLE food_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = global
  name TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}', -- Alternatif isimler: ["beyaz peynir", "peynir"]
  serving_size NUMERIC(8,1) NOT NULL DEFAULT 100,
  serving_unit TEXT NOT NULL DEFAULT 'g',
  calories INTEGER NOT NULL,
  protein NUMERIC(6,1) NOT NULL DEFAULT 0,
  carbs NUMERIC(6,1) NOT NULL DEFAULT 0,
  fat NUMERIC(6,1) NOT NULL DEFAULT 0,
  fiber NUMERIC(6,1) NOT NULL DEFAULT 0,
  category TEXT, -- "protein", "carb", "fat", "vegetable", "fruit", "dairy", "grain"
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- İndeksler
CREATE INDEX idx_meals_user_date ON meals(user_id, date);
CREATE INDEX idx_food_items_name ON food_items USING gin(to_tsvector('turkish', name));
CREATE INDEX idx_food_items_user ON food_items(user_id);

-- RLS
ALTER TABLE nutrition_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own nutrition targets"
  ON nutrition_targets FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own meals"
  ON meals FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can read global + own food items"
  ON food_items FOR SELECT
  USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users can CRUD own food items"
  ON food_items FOR ALL
  USING (user_id = auth.uid());

CREATE TRIGGER update_nutrition_targets_updated_at
  BEFORE UPDATE ON nutrition_targets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_meals_updated_at
  BEFORE UPDATE ON meals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 1.3 Temel Türk Mutfağı Seed Data

```sql
-- supabase/seed.sql (food_items tablosu için)

INSERT INTO food_items (name, aliases, serving_size, serving_unit, calories, protein, carbs, fat, fiber, category, is_verified) VALUES
-- Protein kaynakları
('Yumurta (haşlanmış)', ARRAY['yumurta','haslama yumurta'], 60, 'g', 78, 6.3, 0.6, 5.3, 0, 'protein', true),
('Yumurta (sahanda)', ARRAY['sahanda yumurta'], 60, 'g', 110, 6.3, 0.6, 8.5, 0, 'protein', true),
('Tavuk göğsü (pişmiş)', ARRAY['tavuk göğsü','tavuk','chicken breast'], 100, 'g', 165, 31, 0, 3.6, 0, 'protein', true),
('Tavuk but (pişmiş)', ARRAY['tavuk but'], 100, 'g', 209, 26, 0, 10.9, 0, 'protein', true),
('Kıyma (dana, pişmiş)', ARRAY['kıyma','dana kıyma'], 100, 'g', 250, 26, 0, 15, 0, 'protein', true),
('Köfte (ızgara)', ARRAY['köfte','izğara köfte'], 80, 'g', 200, 17, 4, 12, 0.5, 'protein', true),
('Balık (levrek, ızgara)', ARRAY['levrek','balık'], 100, 'g', 124, 24, 0, 2.6, 0, 'protein', true),
('Ton balığı (konserve)', ARRAY['ton balığı','tuna'], 100, 'g', 116, 26, 0, 0.8, 0, 'protein', true),

-- Süt ürünleri
('Beyaz peynir', ARRAY['peynir','white cheese'], 30, 'g', 80, 5.5, 0.5, 6.2, 0, 'dairy', true),
('Kaşar peyniri', ARRAY['kaşar','kasar'], 30, 'g', 110, 7.5, 0.3, 8.8, 0, 'dairy', true),
('Süt (tam yağlı)', ARRAY['süt'], 200, 'ml', 122, 6.4, 9.4, 6.4, 0, 'dairy', true),
('Yoğurt (tam yağlı)', ARRAY['yoğurt','yogurt'], 200, 'g', 122, 7, 9, 6.2, 0, 'dairy', true),
('Ayran', ARRAY['ayran'], 250, 'ml', 65, 4, 5.5, 2.8, 0, 'dairy', true),
('Lor peyniri', ARRAY['lor','lor peynir'], 100, 'g', 98, 12, 3.4, 4, 0, 'dairy', true),

-- Tahıllar & Ekmek
('Ekmek (beyaz, 1 dilim)', ARRAY['ekmek','beyaz ekmek'], 30, 'g', 79, 2.7, 14.7, 1, 0.6, 'grain', true),
('Tam buğday ekmeği (1 dilim)', ARRAY['tam buğday','tam buğday ekmek'], 30, 'g', 70, 3.5, 12, 1.1, 1.9, 'grain', true),
('Pilav (pirinç)', ARRAY['pilav','pirinç pilav','pirinç'], 150, 'g', 195, 3.5, 42, 1.5, 0.5, 'grain', true),
('Bulgur pilavı', ARRAY['bulgur','bulgur pilavı'], 150, 'g', 170, 5.5, 34, 1.5, 6.3, 'grain', true),
('Makarna (pişmiş)', ARRAY['makarna','pasta'], 200, 'g', 262, 9, 50, 1.6, 2.4, 'grain', true),
('Yulaf ezmesi (kuru)', ARRAY['yulaf','yulaf ezmesi','oat'], 40, 'g', 152, 5.3, 27, 2.7, 4, 'grain', true),

-- Sebzeler
('Domates', ARRAY['domates','tomato'], 100, 'g', 18, 0.9, 3.9, 0.2, 1.2, 'vegetable', true),
('Salatalık', ARRAY['salatalık','hıyar'], 100, 'g', 15, 0.7, 3.6, 0.1, 0.5, 'vegetable', true),
('Biber (sivri)', ARRAY['biber','sivri biber'], 100, 'g', 20, 0.9, 4.6, 0.2, 1.7, 'vegetable', true),
('Karışık salata', ARRAY['salata','mevsim salata'], 150, 'g', 30, 1.5, 5, 0.5, 2, 'vegetable', true),
('Mercimek çorbası', ARRAY['mercimek','mercimek çorba'], 250, 'ml', 180, 10, 28, 3, 6, 'vegetable', true),

-- Meyveler
('Muz', ARRAY['muz','banana'], 120, 'g', 107, 1.3, 27, 0.4, 3.1, 'fruit', true),
('Elma', ARRAY['elma','apple'], 150, 'g', 78, 0.4, 21, 0.2, 3.6, 'fruit', true),
('Portakal', ARRAY['portakal','orange'], 150, 'g', 70, 1.3, 17.5, 0.2, 3.6, 'fruit', true),

-- Yağlar & Kuruyemiş
('Zeytinyağı (1 yk)', ARRAY['zeytinyağı','zeytinyağ'], 14, 'ml', 119, 0, 0, 13.5, 0, 'fat', true),
('Tereyağı (1 yk)', ARRAY['tereyağı','tereyağ'], 14, 'g', 100, 0.1, 0, 11.4, 0, 'fat', true),
('Badem', ARRAY['badem','almond'], 30, 'g', 173, 6.3, 6, 15, 3.5, 'fat', true),
('Ceviz', ARRAY['ceviz','walnut'], 30, 'g', 196, 4.6, 4, 19.5, 2, 'fat', true),
('Fıstık ezmesi', ARRAY['fıstık ezmesi','peanut butter'], 30, 'g', 176, 7.6, 5.7, 14.4, 1.5, 'fat', true),

-- İçecekler
('Çay (şekersiz)', ARRAY['çay','tea'], 200, 'ml', 2, 0, 0.5, 0, 0, 'beverage', true),
('Türk kahvesi (şekersiz)', ARRAY['kahve','türk kahvesi','coffee'], 60, 'ml', 5, 0.3, 0.8, 0, 0, 'beverage', true),
('Protein shake', ARRAY['protein','whey','protein tozu'], 30, 'g', 120, 24, 3, 1.5, 0, 'protein', true),

-- Hazır yemekler (ortalama porsiyon)
('Kuru fasulye', ARRAY['kuru fasulye','fasulye'], 250, 'g', 290, 18, 40, 5, 12, 'vegetable', true),
('Nohut yemeği', ARRAY['nohut'], 250, 'g', 300, 15, 42, 7, 10, 'vegetable', true),
('İmam bayıldı', ARRAY['imam bayıldı','patlıcan'], 200, 'g', 180, 3, 15, 12, 4, 'vegetable', true),
('Lahmacun', ARRAY['lahmacun'], 120, 'g', 270, 12, 32, 10, 2, 'grain', true),
('Döner (tavuk)', ARRAY['tavuk döner','döner'], 200, 'g', 350, 28, 25, 15, 2, 'protein', true),
('Döner (et)', ARRAY['et döner'], 200, 'g', 420, 25, 25, 24, 2, 'protein', true);
```

---

## ADIM 2: Auth & Profil

### 2.1 Supabase Auth Konfigürasyonu

```
Supabase Dashboard'da:
- Email/Password auth aktif et
- Google OAuth provider ekle (opsiyonel ama önerilir)
- Redirect URL'leri ayarla: localhost:3000 (dev), app URL (prod)

packages/shared/src/supabase/client.ts:
- createBrowserClient() → Web için
- createMobileClient() → Expo SecureStore ile token storage
- Her iki client da aynı Supabase URL ve anon key kullanacak
```

### 2.2 Auth Sayfaları (Web)

```
apps/web/app/(auth)/login/page.tsx:
- Email + şifre ile giriş formu
- Google ile giriş butonu (opsiyonel)
- "Hesap oluştur" linki
- Başarılı girişte /dashboard'a redirect

apps/web/app/(auth)/register/page.tsx:
- Email, şifre, display name
- Kayıt sonrası otomatik user_profiles kaydı oluştur
- Timezone otomatik algıla (Intl.DateTimeFormat)

apps/web/middleware.ts:
- Auth kontrollü route koruması
- /dashboard ve altı → login gerekli
- /login, /register → auth varsa dashboard'a redirect
```

### 2.3 Auth Akışı (Mobil)

```
apps/mobile/app/(auth)/login.tsx:
- Email + şifre giriş ekranı
- Expo SecureStore ile token saklama
- Biometrics ile hızlı giriş (opsiyonel, Phase 3)

apps/mobile/app/(auth)/register.tsx:
- Kayıt formu (minimal)

Auth state management:
- Zustand store ile auth state
- Supabase onAuthStateChange listener
- App açılışında token kontrolü
```

---

## ADIM 3: Görev Motoru (Task Engine)

### 3.1 Supabase Query Katmanı

```
packages/shared/src/supabase/tasks.ts:

Fonksiyonlar:
- getTasks(userId, filters) → Filtreleme: status, scheduled_date, tags, parent_task_id
- getTaskById(taskId) → Task + task_details join
- createTask(task) → Yeni görev oluştur, otomatik task_details kaydı da oluştur
- updateTask(taskId, updates) → Kısmi güncelleme
- deleteTask(taskId) → Cascade ile alt görevler ve detaylar da silinir
- reorderTasks(taskIds) → sort_order güncelleme (drag-and-drop için)
- getSubtasks(parentTaskId) → Alt görevleri getir
- updateTaskStatus(taskId, newStatus) → Durum değişikliği + completed_at otomatik set/unset
- getTasksByDate(userId, date) → Belirli güne atanmış görevler (scheduled_date)
- getBacklogTasks(userId) → scheduled_date'i null olan tüm görevler, priority_score'a göre sıralı

Realtime subscription:
- subscribeToTasks(userId, callback) → tasks tablosundaki değişiklikleri dinle
```

### 3.2 Web — Görev Yönetimi Sayfaları

```
apps/web/app/dashboard/page.tsx (Ana Dashboard):
- Sol: Bugünün zaman çizelgesi (time blocks) — ADIM 4'te implement edilecek
- Orta: Bugüne atanmış görevler listesi (esnek havuz)
- Sağ: Hızlı istatistikler (tamamlanan, bekleyen, günün efor toplamı)
- Üst bar: Tarih navigasyonu (bugün, ileri, geri), hızlı görev ekleme (Cmd+K)

apps/web/app/dashboard/tasks/page.tsx (Tüm Görevler):
- Tab'lar: Kanban Board | Liste | Backlog
- Kanban: status'a göre sütunlar, drag-and-drop ile durum değişikliği
- Liste: Tablo görünümü, sıralama (priority_score, due_date, created_at)
- Backlog: Henüz planlanmamış görevler, priority_score'a göre sıralı

Görev Kartı Komponenti (TaskCard):
- Başlık, status badge (renk kodlu), efor puanı göstergesi (1-5 bar)
- Tag chip'leri
- Due date (varsa, geçmişse kırmızı)
- Tıklama → Görev detay drawer aç
- Sağ tık / üç nokta menü: Düzenle, Sil, Durumu Değiştir, Güne Ata

Görev Detay Drawer (TaskDetailDrawer):
- Sağ taraftan açılan panel (Sheet/Drawer)
- Başlık (editable inline)
- Açıklama (markdown editör — basit textarea + preview yeterli MVP için)
- Durum değişikliği dropdown
- WSJF parametreleri: 5 slider (Değer, Aciliyet, Risk, Efor, Sürtünme) → Hesaplanan skor göster
- Alt görevler listesi (ekle, sil, tamamla)
- Checklist (JSONB) — ekle, sil, check/uncheck
- Etiketler (tags) — ekle, sil
- Güne atama (date picker)
- Tahmini süre (dakika girişi)
- Oluşturulma/güncelleme tarihleri

Hızlı Görev Ekleme (QuickTaskInput):
- Cmd+K veya "+" butonu ile açılan modal/command palette
- Başlık yazıp Enter → backlog'a ekle
- Opsiyonel: "#tag" ile etiket, "!3" ile efor, "@yarın" ile tarih parsing
  (Bu MVP'de basit tutulabilir, sadece başlık yeterli)
```

### 3.3 Mobil — Görev Yönetimi

```
apps/mobile/app/(tabs)/tasks.tsx (Görev Listesi):
- Bugüne atanmış görevler (üstte, vurgulu)
- Tüm açık görevler (altta, priority_score sıralı)
- Pull-to-refresh
- Swipe right → Tamamla (done)
- Swipe left → Ertele (yarına at)
- FAB (Floating Action Button) → Hızlı görev ekleme

apps/mobile/app/task/[id].tsx (Görev Detay):
- Tam ekran görev detay sayfası
- Başlık, açıklama, durum, WSJF sliderları
- Alt görevler, checklist
- Etiketler, tarih, tahmini süre

Hızlı Ekleme Bottom Sheet:
- Başlık yazıp kaydet
- Opsiyonel tag seçimi
- Opsiyonel güne atama (bugün/yarın/tarih seç)
```

---

## ADIM 4: Zaman Planlama ve Günlük Plan

### 4.1 Query Katmanı

```
packages/shared/src/supabase/planning.ts:

- getTimeBlocks(userId, date) → Günün zaman blokları
- createTimeBlock(block) → Yeni blok oluştur
- updateTimeBlock(blockId, updates) → Güncelle (drag-and-drop resize/move)
- deleteTimeBlock(blockId) → Sil
- getDailyPlan(userId, date) → Günlük plan kaydı (yoksa oluştur)
- updateDailyPlan(planId, updates) → Enerji seviyesi, notlar güncelle
- getFlexTasks(userId, date) → scheduled_date = date VE is_time_blocked = false olan görevler
- assignTaskToDate(taskId, date) → Görevi güne ata
- getCarryoverTasks(userId) → Dünden kalan tamamlanmamış, scheduled_date geçmiş görevler
```

### 4.2 Web — Timeline Görünümü

```
apps/web/app/dashboard/page.tsx içinde veya
apps/web/components/planning/DayTimeline.tsx:

Timeline Komponenti:
- 06:00 — 23:00 arası saat blokları (yapılandırılabilir)
- Her saat 60px yükseklik (veya ayarlanabilir zoom)
- Mevcut time_blocks gösterilir, renk kodlu (block_type'a göre)
- Drag-and-drop: blokları yukarı/aşağı taşı (saat değiştir)
- Resize: blokun alt kenarını sürükle (süre değiştir)
- Boş alana tıkla → yeni blok oluştur veya mevcut görev ata
- Blok üzerine tıkla → detay popup (görev detayına git, düzenle, sil)

Flex Pool (Timeline yanında):
- Bugüne atanmış ama saate bağlı olmayan görevler
- Priority score sıralı liste
- Görevleri timeline'a sürükle → time block oluştur
- Efor toplamı göstergesi (günlük limit ile karşılaştırma)

Gün Başlangıç Briefingi:
- Dashboard açıldığında, daily_plan kaydı yoksa bir kart göster:
  "Günaydın! Bugün enerji seviyen nasıl?" (1-5 seçim)
  Dünden taşan görevler varsa listele
  "Bugün X görev planlandı, toplam efor: Y/Z"
```

### 4.3 Mobil — Günlük Plan Görünümü

```
apps/mobile/app/(tabs)/today.tsx:
- Üstte: Tarih, enerji seviyesi göstergesi
- Time blocks listesi (sadece atanmış bloklar, kronolojik)
- Flex pool (saat atanmamış görevler, aşağıda)
- Enerji seviyesi ayarlama (ilk açılışta soru)
- Görev tamamlama: tek dokunuş ile check

Bu ekran mobilde "home" tab olmalı — kullanıcı uygulamayı açtığında
ilk gördüğü ekran bugünün planı olmalı.
```

---

## ADIM 5: Beslenme Takibi

### 5.1 Query Katmanı

```
packages/shared/src/supabase/nutrition.ts:

- getMealsByDate(userId, date) → Günün öğünleri
- createMeal(meal) → Yeni öğün kaydı
- updateMeal(mealId, updates) → Öğün güncelle
- deleteMeal(mealId) → Sil
- getNutritionTarget(userId) → Aktif beslenme hedefi
- updateNutritionTarget(targetId, updates) → Hedef güncelle
- getDailySummary(userId, date) → Günün toplam kalori/makro özeti
  (meals tablosundan SUM ile hesapla)
- searchFoodItems(query, userId) → food_items tablosunda arama
  (önce kullanıcı özel, sonra global)
- createFoodItem(item) → Kullanıcının özel yiyecek kaydı
- getWeeklyNutritionSummary(userId, startDate) → 7 günlük trend verisi
```

### 5.2 Web — Beslenme Dashboard

```
apps/web/app/dashboard/nutrition/page.tsx:

Günlük Beslenme Görünümü:
- Üstte: Hedef vs gerçekleşen → progress bar'lar (kalori, protein, karb, yağ, lif)
- Her makro için renkli progress: yeşil (hedefe yakın), sarı (düşük), kırmızı (aşırı)
- Öğün kartları: Kahvaltı, Öğle, Akşam, Ara Öğün
- Her öğün kartında: yiyecek listesi, toplam kalori, ekleme butonu

Öğün Ekleme Modalı:
- Üstte: metin girişi alanı ("2 yumurta, 1 dilim ekmek, peynir" gibi serbest giriş)
- Öğün tipi seçimi (kahvaltı/öğle/akşam/ara)
- Parse Butonu → AI edge function'ı çağır → parse edilen items listesini göster
- Her item: yiyecek adı, miktar, kalori, protein, karb, yağ → düzenlenebilir
- Kaydet butonu

Haftalık Trend (basit):
- 7 günlük kalori grafiği (bar chart veya line)
- Hedef çizgisi overlay
- Protein ortalaması göstergesi
```

### 5.3 Mobil — Hızlı Öğün Girişi

```
apps/mobile/app/(tabs)/nutrition.tsx:

Günlük Özet Ekranı:
- Kalori progress ring (dairesel progress bar)
- Makro göstergeleri (protein/karb/yağ/lif → küçük bar'lar)
- Öğün listesi (tıklayınca detay)
- Alt buton: "Öğün Ekle"

Hızlı Giriş Bottom Sheet:
- Öğün tipi seçimi (ikonlu butonlar: kahvaltı/öğle/akşam/ara)
- Metin alanı: serbest giriş
- "AI ile Parse Et" butonu
- Parse sonucu: düzenlenebilir yiyecek listesi
- Kaydet

Bu ekran hızlı ve minimal olmalı — 30 saniyede öğün kaydı yapılabilmeli.
```

### 5.4 AI Beslenme Parse (Edge Function)

```
supabase/functions/parse-meal/index.ts:

Endpoint: POST /parse-meal
Body: { raw_input: string, user_id: string }

İşleyiş:
1. raw_input al ("2 yumurta, 1 dilim ekmek, beyaz peynir, çay")
2. Önce food_items tablosundan fuzzy match dene (basit kelime eşleşmesi)
3. Eşleşmeyen items için Claude API'ye gönder:

   System prompt:
   "Sen bir beslenme asistanısın. Kullanıcı Türk mutfağı ağırlıklı yemek giriyor.
   Verilen metin girişini parse ederek her yiyecek için tahmini besin değerlerini JSON olarak döndür.
   Porsiyon belirtilmemişse makul bir varsayılan porsiyon kullan.
   Sadece JSON döndür, başka bir şey yazma."

   User prompt:
   "Şu yemeklerin besin değerlerini hesapla: {raw_input}

   Yanıtı şu JSON formatında ver:
   [{"name": "yiyecek adı", "amount": sayı, "unit": "birim",
     "calories": sayı, "protein": sayı, "carbs": sayı, "fat": sayı, "fiber": sayı}]"

4. Claude yanıtını parse et
5. food_items tablosundan bulunan eşleşmeleri Claude tahmini yerine koy (daha doğru)
6. Sonucu döndür

Response: { items: MealItem[], matched_from_db: number, estimated_by_ai: number }
```

---

## ADIM 6: Bildirim Sistemi

### 6.1 Expo Push Notification Setup

```
apps/mobile/src/notifications/setup.ts:

1. expo-notifications ve expo-device import et
2. registerForPushNotificationsAsync():
   - Permission iste
   - Expo push token al
   - Token'ı Supabase'e kaydet (user_profiles.preferences.push_token)
3. Notification handler'ları ayarla:
   - Foreground notification gösterimi
   - Notification tıklama → ilgili sayfaya navigate

Supabase'de push token saklama:
- user_profiles tablosundaki preferences JSONB'ye push_token ekle
```

### 6.2 Bildirim Edge Function

```
supabase/functions/send-notification/index.ts:

Endpoint: POST /send-notification (internal, cron ile tetiklenir)

Bildirim tipleri:
- task_reminder: Görev hatırlatma (planlanan saatten 15dk önce)
- morning_briefing: Sabah özeti
- evening_nutrition: Akşam beslenme özeti

İşleyiş:
1. Supabase cron job (pg_cron veya external cron) her 5dk'da tetikler
2. time_blocks tablosundan yaklaşan blokları bul
3. İlgili kullanıcıların push_token'larını al
4. Expo Push API'ye gönder

Sabah briefingi (günlük):
- morning_briefing_time'da tetiklenir
- Bugünün görev sayısı, toplam efor, taşan görevler özeti
- Push notification olarak gönderilir

Akşam beslenme özeti:
- evening_summary_time'da tetiklenir
- Günün kalori/makro gerçekleşmesi vs hedef
```

### 6.3 Supabase Cron Ayarı

```sql
-- Supabase Dashboard > SQL Editor'da çalıştır
-- veya migration dosyasına ekle

-- pg_cron extension (Supabase'de varsayılan olarak mevcut)
SELECT cron.schedule(
  'check-task-reminders',
  '*/5 * * * *', -- Her 5 dakikada bir
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-notification',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{"type": "task_reminder"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'morning-briefing',
  '0 5 * * *', -- Her gün 05:00 UTC (08:00 TR) — kullanıcı timezone'a göre edge fn içinde filtrele
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-notification',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{"type": "morning_briefing"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'evening-nutrition-summary',
  '0 18 * * *', -- Her gün 18:00 UTC (21:00 TR)
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-notification',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{"type": "evening_nutrition"}'::jsonb
  );
  $$
);
```

---

## ADIM 7: Realtime Sync

### 7.1 Supabase Realtime Konfigürasyonu

```
packages/shared/src/supabase/realtime.ts:

Realtime subscription'lar:
- tasks tablosu: INSERT, UPDATE, DELETE → görev listesi güncelle
- time_blocks tablosu: INSERT, UPDATE, DELETE → timeline güncelle
- meals tablosu: INSERT, UPDATE, DELETE → beslenme özeti güncelle
- daily_plans tablosu: UPDATE → enerji seviyesi güncelle

Her subscription user_id filtrelemesi ile çalışmalı (RLS zaten korur ama
client-side filter de performans için ekle).

Kullanım:
- Web: useEffect içinde subscribe, cleanup'ta unsubscribe
- Mobil: Aynı mantık, AppState listener ile background'da unsubscribe
```

### 7.2 Zustand Store Yapısı

```
packages/shared/src/stores/taskStore.ts:
- tasks: Task[]
- loading: boolean
- fetchTasks(date?)
- addTask(task)
- updateTask(id, updates)
- deleteTask(id)
- reorderTasks(ids)
- handleRealtimeEvent(event) → INSERT/UPDATE/DELETE'e göre state güncelle

packages/shared/src/stores/planningStore.ts:
- timeBlocks: TimeBlock[]
- dailyPlan: DailyPlan | null
- flexTasks: Task[]
- fetchDayData(date)
- handleRealtimeEvent(event)

packages/shared/src/stores/nutritionStore.ts:
- meals: Meal[]
- target: NutritionTarget | null
- dailySummary: MacroSummary
- fetchDayNutrition(date)
- handleRealtimeEvent(event)

Bu store'lar hem web hem mobil tarafında aynı şekilde kullanılacak.
Supabase client farkı sadece initialization'da (browser vs SecureStore).
```

---

## ADIM 8: UI/UX Tasarım Prensipleri

### 8.1 Design System Temelleri

```
Renk Paleti:
- Primary: #1A1A2E (koyu lacivert — ana metin, header'lar)
- Accent: #4A90D9 (mavi — butonlar, linkler, aktif state)
- Success: #34A853 (yeşil — tamamlanan, hedefe ulaşılan)
- Warning: #F59E0B (sarı — dikkat, orta seviye)
- Danger: #EF4444 (kırmızı — hata, aşırı yük, gecikmiş)
- Muted: #6B7280 (gri — ikincil metin, placeholder)
- Background: #FAFBFC (açık gri — sayfa arka plan)
- Surface: #FFFFFF (beyaz — kart arka plan)

Status Renkleri (görev durumları):
- Backlog: #9CA3AF
- Planned: #4A90D9
- In Progress: #F59E0B
- Blocked: #EF4444
- Done: #34A853
- Deferred: #8B5CF6

Tipografi:
- Web: Inter font ailesi
- Mobil: System default (San Francisco / Roboto)
- Başlıklar: Semibold, body: Regular

Spacing: 4px grid (4, 8, 12, 16, 20, 24, 32, 48, 64)
Border Radius: 8px (kartlar), 6px (butonlar), 4px (input'lar)
Shadow: Minimal, sadece elevated kartlar ve modal'lar için
```

### 8.2 Navigasyon Yapısı

```
Web (Next.js App Router):
/dashboard              → Ana sayfa (bugünün planı)
/dashboard/tasks        → Tüm görevler (Kanban + Liste)
/dashboard/nutrition    → Beslenme takibi
/dashboard/settings     → Kullanıcı ayarları, hedefler

Sol sidebar navigasyon:
- Bugün (dashboard)
- Görevler (tasks)
- Beslenme (nutrition)
- Ayarlar (settings)
- Alt kısım: Kullanıcı avatarı, logout

Mobil (Expo Router, tab navigasyon):
/(tabs)/today          → Bugünün planı (HOME)
/(tabs)/tasks          → Görev listesi
/(tabs)/nutrition      → Beslenme takibi
/(tabs)/profile        → Profil & ayarlar

Tab bar: 4 tab, ikonlu, aktif tab vurgulu
```

---

## Geliştirme Sırası (Önerilen Akış)

Her adımı sırayla implement et. Bir adımı tamamlamadan sonrakine geçme.

```
1. ADIM 0 → Proje altyapısı, monorepo kurulumu
2. ADIM 1 → Veritabanı şeması, migration'lar, seed data
3. ADIM 2 → Auth (web + mobil)
4. ADIM 3 → Görev motoru (web öncelikli, sonra mobil)
5. ADIM 4 → Zaman planlama (web öncelikli, sonra mobil)
6. ADIM 5 → Beslenme takibi (web + mobil paralel)
7. ADIM 6 → Bildirim sistemi (mobil)
8. ADIM 7 → Realtime sync (web + mobil)
9. Son kontrol: Cross-platform test, edge case'ler, polish
```

---

## Önemli Notlar

- **Veri güvenliği:** Tüm tablolarda RLS aktif. Supabase anon key ile sadece kendi verisine erişim.
- **Error handling:** Her API çağrısında try-catch, kullanıcıya anlamlı hata mesajı göster.
- **Loading states:** Her veri çekme işleminde skeleton/spinner göster.
- **Optimistic updates:** Görev tamamlama, durum değişikliği gibi sık işlemlerde önce UI'ı güncelle, sonra API'yi çağır. Hata olursa geri al.
- **Responsive:** Web arayüz 1024px altında tek kolon layout'a geçmeli.
- **Dark mode:** MVP'de zorunlu değil ama CSS variable'lar ile hazırla, sonra eklemesi kolay olsun.
- **TypeScript:** Strict mode, any kullanma. Supabase CLI ile tip generate et.
- **Git:** Her adım sonunda commit. Anlamlı commit mesajları.

---

## ADIM 9: Test ve Kalite Güvencesi

### 9.1 Test Stratejisi (MVP Minimum)

```
Birim Test (packages/shared):
- utils/priority.ts → WSJF hesaplaması doğru mu?
- utils/nutrition.ts → makro toplamları doğru hesaplanıyor mu?
- utils/date.ts → timezone dönüşümleri beklenen sonucu veriyor mu?

Entegrasyon Test (web):
- Auth akışı: register → login → dashboard redirect
- Task CRUD: oluşturma, güncelleme, silme, status değiştirme
- Time block CRUD: timeline'a ekleme, güncelleme, silme
- Meal ekleme: manual + parse-meal edge function fallback

Manuel E2E smoke test (web + mobil):
- Aynı kullanıcı ile web ve mobilde giriş
- Web'de task ekle → mobilde realtime görünüyor mu?
- Mobilde meal ekle → web'de günlük makro özeti güncelleniyor mu?
- Bildirim zamanında geliyor mu?
```

### 9.2 Test Checklist (Release Öncesi)

```
Auth & Security:
[ ] RLS policy test: kullanıcı başkasının verisini okuyamıyor
[ ] Protected route test: login olmadan dashboard'a girilemiyor
[ ] Logout sonrası session temizleniyor

Task Engine:
[ ] WSJF skorları doğru sıralanıyor
[ ] Drag/drop veya status geçişleri hatasız
[ ] Task detail (note/checklist) kaydı korunuyor

Planning:
[ ] Time block overlap validasyonu çalışıyor
[ ] Flex pool görevleri doğru listeleniyor
[ ] Gün sonu summary hesaplaması doğru

Nutrition:
[ ] Günlük hedefler ayarlanabiliyor
[ ] Öğün ekleme/silme sonrası toplam makrolar anında güncelleniyor
[ ] Parse-meal edge function hata verdiğinde graceful fallback var

Cross-platform:
[ ] Web responsive (desktop/tablet)
[ ] Mobilde temel ekranlar (today/tasks/nutrition/profile) stabil
[ ] Realtime sync gecikmesi kabul edilebilir (<2sn)
```

---

## ADIM 10: Deploy ve Operasyon

### 10.1 Web Deploy (Vercel)

```
- apps/web projesini Vercel'e bağla
- Environment variables:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
- Preview deployment'ları aktif et (PR bazlı test için)
- Production domain + HTTPS kontrol et
```

### 10.2 Supabase Production Hazırlığı

```
- Production Supabase project oluştur
- Migration'ları sırayla uygula (supabase db push)
- Edge function deploy et:
  - parse-meal
  - ai-suggest
  - send-notification
- Secrets tanımla:
  - ANTHROPIC_API_KEY
  - EXPO_ACCESS_TOKEN
- pg_cron job'ların production schedule'ını doğrula
```

### 10.3 Mobil Build Dağıtımı (Expo EAS)

```
- EAS build profilleri hazırla (preview, production)
- Android internal testing build al
- iOS TestFlight build al
- Push notification permission flow'unu doğrula
```

---

## ADIM 11: MVP Sonrası Önceliklendirilmiş Backlog

### 11.1 Faz 2 Adayları (Öncelik Sırasıyla)

```
1. Haftalık planlama ekranı (week view + carry-over task logic)
2. Alışkanlık takibi (habit tracker + streaks)
3. AI coaching geliştirmeleri (daha kişiselleştirilmiş öneriler)
4. Gelişmiş raporlar (haftalık trendler, hedef uyumu)
5. Takvim entegrasyonu (Google Calendar / Apple Calendar)
6. Offline-first cache ve çakışma çözümü
```

### 11.2 Teknik Borç Listesi

```
- Shared UI component library'yi genişlet (web + mobil parity)
- Store test coverage artır
- Supabase query helper'larını domain bazlı modülerleştir
- Edge function observability (structured logs + error tracking)
- Feature flag altyapısı (A/B test ve kademeli rollout için)
```

---

## Kapanış: MVP Tamamlanma Kriteri

```
MVP "tamamlandı" sayılır, eğer:
1. Kullanıcı görev oluşturup önceliklendirebiliyor ve günlük planına yerleştirebiliyorsa
2. Kullanıcı öğün takibi yapıp günlük makro hedeflerini görebiliyorsa
3. Web ve mobil arasında temel veriler realtime senkronize oluyorsa
4. Bildirimler kritik anlarda (sabah/öğle/akşam) güvenilir şekilde çalışıyorsa
5. En az 1 haftalık gerçek kullanımda kritik bloklayıcı bug çıkmıyorsa
```
