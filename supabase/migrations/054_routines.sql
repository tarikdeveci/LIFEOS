-- 054_routines.sql
-- Haftalık rutinler, esnek alışkanlık ve suçsuz gün sonu devri.
--
-- Rutin bir ŞABLONDUR; örnekleri gerçek time_blocks / tasks satırı olarak üretilir.
-- Böylece bildirimler, ICS akışı, widget'lar, AI plan ve seri sayacı hiç değişmeden
-- rutinleri görür. Üretici idempotent: (routine_id, occurrence_date) tekil indeksi
-- sayesinde kaç kez çalışırsa çalışsın çift satır oluşmaz.
--
-- 007'deki is_recurring / recurrence_* kolonları eskimiş sayılır: mevcut seriler
-- aşağıda routines satırına dönüştürülür, UI artık o kolonlara yazmaz.

-- ============================================================
-- 1. Tablolar
-- ============================================================
CREATE TABLE IF NOT EXISTS routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  kind TEXT NOT NULL CHECK (kind IN ('block', 'task', 'habit')),
  block_type block_type NOT NULL DEFAULT 'routine',
  days_of_week SMALLINT[] NOT NULL DEFAULT '{}',       -- 0=Pzr..6=Cmt (recurrence_days ile aynı)
  every_n_weeks SMALLINT NOT NULL DEFAULT 1 CHECK (every_n_weeks BETWEEN 1 AND 4),
  times_per_week SMALLINT CHECK (times_per_week BETWEEN 1 AND 7),
  start_time TIME,
  end_time TIME,
  estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes BETWEEN 1 AND 1440),
  color TEXT,
  value_score SMALLINT NOT NULL DEFAULT 3 CHECK (value_score BETWEEN 1 AND 5),
  urgency_score SMALLINT NOT NULL DEFAULT 3 CHECK (urgency_score BETWEEN 1 AND 5),
  risk_score SMALLINT NOT NULL DEFAULT 3 CHECK (risk_score BETWEEN 1 AND 5),
  effort_score SMALLINT NOT NULL DEFAULT 3 CHECK (effort_score BETWEEN 1 AND 5),
  friction_score SMALLINT NOT NULL DEFAULT 3 CHECK (friction_score BETWEEN 1 AND 5),
  starts_on DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on DATE,                                         -- NULL = süresiz
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT routines_days_valid CHECK (days_of_week <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[]),
  CONSTRAINT routines_time_pair CHECK ((start_time IS NULL) = (end_time IS NULL)),
  CONSTRAINT routines_time_order CHECK (start_time IS NULL OR end_time > start_time),
  CONSTRAINT routines_end_after_start CHECK (ends_on IS NULL OR ends_on >= starts_on),
  -- block: saat zorunlu. block/task: en az bir gün. habit: haftalık hedef zorunlu.
  CONSTRAINT routines_block_has_time CHECK (kind <> 'block' OR start_time IS NOT NULL),
  CONSTRAINT routines_days_required CHECK (kind = 'habit' OR cardinality(days_of_week) > 0),
  CONSTRAINT routines_habit_target CHECK ((kind = 'habit') = (times_per_week IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_routines_user_active ON routines(user_id) WHERE is_active;

CREATE TRIGGER update_routines_updated_at
  BEFORE UPDATE ON routines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Tek gün silindi: üretici o günü bir daha oluşturmaz.
CREATE TABLE IF NOT EXISTS routine_exceptions (
  routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (routine_id, occurrence_date)
);

-- Esnek alışkanlık tamamlamaları ("haftada N kez"). Örnek satırı üretilmez.
CREATE TABLE IF NOT EXISTS routine_completions (
  routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (routine_id, completed_on)
);

CREATE INDEX IF NOT EXISTS idx_routine_completions_user_day ON routine_completions(user_id, completed_on);

-- ============================================================
-- 2. Örnek kolonları
-- ============================================================
ALTER TABLE time_blocks
  ADD COLUMN IF NOT EXISTS routine_id UUID REFERENCES routines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS occurrence_date DATE,
  ADD COLUMN IF NOT EXISTS routine_modified BOOLEAN NOT NULL DEFAULT FALSE;  -- "sadece bu" ile düzenlendi

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS routine_id UUID REFERENCES routines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS occurrence_date DATE,
  ADD COLUMN IF NOT EXISTS routine_modified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS carry_count SMALLINT NOT NULL DEFAULT 0;         -- kaç gün devretti

CREATE UNIQUE INDEX IF NOT EXISTS time_blocks_routine_occurrence
  ON time_blocks(routine_id, occurrence_date) WHERE routine_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_routine_occurrence
  ON tasks(routine_id, occurrence_date) WHERE routine_id IS NOT NULL;

-- ============================================================
-- 3. RLS
-- ============================================================
ALTER TABLE routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routines_own" ON routines
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "routine_exceptions_own" ON routine_exceptions
  FOR ALL
  USING (EXISTS (SELECT 1 FROM routines r WHERE r.id = routine_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM routines r WHERE r.id = routine_id AND r.user_id = auth.uid()));

CREATE POLICY "routine_completions_own" ON routine_completions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM routines r WHERE r.id = routine_id AND r.user_id = auth.uid())
  );

-- ============================================================
-- 4. Yardımcılar
-- ============================================================
-- Kullanıcının saat dilimi. Sunucu UTC'de: tarih hesabı her zaman bununla yapılır.
CREATE OR REPLACE FUNCTION public.user_timezone(p_user UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT np.timezone FROM notification_preferences np
      WHERE np.user_id = p_user AND public.is_valid_timezone(np.timezone)),
    (SELECT up.timezone FROM user_profiles up
      WHERE up.id = p_user AND public.is_valid_timezone(up.timezone)),
    'Europe/Istanbul'
  );
$$;

-- Üretilecek (rutin, gün) çiftleri. Ufuk: block 90 gün (ICS 90 gün ileriyi
-- yayınlıyor), task 7 gün (görev listesini doldurmasın). Hafta çapası starts_on'un
-- Pazartesisi; packages/shared/src/utils/routine.ts ile aynı kural.
CREATE OR REPLACE FUNCTION public.routine_occurrence_days(p_user UUID)
RETURNS TABLE (routine_id UUID, occurrence_date DATE)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH r AS (
    SELECT ro.*, (now() AT TIME ZONE public.user_timezone(ro.user_id))::date AS today
    FROM routines ro
    WHERE ro.is_active
      AND ro.kind IN ('block', 'task')
      AND (p_user IS NULL OR ro.user_id = p_user)
  )
  SELECT r.id, d::date
  FROM r
  CROSS JOIN LATERAL generate_series(
    GREATEST(r.starts_on, r.today)::timestamp,
    LEAST(COALESCE(r.ends_on, 'infinity'::date), r.today + CASE WHEN r.kind = 'block' THEN 90 ELSE 7 END)::timestamp,
    INTERVAL '1 day'
  ) AS d
  WHERE EXTRACT(DOW FROM d)::SMALLINT = ANY (r.days_of_week)
    AND ((d::date - date_trunc('week', r.starts_on)::date) / 7) % r.every_n_weeks = 0
    AND NOT EXISTS (
      SELECT 1 FROM routine_exceptions e
      WHERE e.routine_id = r.id AND e.occurrence_date = d::date
    );
$$;

-- ============================================================
-- 5. Üretici
-- ============================================================
-- p_user NULL = herkes (cron). Dönüş: yeni oluşturulan satır sayısı.
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
                     is_time_blocked, routine_id, occurrence_date)
  SELECT r.user_id, r.title, 'planned', o.occurrence_date, r.estimated_minutes,
         r.value_score, r.urgency_score, r.risk_score, r.effort_score, r.friction_score,
         r.start_time IS NOT NULL, r.id, o.occurrence_date
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

-- İstemci RPC'si: rutin kaydedilince çağrılır, sadece çağıranın rutinleri.
CREATE OR REPLACE FUNCTION public.materialize_my_routines()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN public.materialize_routines(auth.uid());
END;
$$;

-- ============================================================
-- 6. Suçsuz gün sonu devri
-- ============================================================
-- Yerel saat 03:00'ı geçmiş kullanıcılarda, geçmiş güne planlanıp bitmemiş görevleri
-- bugüne çeker. ">= 3" (tam 3 değil): cron bir saati kaçırırsa ertesi çalışmada yakalar;
-- taşınan görev artık "bugün" olduğu için aynı gün ikinci kez sayılmaz.
-- Rutin örnekleri devretmez: kaçırılan rutin günü sessizce geride kalır.
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
      AND t.routine_id IS NULL
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
    AND t.routine_id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- 7. Örnek düzenleme ve silme (hangi istemciden gelirse gelsin)
-- ============================================================
-- Yayındaki eski sürümler rutini bilmiyor ve örnekleri sıradan satır gibi siliyor /
-- düzenliyor. Bu yüzden anlam veritabanında: silinen örnek istisna olur (geri
-- gelmez), düzenlenen örnek "sadece bu" sayılır (seri değişince korunur).
-- Seri işlemleri lifeos.routine_regen bayrağıyla bu kancaları atlar.
CREATE OR REPLACE FUNCTION public.routine_occurrence_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('lifeos.routine_regen', true) = 'on' THEN
    RETURN OLD;
  END IF;
  -- Hesap silinirken rutin aynı işlemde gitmiş olabilir: yoksa istisna yazma.
  INSERT INTO routine_exceptions (routine_id, occurrence_date)
  SELECT OLD.routine_id, OLD.occurrence_date
  WHERE EXISTS (SELECT 1 FROM routines r WHERE r.id = OLD.routine_id)
  ON CONFLICT DO NOTHING;
  -- Saatli görev rutininde görev silinince o günün bağlı bloğu da gider.
  IF TG_TABLE_NAME = 'tasks' THEN
    DELETE FROM time_blocks tb
    WHERE tb.routine_id = OLD.routine_id AND tb.occurrence_date = OLD.occurrence_date;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER time_blocks_routine_occurrence_deleted
  AFTER DELETE ON time_blocks
  FOR EACH ROW WHEN (OLD.routine_id IS NOT NULL AND OLD.occurrence_date IS NOT NULL)
  EXECUTE FUNCTION public.routine_occurrence_deleted();

CREATE TRIGGER tasks_routine_occurrence_deleted
  AFTER DELETE ON tasks
  FOR EACH ROW WHEN (OLD.routine_id IS NOT NULL AND OLD.occurrence_date IS NOT NULL)
  EXECUTE FUNCTION public.routine_occurrence_deleted();

CREATE OR REPLACE FUNCTION public.mark_time_block_routine_modified()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.date, NEW.start_time, NEW.end_time, NEW.label, NEW.block_type, NEW.color)
     IS DISTINCT FROM (OLD.date, OLD.start_time, OLD.end_time, OLD.label, OLD.block_type, OLD.color) THEN
    NEW.routine_modified := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER time_blocks_mark_routine_modified
  BEFORE UPDATE ON time_blocks
  FOR EACH ROW WHEN (OLD.routine_id IS NOT NULL)
  EXECUTE FUNCTION public.mark_time_block_routine_modified();

CREATE OR REPLACE FUNCTION public.mark_task_routine_modified()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.title, NEW.description, NEW.scheduled_date, NEW.estimated_minutes)
     IS DISTINCT FROM (OLD.title, OLD.description, OLD.scheduled_date, OLD.estimated_minutes) THEN
    NEW.routine_modified := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_mark_routine_modified
  BEFORE UPDATE ON tasks
  FOR EACH ROW WHEN (OLD.routine_id IS NOT NULL)
  EXECUTE FUNCTION public.mark_task_routine_modified();

-- Silinecek gelecek örnekler: p_from ve sonrası, elle düzenlenmemiş, bitmemiş.
CREATE OR REPLACE FUNCTION public.delete_future_routine_occurrences(p_routine UUID, p_from DATE)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_blocks INTEGER := 0;
  v_tasks INTEGER := 0;
BEGIN
  PERFORM set_config('lifeos.routine_regen', 'on', true);
  DELETE FROM time_blocks tb
  WHERE tb.routine_id = p_routine
    AND tb.occurrence_date >= p_from
    AND NOT tb.routine_modified
    AND tb.completed_at IS NULL;
  GET DIAGNOSTICS v_blocks = ROW_COUNT;
  DELETE FROM tasks t
  WHERE t.routine_id = p_routine
    AND t.occurrence_date >= p_from
    AND NOT t.routine_modified
    AND t.status <> 'done';
  GET DIAGNOSTICS v_tasks = ROW_COUNT;
  PERFORM set_config('lifeos.routine_regen', 'off', true);
  RETURN v_blocks + v_tasks;
END;
$$;

-- "Bu ve sonrakiler": istemci şablonu güncelledikten sonra çağırır. p_from'dan
-- (en erken bugün) itibaren eski örnekler silinir, yeni şablonla yeniden üretilir.
CREATE OR REPLACE FUNCTION public.regenerate_routine(p_routine UUID, p_from DATE DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_today DATE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM routines WHERE id = p_routine AND user_id = v_user) THEN
    RAISE EXCEPTION 'routine not found' USING ERRCODE = 'P0002';
  END IF;
  v_today := (now() AT TIME ZONE public.user_timezone(v_user))::date;
  PERFORM public.delete_future_routine_occurrences(p_routine, GREATEST(COALESCE(p_from, v_today), v_today));
  RETURN public.materialize_routines(v_user);
END;
$$;

-- Seriyi sil: bugünden itibaren bitmemiş örnekler gider, geçmiş örnekler
-- routine_id = NULL ile sıradan satır olarak kalır (FK ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION public.delete_routine(p_routine UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM routines WHERE id = p_routine AND user_id = v_user) THEN
    RAISE EXCEPTION 'routine not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.delete_future_routine_occurrences(
    p_routine, (now() AT TIME ZONE public.user_timezone(v_user))::date
  );
  DELETE FROM routines WHERE id = p_routine;
END;
$$;

-- Yetkiler: cron ve iç yardımcılar sadece sunucuda. İstemci yalnızca auth.uid()
-- ile sınırlı RPC'leri çağırır.
REVOKE ALL ON FUNCTION public.user_timezone(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.routine_occurrence_days(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.materialize_routines(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.roll_over_tasks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_future_routine_occurrences(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.routine_occurrence_deleted() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.materialize_my_routines() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.regenerate_routine(UUID, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_routine(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materialize_my_routines() TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_routine(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_routine(UUID) TO authenticated;

-- ============================================================
-- 8. Eski tekrarlayan blokları rutine dönüştür
-- ============================================================
-- Aynı seri: (user_id, label, block_type, start_time, end_time, recurrence_type, recurrence_days).
-- daily → 7 gün, weekly → 1 hafta, biweekly → 2 hafta. monthly dönüştürülmez.
-- Bitiş: recurrence_end varsa o. Yoksa eski istemci 1 ay üretip bırakıyordu; son
-- blok geçmişte kaldıysa seri bitmiş sayılır, değilse süresiz devam eder.
DO $$
DECLARE
  g RECORD;
  v_id UUID;
  v_days SMALLINT[];
  v_end DATE;
BEGIN
  FOR g IN
    SELECT tb.user_id, tb.label, tb.block_type, tb.start_time, tb.end_time,
           tb.recurrence_type, tb.recurrence_days,
           MIN(tb.date) AS first_date, MAX(tb.date) AS last_date, MAX(tb.recurrence_end) AS rec_end
    FROM time_blocks tb
    WHERE tb.is_recurring
      AND tb.recurrence_type IN ('daily', 'weekly', 'biweekly')
      AND tb.routine_id IS NULL
    GROUP BY tb.user_id, tb.label, tb.block_type, tb.start_time, tb.end_time,
             tb.recurrence_type, tb.recurrence_days
  LOOP
    IF g.recurrence_type = 'daily' THEN
      v_days := ARRAY[0,1,2,3,4,5,6]::SMALLINT[];
    ELSE
      SELECT array_agg(DISTINCT x::SMALLINT ORDER BY x::SMALLINT) INTO v_days
      FROM unnest(g.recurrence_days) AS x
      WHERE x BETWEEN 0 AND 6;
      IF v_days IS NULL THEN
        v_days := ARRAY[EXTRACT(DOW FROM g.first_date)::SMALLINT];
      END IF;
    END IF;

    v_end := COALESCE(g.rec_end, CASE WHEN g.last_date < CURRENT_DATE THEN g.last_date END);
    IF v_end < g.first_date THEN
      v_end := g.first_date;
    END IF;

    INSERT INTO routines (user_id, title, kind, block_type, days_of_week, every_n_weeks,
                          start_time, end_time, starts_on, ends_on)
    VALUES (
      g.user_id,
      LEFT(COALESCE(NULLIF(btrim(g.label), ''), 'Rutin'), 200),
      'block',
      g.block_type,
      v_days,
      CASE WHEN g.recurrence_type = 'biweekly' THEN 2 ELSE 1 END,
      g.start_time,
      g.end_time,
      g.first_date,
      v_end
    )
    RETURNING id INTO v_id;

    -- Aynı güne iki kopya varsa (seri iki kez oluşturulmuş) ilki bağlanır.
    UPDATE time_blocks tb
    SET routine_id = v_id, occurrence_date = tb.date
    WHERE tb.id IN (
      SELECT DISTINCT ON (x.date) x.id
      FROM time_blocks x
      WHERE x.is_recurring
        AND x.routine_id IS NULL
        AND x.user_id = g.user_id
        AND x.label IS NOT DISTINCT FROM g.label
        AND x.block_type = g.block_type
        AND x.start_time = g.start_time
        AND x.end_time = g.end_time
        AND x.recurrence_type = g.recurrence_type
        AND x.recurrence_days IS NOT DISTINCT FROM g.recurrence_days
      ORDER BY x.date, x.created_at
    );
  END LOOP;
END $$;

-- İlk üretim: dönüştürülen seriler bugünden 90 gün ileriye uzar.
SELECT public.materialize_routines();

-- ============================================================
-- 9. Cron (saf SQL, anahtar gömme gerekmez)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'materialize-routines') THEN
    PERFORM cron.unschedule('materialize-routines');
  END IF;
  PERFORM cron.schedule('materialize-routines', '10 0 * * *', 'SELECT public.materialize_routines();');

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'roll-over-tasks') THEN
    PERFORM cron.unschedule('roll-over-tasks');
  END IF;
  PERFORM cron.schedule('roll-over-tasks', '5 * * * *', 'SELECT public.roll_over_tasks();');
END $$;
