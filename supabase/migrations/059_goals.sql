-- 059_goals.sql
-- Hedef hiyerarşisi: çeyrek → ay → hafta. Görev bir hedefe bağlanabilir.
--
-- Haftalık hedefler eskiden tarayıcıda (localStorage `wgoals_<userId>`) duruyordu;
-- web ilk açılışta onları bu tabloya taşır. İlerleme saf hesaptır (shared
-- utils/goals.ts): haftalık hedefte etiket veya goal_id eşleşen tamamlanmış
-- görevler sayılır, ay ve çeyrekte alt hedeflerin ve bağlı görevlerin oranı.

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  horizon TEXT NOT NULL CHECK (horizon IN ('quarter', 'month', 'week')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  icon TEXT,
  period_start DATE NOT NULL,                      -- çeyreğin, ayın veya haftanın (Pazartesi) ilk günü
  target NUMERIC CHECK (target IS NULL OR target > 0),
  unit TEXT,
  count_mode TEXT CHECK (count_mode IN ('tasks', 'hours')),
  tag_filter TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'dropped')),
  review_note TEXT CHECK (review_note IS NULL OR char_length(review_note) <= 2000),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT goals_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id),
  -- Haftalık hedef sayılabilir olmalı: hedef ve sayım biçimi birlikte gelir.
  CONSTRAINT goals_target_pair CHECK ((target IS NULL) = (count_mode IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_goals_user_period ON goals(user_id, horizon, period_start);
CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_id) WHERE parent_id IS NOT NULL;

CREATE TRIGGER update_goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goals_own" ON goals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Üst hedef aynı kullanıcının ve daha geniş ufukta olmalı (hafta → ay → çeyrek).
-- Politika içinde goals'a alt sorgu RLS özyinelemesine düşer; kontrol tetikleyicide.
CREATE OR REPLACE FUNCTION check_goal_parent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_horizon TEXT;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT horizon INTO parent_horizon FROM goals WHERE id = NEW.parent_id AND user_id = NEW.user_id;
  IF parent_horizon IS NULL THEN
    RAISE EXCEPTION 'parent_id kullanıcıya ait değil' USING ERRCODE = '42501';
  END IF;
  IF NOT ((NEW.horizon = 'week' AND parent_horizon = 'month')
       OR (NEW.horizon = 'month' AND parent_horizon = 'quarter')) THEN
    RAISE EXCEPTION 'üst hedef bir üst ufukta olmalı' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS goals_parent_check ON goals;
CREATE TRIGGER goals_parent_check
  BEFORE INSERT OR UPDATE OF parent_id, horizon ON goals
  FOR EACH ROW EXECUTE FUNCTION check_goal_parent();

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_goal ON tasks(goal_id) WHERE goal_id IS NOT NULL;

-- Görev başkasının hedefine bağlanamaz. tasks RLS'i satırın sahibini denetler
-- ama goal_id'nin kime ait olduğunu bilmez; bu tetikleyici o boşluğu kapatır.
CREATE OR REPLACE FUNCTION check_task_goal_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.goal_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM goals g WHERE g.id = NEW.goal_id AND g.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'goal_id kullanıcıya ait değil' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_goal_owner ON tasks;
CREATE TRIGGER tasks_goal_owner
  BEFORE INSERT OR UPDATE OF goal_id ON tasks
  FOR EACH ROW EXECUTE FUNCTION check_task_goal_owner();
