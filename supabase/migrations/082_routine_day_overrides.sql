-- 082: Güne göre farklı rutin saati ya da süresi (spec 2026-11-15 §3).
-- Örnek: bootcamp hafta içi 14:30 ile 16:30, hafta sonu 60 dk.
--
-- Bir gün için ya yeni saat aralığı (start_time + end_time) ya da yalnız süre (minutes)
-- tutulur. Süre satırında blok şablonun başlangıcında başlar, bitiş = başlangıç + süre;
-- gece yarısını geçebilir (077). Yazma yalnız set_routine_day_overrides RPC'si ile:
-- tek işlemde eski satırlar silinir, yenileri yazılır, "bundan sonrası" yeniden üretilir.

CREATE TABLE IF NOT EXISTS public.routine_day_overrides (
  routine_id UUID NOT NULL REFERENCES public.routines(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME,
  end_time TIME,
  minutes SMALLINT CHECK (minutes BETWEEN 1 AND 1439),
  PRIMARY KEY (routine_id, day_of_week),
  CONSTRAINT routine_day_overrides_time_pair CHECK ((start_time IS NULL) = (end_time IS NULL)),
  CONSTRAINT routine_day_overrides_time_order CHECK (start_time IS NULL OR end_time <> start_time),
  CONSTRAINT routine_day_overrides_one_kind CHECK ((start_time IS NULL) <> (minutes IS NULL))
);

ALTER TABLE public.routine_day_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "routine_day_overrides_select_own" ON public.routine_day_overrides;
CREATE POLICY "routine_day_overrides_select_own" ON public.routine_day_overrides
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.routines r WHERE r.id = routine_id AND r.user_id = auth.uid()
  ));

REVOKE ALL ON public.routine_day_overrides FROM anon, authenticated;
GRANT SELECT ON public.routine_day_overrides TO authenticated;

-- Rutinden çıkarılan günün satırı kalmasın: gün sonradan geri eklenirse eski saat
-- sessizce geri gelmesin.
CREATE OR REPLACE FUNCTION public.cleanup_routine_day_overrides()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM routine_day_overrides
  WHERE routine_id = NEW.id
    AND NOT (day_of_week = ANY (NEW.days_of_week));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS routines_cleanup_day_overrides ON public.routines;
CREATE TRIGGER routines_cleanup_day_overrides
  AFTER UPDATE OF days_of_week ON public.routines
  FOR EACH ROW WHEN (OLD.days_of_week IS DISTINCT FROM NEW.days_of_week)
  EXECUTE FUNCTION public.cleanup_routine_day_overrides();

-- Üretici: 068 ile aynı, o günün override satırı varsa saat ve süre ondan gelir.
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
  SELECT r.user_id, o.occurrence_date,
         COALESCE(ov.start_time, r.start_time),
         COALESCE(ov.end_time, r.start_time + make_interval(mins => ov.minutes), r.end_time),
         r.block_type, r.title, r.color, r.id, o.occurrence_date
  FROM public.routine_occurrence_days(p_user) o
  JOIN routines r ON r.id = o.routine_id
  LEFT JOIN routine_day_overrides ov
    ON ov.routine_id = r.id AND ov.day_of_week = EXTRACT(DOW FROM o.occurrence_date)::SMALLINT
  WHERE r.kind = 'block'
  ON CONFLICT (routine_id, occurrence_date) WHERE routine_id IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_blocks = ROW_COUNT;

  -- task: o güne planlanmış görev. Saat aralığı override'ında süre aralıktan hesaplanır.
  INSERT INTO tasks (user_id, title, status, scheduled_date, estimated_minutes,
                     value_score, urgency_score, risk_score, effort_score, friction_score,
                     is_time_blocked, routine_id, occurrence_date, goal_id)
  SELECT r.user_id, r.title, 'planned', o.occurrence_date,
         COALESCE(
           ov.minutes,
           ((EXTRACT(EPOCH FROM (ov.end_time - ov.start_time))::INTEGER / 60 + 1440) % 1440),
           r.estimated_minutes
         ),
         r.value_score, r.urgency_score, r.risk_score, r.effort_score, r.friction_score,
         COALESCE(ov.start_time, r.start_time) IS NOT NULL, r.id, o.occurrence_date, r.goal_id
  FROM public.routine_occurrence_days(p_user) o
  JOIN routines r ON r.id = o.routine_id
  LEFT JOIN routine_day_overrides ov
    ON ov.routine_id = r.id AND ov.day_of_week = EXTRACT(DOW FROM o.occurrence_date)::SMALLINT
  WHERE r.kind = 'task'
  ON CONFLICT (routine_id, occurrence_date) WHERE routine_id IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_tasks = ROW_COUNT;

  -- task + saat: göreve bağlı blok. Görev silinmiş (istisna) günlerde üretilmez.
  INSERT INTO time_blocks (user_id, task_id, date, start_time, end_time, block_type, label, color,
                           routine_id, occurrence_date)
  SELECT r.user_id, t.id, o.occurrence_date,
         COALESCE(ov.start_time, r.start_time),
         COALESCE(ov.end_time, r.start_time + make_interval(mins => ov.minutes), r.end_time),
         'task', r.title, r.color, r.id, o.occurrence_date
  FROM public.routine_occurrence_days(p_user) o
  JOIN routines r ON r.id = o.routine_id
  JOIN tasks t ON t.routine_id = r.id AND t.occurrence_date = o.occurrence_date
  LEFT JOIN routine_day_overrides ov
    ON ov.routine_id = r.id AND ov.day_of_week = EXTRACT(DOW FROM o.occurrence_date)::SMALLINT
  WHERE r.kind = 'task' AND COALESCE(ov.start_time, r.start_time) IS NOT NULL
  ON CONFLICT (routine_id, occurrence_date) WHERE routine_id IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_task_blocks = ROW_COUNT;

  RETURN v_blocks + v_tasks + v_task_blocks;
END;
$$;

-- Override listesini değiştirir ve p_from'dan (en erken bugün) itibaren yeniden üretir.
-- p_overrides: [{"day_of_week":6,"start_time":null,"end_time":null,"minutes":60}, ...].
-- Rutinin günlerinde olmayan satırlar yok sayılır. Saatsiz görev rutininde süre satırı
-- yalnız tahmini süreyi değiştirir, saat satırı o güne blok ekler.
CREATE OR REPLACE FUNCTION public.set_routine_day_overrides(
  p_routine UUID,
  p_overrides JSONB,
  p_from DATE DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_days SMALLINT[];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT days_of_week INTO v_days
  FROM routines
  WHERE id = p_routine AND user_id = v_user AND kind IN ('block', 'task');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'routine not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_overrides IS NOT NULL AND jsonb_typeof(p_overrides) <> 'array' THEN
    RAISE EXCEPTION 'overrides must be an array' USING ERRCODE = '22023';
  END IF;

  DELETE FROM routine_day_overrides WHERE routine_id = p_routine;

  INSERT INTO routine_day_overrides (routine_id, day_of_week, start_time, end_time, minutes)
  SELECT p_routine, x.day_of_week, x.start_time, x.end_time, x.minutes
  FROM jsonb_to_recordset(COALESCE(p_overrides, '[]'::jsonb))
    AS x(day_of_week SMALLINT, start_time TIME, end_time TIME, minutes SMALLINT)
  WHERE x.day_of_week = ANY (v_days)
  ON CONFLICT (routine_id, day_of_week) DO UPDATE
    SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, minutes = EXCLUDED.minutes;

  RETURN public.regenerate_routine(p_routine, p_from);
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_routine_day_overrides() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.materialize_routines(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_routine_day_overrides(UUID, JSONB, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_routine_day_overrides(UUID, JSONB, DATE) TO authenticated;
