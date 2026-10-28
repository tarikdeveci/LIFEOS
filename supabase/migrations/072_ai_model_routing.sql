-- 072: AI model yonlendirme, net gelir butcesi ve yedek zinciri
--
--   1. ai_models: model katalogu (fiyat, saglayici, ek parametreler)
--   2. ai_model_routes: hangi AI isi hangi modelde (birinci + yedek)
--   3. subscriptions: net aylik gelir ve elle butce
--   4. events: ai_fallback_notified adi
--   5. analytics.ai_route_health gorunumu
--
-- Hepsi idempotent. Iki tabloya yalniz service role erisir (RLS acik, politika
-- yok): api_key_secret ve base_url kisitlari, tabloya yazabilen birinin ornegin
-- SUPABASE_SERVICE_ROLE_KEY'i kendi sunucusuna gondermesini engeller.

-- ============================================================
-- 1. ai_models
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_models (
  id                    text PRIMARY KEY,
  provider              text NOT NULL CHECK (provider IN ('anthropic', 'openai_compat')),
  api_model             text NOT NULL,
  base_url              text CHECK (base_url IS NULL OR base_url ~ '^https://'),
  api_key_secret        text NOT NULL CHECK (api_key_secret ~ '^AI_KEY_[A-Z0-9_]+$'),
  input_per_mtok        numeric NOT NULL CHECK (input_per_mtok >= 0),
  output_per_mtok       numeric NOT NULL CHECK (output_per_mtok >= 0),
  cached_input_per_mtok numeric CHECK (cached_input_per_mtok IS NULL OR cached_input_per_mtok >= 0),
  extra_params          jsonb NOT NULL DEFAULT '{}',
  enabled               boolean NOT NULL DEFAULT true,
  CHECK (provider <> 'openai_compat' OR base_url IS NOT NULL)
);

-- ============================================================
-- 2. ai_model_routes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_model_routes (
  route          text PRIMARY KEY,
  primary_model  text NOT NULL REFERENCES public.ai_models(id),
  fallback_model text REFERENCES public.ai_models(id),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS ai_model_routes_updated_at ON public.ai_model_routes;
CREATE TRIGGER ai_model_routes_updated_at
  BEFORE UPDATE ON public.ai_model_routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_routes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_models, public.ai_model_routes FROM anon, authenticated;

-- ============================================================
-- Ilk veri: bugunku modellerle birebir
-- ============================================================
INSERT INTO public.ai_models
  (id, provider, api_model, api_key_secret, input_per_mtok, output_per_mtok, extra_params)
VALUES
  ('opus-5',           'anthropic', 'claude-opus-5',   'AI_KEY_ANTHROPIC', 5, 25, '{"output_config":{"effort":"low"}}'),
  ('opus-5-nothink',   'anthropic', 'claude-opus-5',   'AI_KEY_ANTHROPIC', 5, 25, '{"thinking":{"type":"disabled"}}'),
  ('sonnet-5',         'anthropic', 'claude-sonnet-5', 'AI_KEY_ANTHROPIC', 2, 10, '{"output_config":{"effort":"low"}}'),
  ('sonnet-5-nothink', 'anthropic', 'claude-sonnet-5', 'AI_KEY_ANTHROPIC', 2, 10, '{"thinking":{"type":"disabled"}}'),
  ('opus-4-6',         'anthropic', 'claude-opus-4-6', 'AI_KEY_ANTHROPIC', 5, 25, '{"temperature":0}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ai_model_routes (route, primary_model, fallback_model)
VALUES
  ('daily_plan', 'sonnet-5-nothink', NULL),
  ('replan', 'opus-5', 'sonnet-5'),
  ('brain_dump', 'opus-5-nothink', 'sonnet-5-nothink'),
  ('task_priority', 'sonnet-5-nothink', NULL),
  ('workout_plan', 'opus-5', 'sonnet-5'),
  ('workout_program_chat', 'opus-5', 'sonnet-5'),
  ('nutrition_chat', 'opus-5', 'sonnet-5'),
  ('life_setup', 'opus-5', 'sonnet-5'),
  ('daily_report', 'opus-5', 'sonnet-5'),
  ('meal_extract', 'opus-4-6', 'sonnet-5-nothink'),
  ('meal_verify', 'sonnet-5-nothink', NULL),
  ('meal_portion', 'sonnet-5-nothink', NULL),
  ('meal_estimate', 'opus-4-6', 'sonnet-5-nothink')
ON CONFLICT (route) DO NOTHING;

-- ============================================================
-- 3. subscriptions: net gelir ve elle butce
-- ============================================================
-- net_monthly_usd: vergi ve magaza payi dusulmus aylik net gelir (USD).
-- ai_budget_override_usd: elle verilen hesaplar icin sabit aylik AI butcesi.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS net_monthly_usd numeric,
  ADD COLUMN IF NOT EXISTS ai_budget_override_usd numeric;

-- Mevcut RevenueCat aboneleri: price_usd (islemin brut USD fiyati) varsayilan
-- oranlarla (vergi 0,167, magaza payi 0,15) aylik nete cevrilir. Sandbox gercek
-- gelir degil. Iptal ya da iade izi tasiyan satir (cancelled_at) iade edilmis
-- olabilir: doldurulmaz, varsayilan butcede kalir. Yeni olaylar webhook'tan
-- kesin oranlarla yazar.
UPDATE public.subscriptions
SET net_monthly_usd = price_usd * (1 - 0.167 - 0.15) / CASE WHEN status = 'pro_annual' THEN 12 ELSE 1 END
WHERE net_monthly_usd IS NULL
  AND price_usd > 0
  AND is_sandbox = false
  AND cancelled_at IS NULL
  AND status IN ('pro_monthly', 'pro_annual');

-- ============================================================
-- 4. events: yedek mod bildirimi
-- ============================================================
-- Canli tanim 040'taki ile ayni (paywall_view, ai_used); ikisi korunur.
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_name_check;
ALTER TABLE public.events ADD CONSTRAINT events_name_check CHECK (name IN (
  'paywall_view',
  'ai_used',
  'ai_fallback_notified'
));

-- Bildirim kilidi atomik: kullanici basina ayda en fazla bir satir. props.month
-- 'YYYY-MM' (UTC). Es zamanli iki istekten ikincisi unique ihlaliyle reddedilir.
CREATE UNIQUE INDEX IF NOT EXISTS events_ai_fallback_month_uq
  ON public.events (user_id, (props->>'month'))
  WHERE name = 'ai_fallback_notified';

-- ============================================================
-- 5. analytics.ai_route_health
-- ============================================================
-- Rota, model, mod ve ay bazinda: cagri, maliyet, ayristirma basarisi ve
-- dusunme payi (gorunen cikti karakteri / cikti token'i).
-- events_insert_own kullanicinin kendi ai_used satirini yazmasina izin verir:
-- tur kontrolsuz cast tek bir bozuk satirla gorunumu hataya dusururdu (052 ile ayni koruma).
CREATE OR REPLACE VIEW analytics.ai_route_health AS
WITH typed AS (
  SELECT
    created_at,
    props->>'route' AS route,
    props->>'model' AS model,
    props->>'mode'  AS mode,
    CASE WHEN jsonb_typeof(props->'cost_usd') = 'number' THEN (props->>'cost_usd')::numeric END           AS cost_usd,
    CASE WHEN jsonb_typeof(props->'parse_ok') = 'boolean' THEN ((props->>'parse_ok')::boolean)::int END    AS parse_ok,
    CASE WHEN jsonb_typeof(props->'text_chars') = 'number' THEN (props->>'text_chars')::numeric END       AS text_chars,
    CASE WHEN jsonb_typeof(props->'output_tokens') = 'number' THEN (props->>'output_tokens')::numeric END AS output_tokens
  FROM public.events
  WHERE name = 'ai_used'
)
SELECT
  date_trunc('month', created_at)                              AS month,
  route,
  model,
  mode,
  count(*)                                                     AS calls,
  round(sum(cost_usd), 4)                                      AS cost_usd,
  round(avg(cost_usd), 6)                                      AS avg_cost_usd,
  round(avg(parse_ok), 4)                                      AS parse_ok_rate,
  round(sum(text_chars) / NULLIF(sum(output_tokens), 0), 4)    AS chars_per_output_token
FROM typed
GROUP BY 1, 2, 3, 4
ORDER BY 1 DESC, cost_usd DESC NULLS LAST;

GRANT SELECT ON analytics.ai_route_health TO service_role;
