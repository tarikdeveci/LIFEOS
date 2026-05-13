-- supabase/migrations/001_core_schema.sql
-- LifeOS Core: kullanıcı profil, görevler, zaman blokları, günlük plan

-- ============================
-- Kullanıcı profili (Supabase Auth'a ek bilgiler)
-- ============================
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

-- ============================
-- Görev durumları enum
-- ============================
CREATE TYPE task_status AS ENUM (
  'backlog', 'planned', 'in_progress', 'blocked', 'done', 'deferred'
);

-- ============================
-- Ana görev tablosu
-- ============================
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

-- ============================
-- Görev detayları (zengin içerik)
-- ============================
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

-- ============================
-- Zaman blokları
-- ============================
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

-- ============================
-- Günlük plan
-- ============================
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

-- ============================
-- İndeksler
-- ============================
CREATE INDEX idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX idx_tasks_user_scheduled ON tasks(user_id, scheduled_date);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX idx_tasks_priority ON tasks(user_id, priority_score DESC);
CREATE INDEX idx_time_blocks_user_date ON time_blocks(user_id, date);
CREATE INDEX idx_daily_plans_user_date ON daily_plans(user_id, date);

-- ============================
-- RLS Politikaları
-- ============================
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

-- ============================
-- Updated_at trigger
-- ============================
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

-- ============================
-- Kullanıcı kayıt tetikleyicisi
-- Auth signup sonrası otomatik user_profiles kaydı oluşturur
-- ============================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name, timezone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'timezone', 'Europe/Istanbul')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================
-- Realtime aktif et
-- ============================
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE time_blocks;
ALTER PUBLICATION supabase_realtime ADD TABLE daily_plans;
