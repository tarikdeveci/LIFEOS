-- 057: Google Calendar senkronu
-- LifeOS -> Google: time_blocks değişikliği outbox'a düşer, calendar-sync edge function
--   (5 dk cron) kullanıcının "LifeOS" takviminde etkinliği açar/günceller/siler.
-- Google -> LifeOS: sadece dolu/boş (freebusy). Başlık okunmaz; calendar_busy penceresi
--   her senkronda 14 gün için baştan yazılır.
-- OAuth state'i (PKCE) oauth_states'te: mobil akışta çerez yok, tarayıcı ayrı.

ALTER TABLE time_blocks ADD COLUMN IF NOT EXISTS google_event_id TEXT;

-- ============================================================
-- OAuth state (yalnızca service_role)
-- ============================================================
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  redirect_to TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON oauth_states FROM anon, authenticated;

-- ============================================================
-- Outbox
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_sync_outbox (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block_id UUID,
  op TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
  google_event_id TEXT,
  attempts SMALLINT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calendar_outbox_user ON calendar_sync_outbox(user_id, id);
ALTER TABLE calendar_sync_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON calendar_sync_outbox FROM anon, authenticated;

-- ============================================================
-- Dolu/boş penceresi
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_busy (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_calendar_busy_user ON calendar_busy(user_id, starts_at);
ALTER TABLE calendar_busy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calendar_busy_select_own" ON calendar_busy;
CREATE POLICY "calendar_busy_select_own" ON calendar_busy
  FOR SELECT USING (auth.uid() = user_id);
REVOKE ALL ON calendar_busy FROM anon, authenticated;
GRANT SELECT ON calendar_busy TO authenticated;

-- ============================================================
-- time_blocks -> outbox
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_calendar_sync()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := COALESCE(NEW.user_id, OLD.user_id);
BEGIN
  -- calendar-sync'in kendi google_event_id yazması yankı yapmasın.
  IF current_setting('lifeos.calendar_sync', true) = 'on' THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM integrations
    WHERE user_id = v_user AND provider = 'google_calendar' AND status = 'active'
  ) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.google_event_id IS NOT NULL THEN
      INSERT INTO calendar_sync_outbox (user_id, block_id, op, google_event_id)
      VALUES (v_user, OLD.id, 'delete', OLD.google_event_id);
    END IF;
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' AND (NEW.date, NEW.start_time, NEW.end_time, NEW.label, NEW.block_type, NEW.completed_at)
     IS NOT DISTINCT FROM (OLD.date, OLD.start_time, OLD.end_time, OLD.label, OLD.block_type, OLD.completed_at) THEN
    RETURN NULL;
  END IF;

  INSERT INTO calendar_sync_outbox (user_id, block_id, op, google_event_id)
  VALUES (v_user, NEW.id, 'upsert', NEW.google_event_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS time_blocks_calendar_sync ON time_blocks;
CREATE TRIGGER time_blocks_calendar_sync
  AFTER INSERT OR UPDATE OR DELETE ON time_blocks
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_calendar_sync();

-- Bağlanınca mevcut blokları (bugünden 60 gün) ilk senkron için kuyruğa alır.
CREATE OR REPLACE FUNCTION public.enqueue_initial_calendar_sync(p_user UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO calendar_sync_outbox (user_id, block_id, op, google_event_id)
  SELECT tb.user_id, tb.id, 'upsert', tb.google_event_id
  FROM time_blocks tb
  WHERE tb.user_id = p_user
    AND tb.date >= (now() AT TIME ZONE public.user_timezone(p_user))::date
    AND tb.date < (now() AT TIME ZONE public.user_timezone(p_user))::date + 60;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Bağlantı kesilince kuyruk ve meşgul penceresi temizlenir; etkinlik kimlikleri unutulur.
CREATE OR REPLACE FUNCTION public.clear_calendar_sync()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.provider = 'google_calendar' THEN
    DELETE FROM calendar_sync_outbox WHERE user_id = OLD.user_id;
    DELETE FROM calendar_busy WHERE user_id = OLD.user_id;
    PERFORM set_config('lifeos.calendar_sync', 'on', true);
    UPDATE time_blocks SET google_event_id = NULL WHERE user_id = OLD.user_id AND google_event_id IS NOT NULL;
    PERFORM set_config('lifeos.calendar_sync', 'off', true);
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS integrations_clear_calendar ON integrations;
CREATE TRIGGER integrations_clear_calendar
  AFTER DELETE ON integrations
  FOR EACH ROW EXECUTE FUNCTION public.clear_calendar_sync();

-- calendar-sync etkinlik kimliğini geri yazarken kuyruğa yeni iş düşmesin.
CREATE OR REPLACE FUNCTION public.set_block_google_event(p_block UUID, p_event TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('lifeos.calendar_sync', 'on', true);
  UPDATE time_blocks SET google_event_id = p_event WHERE id = p_block;
  PERFORM set_config('lifeos.calendar_sync', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.set_block_google_event(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_block_google_event(UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.enqueue_calendar_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_initial_calendar_sync(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_calendar_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_initial_calendar_sync(UUID) TO service_role;

-- ============================================================
-- Cron: 5 dakikada bir calendar-sync (045 kalıbı: anahtar çalışan job'dan devralınır)
-- ============================================================
DO $$
DECLARE
  v_source_cmd TEXT;
  v_url        TEXT;
  v_bearer     TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '057: pg_cron yok, calendar-sync cron kurulmadı.';
    RETURN;
  END IF;

  SELECT command INTO v_source_cmd
    FROM cron.job
   WHERE jobname IN ('daily-digest', 'block-notifications')
   ORDER BY CASE jobname WHEN 'daily-digest' THEN 0 ELSE 1 END
   LIMIT 1;

  v_url    := substring(v_source_cmd FROM 'https://[a-zA-Z0-9-]+\.supabase\.co');
  v_bearer := substring(v_source_cmd FROM 'Bearer\s+([A-Za-z0-9._-]{40,})');
  IF v_url IS NULL OR v_bearer IS NULL THEN
    RAISE NOTICE '057: mevcut job komutundan URL/anahtar çıkarılamadı, calendar-sync cron kurulmadı.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calendar-sync') THEN
    PERFORM cron.unschedule('calendar-sync');
  END IF;

  PERFORM cron.schedule(
    'calendar-sync',
    '*/5 * * * *',
    format(
      $cmd$
        SELECT net.http_post(
          url := %L,
          headers := jsonb_build_object('Authorization', %L, 'Content-Type', 'application/json'),
          body := '{}'::jsonb
        );
      $cmd$,
      v_url || '/functions/v1/calendar-sync',
      'Bearer ' || v_bearer
    )
  );
END;
$$;
