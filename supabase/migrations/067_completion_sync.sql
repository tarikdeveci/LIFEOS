-- 067: Görev ve Zaman Bloğu Tamamlanma Senkronizasyonu
-- Bu migration, bir görev tamamlandığında ona bağlı zaman bloklarının,
-- bir zaman bloğu tamamlandığında ise bağlı olduğu görevin eşzamanlı
-- olarak güncellenmesini sağlar.
--
-- Çakışma Kontrolü:
-- 1. 065_daily_loop.sql'deki tasks_routine_progress ve time_blocks_routine_progress
--    tetikleyicileri ile çakışmaz çünkü time_blocks_routine_progress sadece
--    task_id IS NULL olan blokları sayar (routine_done_count fonksiyonuna göre).
-- 2. 057_google_calendar.sql'deki time_blocks_calendar_sync ile çakışmaz,
--    zaman bloğunun completed_at alanı güncellendiğinde, takvim eşzamanlaması
--    için kuyruğa eklenecektir.

CREATE OR REPLACE FUNCTION public.sync_task_to_time_block()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
    UPDATE time_blocks
    SET completed_at = COALESCE(NEW.completed_at, now())
    WHERE task_id = NEW.id AND user_id = NEW.user_id AND completed_at IS NULL;
  ELSIF OLD.status = 'done' AND NEW.status IS DISTINCT FROM 'done' THEN
    UPDATE time_blocks
    SET completed_at = NULL
    WHERE task_id = NEW.id AND user_id = NEW.user_id AND completed_at IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_task_to_time_block_trigger ON tasks;
CREATE TRIGGER sync_task_to_time_block_trigger
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.sync_task_to_time_block();

CREATE OR REPLACE FUNCTION public.sync_time_block_to_task()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_task_status text;
BEGIN
  IF NEW.task_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- time_blocks.task_id sahiplik denetimi yok; başkasının görevine dokunulmaz.
  SELECT status INTO v_task_status FROM tasks WHERE id = NEW.task_id AND user_id = NEW.user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
    IF v_task_status IS DISTINCT FROM 'done' THEN
      UPDATE tasks
      SET status = 'done', completed_at = COALESCE(completed_at, NEW.completed_at)
      WHERE id = NEW.task_id AND user_id = NEW.user_id;
    END IF;
  ELSIF NEW.completed_at IS NULL AND OLD.completed_at IS NOT NULL THEN
    IF v_task_status = 'done' THEN
      UPDATE tasks
      SET status = 'planned', completed_at = NULL
      WHERE id = NEW.task_id AND user_id = NEW.user_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_time_block_to_task_trigger ON time_blocks;
CREATE TRIGGER sync_time_block_to_task_trigger
  AFTER UPDATE OF completed_at ON time_blocks
  FOR EACH ROW
  WHEN (NEW.completed_at IS DISTINCT FROM OLD.completed_at)
  EXECUTE FUNCTION public.sync_time_block_to_task();
