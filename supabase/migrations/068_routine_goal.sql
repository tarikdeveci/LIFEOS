-- 068: Rutin ve alışkanlık hedefe bağlanır.
-- task rutini: üretilen her görev örneği goal_id'yi taşır, görev ilerlemesi gibi sayılır.
-- habit: tamamlama günleri hedefin periyodunda ilerlemeye sayılır (shared utils/goals.ts).
-- block rutini bağlanmaz: blok görevsiz, ilerleme kaynağı yok.

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_routines_goal ON routines(goal_id) WHERE goal_id IS NOT NULL;

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_goal_kind;
ALTER TABLE routines
  ADD CONSTRAINT routines_goal_kind CHECK (goal_id IS NULL OR kind IN ('task', 'habit'));

-- Rutin başkasının hedefine bağlanamaz (059'daki görev denetimiyle aynı fonksiyon:
-- NEW.goal_id ve NEW.user_id iki tabloda da var).
DROP TRIGGER IF EXISTS routines_goal_owner ON routines;
CREATE TRIGGER routines_goal_owner
  BEFORE INSERT OR UPDATE OF goal_id ON routines
  FOR EACH ROW EXECUTE FUNCTION check_task_goal_owner();

-- Üretici: 054 ile aynı, görev örneğine goal_id eklendi.
CREATE OR REPLACE FUNCTION public.materialize_routines(p_user UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_blocks INTEGER := 0;
  v_tasks INTEGER := 0;
  v_task_blocks INTEGER := 0;
BEGIN
  -- block: saatli blok
  INSERT INTO time_blocks (user_id, date, start_time, end_time, block_type, label, color,
                           routine_id, occurrence_date)
  SELECT r.user_id, o.occurrence_date, r.start_time, r.end_time, r.block_type, r.title, r.color,
         r.id, o.occurrence_date
  FROM public.routine_occurrence_days(p_user) o
  JOIN routines r ON r.id = o.routine_id
  WHERE r.kind = 'block'
  ON CONFLICT (routine_id, occurrence_date) WHERE routine_id IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_blocks = ROW_COUNT;

  -- task: o güne planlanmış görev
  INSERT INTO tasks (user_id, title, status, scheduled_date, estimated_minutes,
                     value_score, urgency_score, risk_score, effort_score, friction_score,
                     is_time_blocked, routine_id, occurrence_date, goal_id)
  SELECT r.user_id, r.title, 'planned', o.occurrence_date, r.estimated_minutes,
         r.value_score, r.urgency_score, r.risk_score, r.effort_score, r.friction_score,
         r.start_time IS NOT NULL, r.id, o.occurrence_date, r.goal_id
  FROM public.routine_occurrence_days(p_user) o
  JOIN routines r ON r.id = o.routine_id
  WHERE r.kind = 'task'
  ON CONFLICT (routine_id, occurrence_date) WHERE routine_id IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_tasks = ROW_COUNT;

  -- task + saat: göreve bağlı blok. Görev silinmiş (istisna) günlerde üretilmez.
  INSERT INTO time_blocks (user_id, task_id, date, start_time, end_time, block_type, label, color,
                           routine_id, occurrence_date)
  SELECT r.user_id, t.id, o.occurrence_date, r.start_time, r.end_time, 'task', r.title, r.color,
         r.id, o.occurrence_date
  FROM public.routine_occurrence_days(p_user) o
  JOIN routines r ON r.id = o.routine_id
  JOIN tasks t ON t.routine_id = r.id AND t.occurrence_date = o.occurrence_date
  WHERE r.kind = 'task' AND r.start_time IS NOT NULL
  ON CONFLICT (routine_id, occurrence_date) WHERE routine_id IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_task_blocks = ROW_COUNT;

  RETURN v_blocks + v_tasks + v_task_blocks;
END;
$$;

-- Bağ sonradan kurulur ya da değişirse henüz açık olan bugün ve sonraki örnekler izler;
-- geçmiş ve tamamlanmış örnekler olduğu gibi kalır (geçmiş ilerleme kaymasın).
CREATE OR REPLACE FUNCTION public.sync_routine_goal()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE tasks SET goal_id = NEW.goal_id
  WHERE routine_id = NEW.id
    AND status <> 'done'
    AND occurrence_date >= (now() AT TIME ZONE public.user_timezone(NEW.user_id))::date
    AND goal_id IS DISTINCT FROM NEW.goal_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS routines_goal_sync ON routines;
CREATE TRIGGER routines_goal_sync
  AFTER UPDATE OF goal_id ON routines
  FOR EACH ROW WHEN (OLD.goal_id IS DISTINCT FROM NEW.goal_id)
  EXECUTE FUNCTION sync_routine_goal();
