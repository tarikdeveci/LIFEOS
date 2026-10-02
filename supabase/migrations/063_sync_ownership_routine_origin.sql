-- 063: İnceleme düzeltmeleri (senkron sahipliği, rutin kökenli görevler)
-- 1) tasks.integration_id: görevi en son getiren bağlantı. integrations-sync yalnızca kendi
--    getirdiği görevi kapatır. Öncesinde aynı sağlayıcının ikinci bağlantısı, değiştirilen
--    Notion veritabanı ve Inbox API'sinin aynı source ile yazdığı görevler "kaynakta yok"
--    sayılıp tamamlanıyordu.
-- 2) roll_over_tasks: rutin kökeni routine_id yerine occurrence_date ile tanınır. Seri
--    silinince routine_id NULL olur (FK SET NULL) ve geçmişte kalmış bitmemiş rutin görevleri
--    toplu halde bugüne devrediyordu. occurrence_date seri silinse de satırda kalır.
-- 3) mark_task_routine_modified: puan, son tarih, etiket ve hedef değişikliği de "sadece bu"
--    sayılır. Öncesinde seri güncellenince bu görev silinip şablon değerleriyle yeniden
--    üretiliyor, kullanıcının düzenlemesi kayboluyordu.

-- ============================================================
-- 1. Senkron sahipliği
-- ============================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_integration ON tasks(integration_id) WHERE integration_id IS NOT NULL;

-- ============================================================
-- 2. Gün sonu devri: rutin kökenli görev devretmez
-- ============================================================
CREATE OR REPLACE FUNCTION public.roll_over_tasks()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH candidates AS (
    SELECT DISTINCT t.user_id
    FROM tasks t
    WHERE t.scheduled_date < CURRENT_DATE + 1
      AND t.status NOT IN ('done', 'deferred')
      AND t.occurrence_date IS NULL
  ),
  local AS (
    SELECT c.user_id, now() AT TIME ZONE public.user_timezone(c.user_id) AS local_now
    FROM candidates c
  )
  UPDATE tasks t
  SET scheduled_date = l.local_now::date,
      carry_count = LEAST(t.carry_count + 1, 32767)
  FROM local l
  WHERE t.user_id = l.user_id
    AND EXTRACT(HOUR FROM l.local_now) >= 3
    AND t.scheduled_date < l.local_now::date
    AND t.status NOT IN ('done', 'deferred')
    AND t.occurrence_date IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- 3. Rutin görev örneğinde kullanıcı düzenlemesi
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_task_routine_modified()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.title, NEW.description, NEW.scheduled_date, NEW.estimated_minutes, NEW.due_date, NEW.tags, NEW.goal_id,
      NEW.value_score, NEW.urgency_score, NEW.risk_score, NEW.effort_score, NEW.friction_score)
     IS DISTINCT FROM
     (OLD.title, OLD.description, OLD.scheduled_date, OLD.estimated_minutes, OLD.due_date, OLD.tags, OLD.goal_id,
      OLD.value_score, OLD.urgency_score, OLD.risk_score, OLD.effort_score, OLD.friction_score) THEN
    NEW.routine_modified := TRUE;
  END IF;
  RETURN NEW;
END;
$$;
