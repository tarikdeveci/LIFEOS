-- Günlük döngü: akşam raporu, sabah özeti, kalıcı planlama kuralları.
--
-- 1) Rutin şablonu alan, program sayacı (X/N), düşük enerji sürümü, korumalı ve
--    sayaçsız işaretlerini taşır. Görev alan, hedef günlük tavan alır.
-- 2) Sayaç hedefe ulaşınca seri kendiliğinden kapanır (42 günlük program 42'de biter).
-- 3) Gün sonu devri kullanıcının tercihine bakar: bugüne taşı ya da backlog'a bırak.
-- 4) daily_reports: günün anlık görüntüsü. Devir scheduled_date'i değiştirdiği için
--    "dün ne ertelendi" sonradan yeniden kurulamaz.

-- ============================================================
-- 1. Kolonlar
-- ============================================================
ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS area TEXT
    CHECK (area IN ('career', 'health', 'personal', 'spiritual', 'social')),
  ADD COLUMN IF NOT EXISTS target_count SMALLINT CHECK (target_count BETWEEN 1 AND 999),
  ADD COLUMN IF NOT EXISTS start_count SMALLINT NOT NULL DEFAULT 0 CHECK (start_count >= 0),
  ADD COLUMN IF NOT EXISTS min_minutes SMALLINT CHECK (min_minutes BETWEEN 1 AND 600),
  ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_untracked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_start_below_target;
ALTER TABLE routines
  ADD CONSTRAINT routines_start_below_target
  CHECK (target_count IS NULL OR start_count < target_count);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS area TEXT
    CHECK (area IN ('career', 'health', 'personal', 'spiritual', 'social'));

ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS daily_cap SMALLINT CHECK (daily_cap BETWEEN 1 AND 10);

-- Mağazadaki eski sürümlerde rapor ekranı yok. Yeni sürüm yalnızca yeni kullanıcıda
-- (hesap son 24 saatte açıldı) ilk açılışta TRUE yapar; mevcut kullanıcı ayarlardan açar.
-- Sunucu ancak TRUE ise rapor bildirimi yollar, yoksa eski akşam özeti gider.
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS report_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- 2. Program sayacı
-- ============================================================
-- Biten oturum: bitmiş görev örneği, görevsiz bitmiş blok örneği (göreve bağlı blok
-- görevle birlikte sayılır), günlük hedefini tutmuş alışkanlık işareti.
CREATE OR REPLACE FUNCTION public.routine_done_count(p_routine UUID)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (
    r.start_count
    + (SELECT count(*) FROM tasks t WHERE t.routine_id = r.id AND t.status = 'done')
    + (SELECT count(*) FROM time_blocks tb
       WHERE tb.routine_id = r.id AND tb.task_id IS NULL AND tb.completed_at IS NOT NULL)
    + (SELECT count(*) FROM routine_completions rc
       WHERE rc.routine_id = r.id AND rc.count >= COALESCE(r.times_per_day, 1))
  )::INTEGER
  FROM routines r
  WHERE r.id = p_routine;
$$;

-- İstemci RPC'si: çağıranın sayaçlı rutinleri.
CREATE OR REPLACE FUNCTION public.my_routine_progress()
RETURNS TABLE (routine_id UUID, done_count INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, public.routine_done_count(r.id)
  FROM routines r
  WHERE r.user_id = auth.uid() AND r.target_count IS NOT NULL;
$$;

-- Sayaç hedefe ulaştıysa seriyi bugünde bitirir, yarından sonraki örnekleri siler.
-- Son oturumun işareti geri alınırsa seri kapalı kalır; bitişi kullanıcı uzatır.
CREATE OR REPLACE FUNCTION public.close_routine_if_complete(p_routine UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_routine routines%ROWTYPE;
  v_today DATE;
BEGIN
  SELECT * INTO v_routine FROM routines WHERE id = p_routine;
  IF NOT FOUND OR v_routine.target_count IS NULL THEN RETURN; END IF;
  IF public.routine_done_count(p_routine) < v_routine.target_count THEN RETURN; END IF;

  v_today := (now() AT TIME ZONE public.user_timezone(v_routine.user_id))::date;
  IF v_routine.ends_on IS NOT NULL AND v_routine.ends_on <= v_today THEN RETURN; END IF;

  PERFORM public.delete_future_routine_occurrences(p_routine, v_today + 1);
  UPDATE routines SET ends_on = GREATEST(v_today, starts_on) WHERE id = p_routine;
END;
$$;

CREATE OR REPLACE FUNCTION public.routine_progress_changed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.close_routine_if_complete(NEW.routine_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tasks_routine_progress ON tasks;
CREATE TRIGGER tasks_routine_progress
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW
  WHEN (NEW.routine_id IS NOT NULL AND NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done')
  EXECUTE FUNCTION public.routine_progress_changed();

DROP TRIGGER IF EXISTS time_blocks_routine_progress ON time_blocks;
CREATE TRIGGER time_blocks_routine_progress
  AFTER UPDATE OF completed_at ON time_blocks
  FOR EACH ROW
  WHEN (NEW.routine_id IS NOT NULL AND NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL)
  EXECUTE FUNCTION public.routine_progress_changed();

DROP TRIGGER IF EXISTS routine_completions_progress ON routine_completions;
CREATE TRIGGER routine_completions_progress
  AFTER INSERT OR UPDATE OF count ON routine_completions
  FOR EACH ROW
  EXECUTE FUNCTION public.routine_progress_changed();

-- ============================================================
-- 3. Gün sonu devri: tercihe göre bugüne taşı ya da backlog'a bırak
-- ============================================================
-- preferences.planning.rollover = 'backlog' ise görev günden çıkar; aksi halde 063'teki
-- davranış (bugüne taşı). carry_count iki durumda da artar.
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
    SELECT c.user_id,
           now() AT TIME ZONE public.user_timezone(c.user_id) AS local_now,
           COALESCE((SELECT p.preferences #>> '{planning,rollover}'
                     FROM user_profiles p WHERE p.id = c.user_id), 'carry') = 'backlog' AS to_backlog
    FROM candidates c
  )
  UPDATE tasks t
  -- Backlog tercihinde yalnızca henüz başlanmamış ('planned') görev geri çekilir;
  -- in_progress / blocked carry gibi bugüne taşınır, durumu korunur.
  SET scheduled_date = CASE WHEN l.to_backlog AND t.status = 'planned' THEN NULL ELSE l.local_now::date END,
      status = CASE WHEN l.to_backlog AND t.status = 'planned' THEN 'backlog' ELSE t.status END,
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
-- 4. Gün raporu
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_reports (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  facts JSONB NOT NULL DEFAULT '{}'::jsonb,      -- DayFacts: sunucuda hesaplanan anlık görüntü
  checkin JSONB NOT NULL DEFAULT '{}'::jsonb,    -- DayCheckin: kullanıcının kapanış işaretleri
  narrative JSONB,                               -- DayNarrative: şablon ya da AI anlatısı
  opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);

DROP TRIGGER IF EXISTS update_daily_reports_updated_at ON daily_reports;
CREATE TRIGGER update_daily_reports_updated_at
  BEFORE UPDATE ON daily_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_reports_own" ON daily_reports;
CREATE POLICY "daily_reports_own" ON daily_reports
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 5. Yetkiler
-- ============================================================
REVOKE ALL ON FUNCTION public.routine_done_count(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_routine_if_complete(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.routine_progress_changed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.roll_over_tasks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_routine_progress() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_routine_progress() TO authenticated;
-- daily-digest cron'u (service_role) program satırı için sayacı okur.
GRANT EXECUTE ON FUNCTION public.routine_done_count(UUID) TO service_role;

-- ============================================================
-- 6. Ücretsiz AI hakkı: life_setup da düşer
-- ============================================================
-- 053'teki tanımın aynısı; tek fark FILTER. Küme ai/freeKinds.ts ile aynı kalmalı.
CREATE OR REPLACE FUNCTION public.ai_allowance()
RETURNS TABLE (free_plans_left INT, month_cost_usd NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ai_allowance: kimliksiz cagri, kullanici JWT''si gerekli'
      USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT
    GREATEST(0, 3 - count(*) FILTER (WHERE e.props->>'kind' IN ('replan', 'life_setup')))::int,
    COALESCE(sum(
      CASE
        WHEN jsonb_typeof(e.props->'cost_usd') = 'number'
         AND e.created_at >= date_trunc('month', now())
        THEN GREATEST((e.props->>'cost_usd')::numeric, 0)
      END
    ), 0)
  FROM events e
  WHERE e.user_id = auth.uid()
    AND e.name = 'ai_used';
END;
$$;
REVOKE ALL ON FUNCTION public.ai_allowance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_allowance() TO authenticated, service_role;

-- ============================================================
-- 7. Ücretsiz AI hakkı: atomik rezervasyon
-- ============================================================
-- Hak kontrolü model çağrısından, ai_used satırı sonradan yazılıyordu: aynı anda
-- N istek hepsi kontrolü geçiyordu. Artık ai-suggest çağrıdan ÖNCE hakkı burada
-- ayırır: kullanıcı başına advisory kilit altında say, hak varsa 'reserved'
-- satırı yaz. ai_allowance() (6) satırı hemen sayar. Küme ai/freeKinds.ts ile aynı.
CREATE OR REPLACE FUNCTION public.reserve_ai_use(p_kind TEXT)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_used INT;
  v_id   BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'reserve_ai_use: kimliksiz cagri, kullanici JWT''si gerekli'
      USING ERRCODE = '28000';
  END IF;
  IF p_kind NOT IN ('replan', 'life_setup') THEN
    RAISE EXCEPTION 'reserve_ai_use: ucretsiz rota degil: %', p_kind USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ai_use:' || v_uid::text, 0));

  SELECT count(*) INTO v_used
  FROM events e
  WHERE e.user_id = v_uid
    AND e.name = 'ai_used'
    AND e.props->>'kind' IN ('replan', 'life_setup');
  IF v_used >= 3 THEN
    RETURN NULL;
  END IF;

  INSERT INTO events (user_id, name, props)
  VALUES (v_uid, 'ai_used', jsonb_build_object(
    'kind', p_kind, 'tier', 'free', 'reserved', true, 'cost_usd', 0))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_use(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_ai_use(TEXT) TO authenticated;

-- Rezervasyonu kapatır: maliyeti işler, başarısız çağrıda kind'ı '*_failed'
-- yapar (hak saymaz). YALNIZCA service_role: kullanıcı çağırabilseydi model
-- yanıtını aldıktan sonra hakkını geri alabilirdi. Yalnızca hâlâ 'reserved'
-- olan satırı günceller, yani tekrar çağrı zararsız. events'e kullanıcı için
-- UPDATE/DELETE açılmadı.
CREATE OR REPLACE FUNCTION public.settle_ai_use(p_user_id UUID, p_id BIGINT, p_props JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE events
  SET props = p_props - 'reserved'
  WHERE id = p_id
    AND user_id = p_user_id
    AND name = 'ai_used'
    AND props->>'reserved' = 'true';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.settle_ai_use(UUID, BIGINT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_ai_use(UUID, BIGINT, JSONB) TO service_role;
