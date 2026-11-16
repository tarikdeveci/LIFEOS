-- 084: Saat yerine gün bölümü (spec 2026-11-15 §4).
-- Blok rutini saat yerine gün bölümüyle (sabah, öğle, öğleden sonra, akşam) kurulabilir.
-- Üretilen blok "yüzer": saati gün bölümünün varsayılan başlangıcıdır (yer tutucu),
-- time_blocks.day_part dolu kalır. Kullanıcı bloğa saat verince day_part NULL olur ve
-- blok o gün için sabitlenir (routine_modified). event-notifications yüzen bloğu hatırlatmaz.
-- Override (082) saati doluysa o gün saat geçerlidir, gün bölümü yok sayılır.

ALTER TABLE public.routines
  ADD COLUMN IF NOT EXISTS day_part TEXT;
ALTER TABLE public.time_blocks
  ADD COLUMN IF NOT EXISTS day_part TEXT;

ALTER TABLE public.routines DROP CONSTRAINT IF EXISTS routines_day_part_valid;
ALTER TABLE public.routines ADD CONSTRAINT routines_day_part_valid
  CHECK (day_part IS NULL OR (kind = 'block' AND day_part IN ('morning', 'noon', 'afternoon', 'evening')));

ALTER TABLE public.time_blocks DROP CONSTRAINT IF EXISTS time_blocks_day_part_valid;
ALTER TABLE public.time_blocks ADD CONSTRAINT time_blocks_day_part_valid
  CHECK (day_part IS NULL OR day_part IN ('morning', 'noon', 'afternoon', 'evening'));

-- Blok rutininde saat ya da gün bölümü yeter.
ALTER TABLE public.routines DROP CONSTRAINT IF EXISTS routines_block_has_time;
ALTER TABLE public.routines ADD CONSTRAINT routines_block_has_time
  CHECK (kind <> 'block' OR start_time IS NOT NULL OR day_part IS NOT NULL);

-- Gün bölümünün varsayılan başlangıcı (yer tutucu saat).
CREATE OR REPLACE FUNCTION public.day_part_start(p_part TEXT)
RETURNS TIME
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_part
    WHEN 'morning' THEN TIME '08:00'
    WHEN 'noon' THEN TIME '12:00'
    WHEN 'afternoon' THEN TIME '15:00'
    WHEN 'evening' THEN TIME '19:00'
  END
$$;

-- "Sadece bu" işareti: bloğu sabitlemek (day_part NULL) da elle düzenlemedir.
CREATE OR REPLACE FUNCTION public.mark_time_block_routine_modified()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.date, NEW.start_time, NEW.end_time, NEW.label, NEW.block_type, NEW.color, NEW.day_part)
     IS DISTINCT FROM (OLD.date, OLD.start_time, OLD.end_time, OLD.label, OLD.block_type, OLD.color, OLD.day_part) THEN
    NEW.routine_modified := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

-- Üretici: 082 ile aynı; blok rutininde saat yoksa gün bölümünün başlangıcı kullanılır,
-- bitiş = başlangıç + override süresi, yoksa estimated_minutes, o da yoksa 30 dk.
CREATE OR REPLACE FUNCTION public.materialize_routines(p_user UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_blocks INTEGER := 0;
  v_tasks INTEGER := 0;
  v_task_blocks INTEGER := 0;
BEGIN
  -- block: saatli ya da gün bölümlü blok
  INSERT INTO time_blocks (user_id, date, start_time, end_time, block_type, label, color,
                           routine_id, occurrence_date, day_part)
  SELECT r.user_id, o.occurrence_date,
         COALESCE(ov.start_time, r.start_time, public.day_part_start(r.day_part)),
         CASE
           WHEN ov.start_time IS NOT NULL THEN ov.end_time
           WHEN r.start_time IS NOT NULL THEN
             COALESCE(r.start_time + make_interval(mins => ov.minutes), r.end_time)
           ELSE public.day_part_start(r.day_part)
                + make_interval(mins => COALESCE(ov.minutes, r.estimated_minutes, 30))
         END,
         r.block_type, r.title, r.color, r.id, o.occurrence_date,
         CASE WHEN ov.start_time IS NULL AND r.start_time IS NULL THEN r.day_part END
  FROM public.routine_occurrence_days(p_user) o
  JOIN routines r ON r.id = o.routine_id
  LEFT JOIN routine_day_overrides ov
    ON ov.routine_id = r.id AND ov.day_of_week = EXTRACT(DOW FROM o.occurrence_date)::SMALLINT
  WHERE r.kind = 'block'
    AND COALESCE(ov.start_time, r.start_time, public.day_part_start(r.day_part)) IS NOT NULL
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

REVOKE ALL ON FUNCTION public.materialize_routines(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.day_part_start(TEXT) FROM PUBLIC, anon, authenticated;
