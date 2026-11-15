-- supabase/migrations/076_guest_mode.sql
-- Misafir modu (spec docs/superpowers/specs/2026-10-20-misafir-modu-design.md, bölüm 11 ve 12;
-- spec bu dosyayı "073_" diye anıyor, numara paralel dallar yüzünden 076 oldu).
--
-- Sırayla:
--   1. events: üç yeni olay adı, user_id NULL alabilir ve ON DELETE SET NULL,
--      istemci yalnızca veritabanının yazdığı iki olayı yazamaz.
--   2. auth.users tetikleyicileri: guest_started (anonim kayıt) ve account_upgraded
--      (anonimden kalıcıya geçiş). İstemci rol oynamaz, silinen kullanıcının satırı kalır.
--   3. Mevcut şifreli kalıcı hesaplara password_set doldurma (mobil şifre adımı görünmesin).
--   4. 30 gün kullanılmayan misafiri silen fonksiyon ve haftalık cron.
--   5. Analiz: "kayıt = kalıcı hesap"; misafir sayısı ayrı; analytics.guest_conversion.

-- ============================================================
-- 1. events
-- ============================================================
-- 072'deki liste korunur (paywall_view, ai_used, ai_fallback_notified).
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_name_check;
ALTER TABLE public.events ADD CONSTRAINT events_name_check CHECK (name IN (
  'paywall_view',
  'ai_used',
  'ai_fallback_notified',
  'account_gate_shown',  -- istemci yazar; props: reason, stage
  'guest_started',       -- yalnızca tetikleyici yazar
  'account_upgraded'     -- yalnızca tetikleyici yazar; props: guest_age_days
));

-- Silinen kullanıcının olay satırı kalır, kimlik bağı kopar (props kişisel veri içermez).
-- Dönüşüm oranının paydası (guest_started) silinen misafirlerle küçülmesin diye.
ALTER TABLE public.events ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_user_id_fkey;
ALTER TABLE public.events ADD CONSTRAINT events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "events_insert_own" ON public.events;
CREATE POLICY "events_insert_own" ON public.events
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND name NOT IN ('guest_started', 'account_upgraded')
  );

-- ============================================================
-- 2. Yaşam döngüsü tetikleyicileri
-- ============================================================
-- Olay yazılamazsa bile anonim giriş ya da yükseltme düşmesin (handle_new_user ile aynı kural).
CREATE OR REPLACE FUNCTION public.log_guest_started()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.events (user_id, name) VALUES (NEW.id, 'guest_started');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'log_guest_started error: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.log_account_upgraded()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.events (user_id, name, props)
  VALUES (
    NEW.id,
    'account_upgraded',
    jsonb_build_object('guest_age_days', floor(extract(epoch FROM (NOW() - NEW.created_at)) / 86400)::int)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'log_account_upgraded error: %', SQLERRM;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.log_guest_started(), public.log_account_upgraded()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_guest_started ON auth.users;
CREATE TRIGGER on_auth_user_guest_started
  AFTER INSERT ON auth.users
  FOR EACH ROW WHEN (NEW.is_anonymous)
  EXECUTE FUNCTION public.log_guest_started();

DROP TRIGGER IF EXISTS on_auth_user_account_upgraded ON auth.users;
CREATE TRIGGER on_auth_user_account_upgraded
  AFTER UPDATE OF is_anonymous ON auth.users
  FOR EACH ROW WHEN (OLD.is_anonymous AND NOT NEW.is_anonymous)
  EXECUTE FUNCTION public.log_account_upgraded();

-- ============================================================
-- 3. password_set doldurma
-- ============================================================
-- Şifresiz kalıcı hesaplar (Google) yazılmaz: onları mobil, e-posta dışı kimliği
-- olduğu için zaten "hazır" sayar. Tekrar çalışınca bir şey değiştirmez.
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"password_set": true}'::jsonb
WHERE NOT is_anonymous
  AND COALESCE(encrypted_password, '') <> ''
  AND raw_user_meta_data->>'password_set' IS NULL;

-- ============================================================
-- 4. Kullanılmayan misafirlerin temizliği
-- ============================================================
-- Son etkinlik: oluşturma, son giriş ve oturum yenilemelerinin en yenisi.
-- last_sign_in_at tek başına yetmez: token yenilemesi onu güncellemiyor.
-- auth.sessions.refreshed_at canlıda saat dilimsiz (timestamp), GoTrue UTC yazar.
CREATE OR REPLACE FUNCTION public.guest_is_stale(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT GREATEST(
           u.created_at,
           COALESCE(u.last_sign_in_at, u.created_at),
           COALESCE((SELECT MAX(GREATEST(s.refreshed_at AT TIME ZONE 'UTC', s.updated_at, s.created_at))
                     FROM auth.sessions s WHERE s.user_id = u.id), u.created_at)
         ) < NOW() - INTERVAL '30 days'
  FROM auth.users u WHERE u.id = p_user;
$$;

-- Yarış: aday seçildikten sonra istemci oturumu yenileyip commit edebilir. Tek SQL
-- ifadesinde seçip silmek eski snapshot'ı kullanır, bu yenilemeyi görmez. Bu yüzden her aday
-- için üç ayrı ifade: (1) kullanıcı satırı kilidi, (2) oturum satırları kilidi (uçuştaki
-- yenileme commit olana kadar bekler, bundan sonra başlayan yenileme bizi bekler),
-- (3) kilit altında taze snapshot ile yeniden kontrol ve silme. plpgsql'de her ifade
-- READ COMMITTED altında yeni snapshot alır; GoTrue'nun yazdığı auth.sessions ve auth.users
-- satırları, ortak kilidin kendisidir.
CREATE OR REPLACE FUNCTION public.purge_stale_guests(p_limit int DEFAULT 1000) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_deleted int := 0;
  v_rows int;
BEGIN
  FOR v_id IN
    SELECT u.id FROM auth.users u
    WHERE u.is_anonymous AND public.guest_is_stale(u.id)
    ORDER BY u.created_at
    LIMIT p_limit
  LOOP
    PERFORM 1 FROM auth.users u WHERE u.id = v_id AND u.is_anonymous FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;

    PERFORM 1 FROM auth.sessions s WHERE s.user_id = v_id FOR UPDATE;

    IF public.guest_is_stale(v_id) THEN
      DELETE FROM auth.users d WHERE d.id = v_id AND d.is_anonymous;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_deleted := v_deleted + v_rows;
    END IF;
  END LOOP;
  RETURN v_deleted;
END $$;

REVOKE ALL ON FUNCTION public.guest_is_stale(uuid), public.purge_stale_guests(int)
  FROM PUBLIC, anon, authenticated;

-- Yeniden çalıştırmada çift iş olmasın: aynı adlı iş varsa önce kaldırılır.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-stale-guests';
SELECT cron.schedule('purge-stale-guests', '30 3 * * 1', $$SELECT public.purge_stale_guests(1000)$$);

-- ============================================================
-- 5. Analiz: kayıt = kalıcı hesap
-- ============================================================
-- registered_at: doğrudan kayıt olanlarda profil oluşturma anı, misafirken
-- yükseltenlerde account_upgraded anı. Hâlâ misafir olanlar huniye girmez.
-- first_block_at, activated ve time_to_activate yalnızca registered_at ve sonrasındaki
-- blokları sayar (süre negatif çıkmaz). Misafirken yapılan ilk blok guest_first_block_at,
-- misafirlik aktivasyonu activated_as_guest alanlarında ayrı durur.
-- Sütun sırası 040 ile aynı (bağımlı görünümler kırılmasın), yeni alanlar sona eklendi.
CREATE OR REPLACE VIEW analytics.user_funnel AS
SELECT
  p.id                                        AS user_id,
  r.registered_at                             AS registered_at,
  b.first_block_at,
  t.first_done_at,
  m.first_meal_at,
  pv.first_paywall_at,
  ai.ai_uses,
  (b.first_block_at IS NOT NULL)               AS activated,
  (b.first_block_at - r.registered_at)         AS time_to_activate,
  (up.upgraded_at IS NOT NULL)                 AS was_guest,
  b.guest_first_block_at,
  (b.guest_first_block_at IS NOT NULL)         AS activated_as_guest
FROM public.user_profiles p
JOIN auth.users u ON u.id = p.id AND NOT u.is_anonymous
LEFT JOIN (
  SELECT user_id, min(created_at) AS upgraded_at
  FROM public.events WHERE name = 'account_upgraded' GROUP BY user_id
) up ON up.user_id = p.id
CROSS JOIN LATERAL (SELECT COALESCE(up.upgraded_at, p.created_at) AS registered_at) r
LEFT JOIN LATERAL (
  SELECT min(tb.created_at) FILTER (WHERE tb.created_at >= r.registered_at) AS first_block_at,
         min(tb.created_at) FILTER (WHERE tb.created_at <  r.registered_at) AS guest_first_block_at
  FROM public.time_blocks tb WHERE tb.user_id = p.id
) b ON true
LEFT JOIN (
  SELECT user_id, min(completed_at) AS first_done_at
  FROM public.tasks WHERE completed_at IS NOT NULL GROUP BY user_id
) t ON t.user_id = p.id
LEFT JOIN (
  SELECT user_id, min(created_at) AS first_meal_at
  FROM public.meals GROUP BY user_id
) m ON m.user_id = p.id
LEFT JOIN (
  SELECT user_id, min(created_at) AS first_paywall_at
  FROM public.events WHERE name = 'paywall_view' GROUP BY user_id
) pv ON pv.user_id = p.id
LEFT JOIN (
  SELECT user_id, count(*) AS ai_uses
  FROM public.events WHERE name = 'ai_used' GROUP BY user_id
) ai ON ai.user_id = p.id;

-- new_users artık kalıcı hesap sayısı; misafir başlangıçları new_guests sütununda.
CREATE OR REPLACE VIEW analytics.weekly_summary AS
WITH bounds AS (
  -- Kesintisiz takvim haftaları: ilk kayıt, blok, olay ve hesap yükseltmesinden bugüne.
  -- Bir kaynakta satırı olmayan hafta da (örn. yalnız yükseltme düştüğü hafta) görünür.
  SELECT date_trunc('week', LEAST(
           (SELECT min(created_at) FROM public.user_profiles),
           (SELECT min(created_at) FROM public.time_blocks),
           (SELECT min(created_at) FROM public.events)
         )) AS first_week
),
weeks AS (
  SELECT g AS week
  FROM bounds, generate_series(bounds.first_week, date_trunc('week', NOW()), INTERVAL '1 week') g
  WHERE bounds.first_week IS NOT NULL
)
SELECT
  w.week,
  (SELECT count(*) FROM analytics.user_funnel f
     WHERE date_trunc('week', f.registered_at) = w.week)             AS new_users,
  (SELECT count(DISTINCT f.user_id) FROM analytics.user_funnel f
     WHERE date_trunc('week', f.first_block_at) = w.week)            AS activated,
  (SELECT count(DISTINCT b.user_id) FROM public.time_blocks b
     WHERE date_trunc('week', b.created_at) = w.week)                AS planning_wau,
  (SELECT count(DISTINCT t.user_id) FROM public.tasks t
     WHERE date_trunc('week', t.completed_at) = w.week)              AS task_completers,
  (SELECT count(DISTINCT e.user_id) FROM public.events e
     WHERE e.name = 'paywall_view'
       AND date_trunc('week', e.created_at) = w.week)                AS paywall_views,
  (SELECT count(DISTINCT e.user_id) FROM public.events e
     WHERE e.name = 'ai_used'
       AND date_trunc('week', e.created_at) = w.week)                AS ai_users,
  (SELECT count(*) FROM public.events e
     WHERE e.name = 'guest_started'
       AND date_trunc('week', e.created_at) = w.week)                AS new_guests
FROM weeks w
ORDER BY w.week DESC;

-- Misafirden hesaba dönüşüm, haftalık. Silinen kullanıcılar sayıdan düşmez
-- (olay satırları SET NULL ile kalır). Hafta: olayın gerçekleştiği hafta.
CREATE OR REPLACE VIEW analytics.guest_conversion AS
SELECT
  date_trunc('week', created_at)                          AS week,
  count(*) FILTER (WHERE name = 'guest_started')          AS guests_started,
  count(*) FILTER (WHERE name = 'account_upgraded')       AS accounts_upgraded,
  round(100.0 * count(*) FILTER (WHERE name = 'account_upgraded')
        / NULLIF(count(*) FILTER (WHERE name = 'guest_started'), 0), 1) AS conversion_pct,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY (props->>'guest_age_days')::int)
    FILTER (WHERE name = 'account_upgraded')              AS median_guest_age_days
FROM public.events
WHERE name IN ('guest_started', 'account_upgraded')
GROUP BY 1
ORDER BY 1 DESC;

GRANT SELECT ON analytics.user_funnel, analytics.weekly_summary, analytics.guest_conversion
  TO service_role;
