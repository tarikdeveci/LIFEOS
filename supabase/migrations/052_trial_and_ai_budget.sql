-- supabase/migrations/052_trial_and_ai_budget.sql
-- Deneme sürümü, ücretsiz AI planı ve kullanıcı başı AI bütçesi.
--
-- NEDEN: Free kullanıcı ürünün vaadini ("LifeOS gününü kurar") hiç görmüyordu,
-- çünkü AI planlama tamamen Pro'daydı. Pro tarafında ise kota yoktu: sohbet
-- rotaları Opus sınıfı modelde, orta kullanımlı bir Pro kullanıcının aylık AI
-- maliyeti TR fiyatından elde edilen net geliri aşıyordu. Bu migration üç şeyi
-- kuruyor:
--   1. subscriptions satırını istemci yazımına kapatmak (aşağıda, kritik)
--   2. RevenueCat denemesini ve fiyatını satırda tutmak
--   3. ai_allowance(): ücretsiz plan sayacı + bu ayki AI harcaması
--
-- Maliyet için ayrı tablo YOK: her AI çağrısı zaten `events.ai_used` olarak
-- yazılıyor (040). Token ve USD maliyeti o satırın props'una ekleniyor
-- (_shared/ai/usage.ts). 040'taki kural geçerli: aynı olgu tek yerde.

-- ============================================================
-- 1. subscriptions: istemci yalnızca iptal işaretini yazabilir
-- ============================================================
-- 013'teki "subscriptions_update_service" politikası, adının aksine her
-- kullanıcıya kendi satırının TÜM kolonlarını güncelleme izni veriyordu.
-- İstemciden status='pro_annual', current_period_end='2099-01-01' yazmak
-- mümkündü. Bu satır Pro kapısının, ücretsiz planın ve AI bütçesinin tek
-- kaynağı; yazımı yalnızca service role'a (RevenueCat webhook'u, PayTR IPN)
-- kalıyor.
DROP POLICY IF EXISTS "subscriptions_update_service" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_insert_service" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_insert" ON public.subscriptions;

REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM anon, authenticated;

-- Web ayarlarındaki "dönem sonunda iptal et / devam et" düğmesi yalnızca bu
-- kolonu yazıyor. Kolon düzeyinde izin: satırın geri kalanı kapalı.
GRANT UPDATE (cancel_at_period_end) ON public.subscriptions TO authenticated;

CREATE POLICY "subscriptions_update_own_cancel_flag" ON public.subscriptions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Kayıt tetikleyicisi (create_default_subscription, SECURITY DEFINER) için.
-- Kullanıcı rolünün INSERT yetkisi yukarıda kaldırıldı; bu politika yalnızca
-- tetikleyici bağlamında geçerli.
CREATE POLICY "subscriptions_insert_by_trigger" ON public.subscriptions
  FOR INSERT WITH CHECK (pg_trigger_depth() > 0);

-- ============================================================
-- 2. Deneme ve fiyat bilgisi (RevenueCat webhook'u yazar)
-- ============================================================
-- period_type: RevenueCat'in dönem tipi, küçük harfle
--   ('trial' | 'intro' | 'normal' | 'promotional' | 'prepaid').
--   CHECK yok: RevenueCat yeni bir değer eklerse webhook'un upsert'i düşmemeli,
--   düşerse satın alan kullanıcı Pro olamaz.
-- trial_started_at / trial_ends_at / trial_converted_at: deneme hunisi.
--   trial_ends_at 013'ten beri var, ilk kez burada dolduruluyor.
-- price_usd (013'ten beri var): RevenueCat `price`, işlemin USD fiyatı.
--   AI bütçesi bununla ölçekleniyor; denemede 0 geldiği için webhook 0 yazmıyor.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS period_type TEXT,
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_converted_at TIMESTAMPTZ;

-- ============================================================
-- 3. ai_allowance(): ücretsiz plan hakkı + bu ayki AI harcaması
-- ============================================================
-- events tablosu kullanıcıya okunamaz (040); sayaç SECURITY DEFINER ile
-- yalnızca çağıranın kendi satırlarından hesaplanır. Hem edge function'lar
-- (kapı kararı) hem mobil (kalan hak göstergesi) aynı fonksiyonu çağırır.
--
-- Ücretsiz hak: ömür boyu 3 'replan' çağrısı. Pro iken yapılan çağrılar da
-- sayılır; aboneliği biten kullanıcı özelliği zaten tanıyor.
--
-- Maliyet: props.cost_usd yalnızca sayıysa ve negatif değilse toplanır.
-- events'e kullanıcı da yazabildiği (040, insert politikası) için bozuk ya da
-- negatif bir değer bütçeyi büyütememeli.
CREATE OR REPLACE FUNCTION public.ai_allowance()
RETURNS TABLE (free_plans_left INT, month_cost_usd NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    GREATEST(0, 3 - count(*) FILTER (WHERE e.props->>'kind' = 'replan'))::int,
    COALESCE(sum(
      CASE
        WHEN jsonb_typeof(e.props->'cost_usd') = 'number'
         AND e.created_at >= date_trunc('month', now())
        THEN GREATEST((e.props->>'cost_usd')::numeric, 0)
      END
    ), 0)
  FROM events e
  WHERE e.user_id = auth.uid()
    AND e.name = 'ai_used'
$$;

REVOKE ALL ON FUNCTION public.ai_allowance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_allowance() TO authenticated, service_role;

-- ============================================================
-- 4. Analiz görünümleri (service role; 040'taki analytics şeması)
-- ============================================================
-- Deneme hunisi, başlangıç haftasına göre. conversion_pct paydası yalnızca
-- sonuçlanmış denemeler: süresi dolmuş ya da ödemeye dönmüş.
CREATE OR REPLACE VIEW analytics.trial_cohorts AS
SELECT
  date_trunc('week', trial_started_at)                                  AS cohort_week,
  count(*)                                                              AS trials,
  count(*) FILTER (WHERE trial_converted_at IS NOT NULL)                AS converted,
  count(*) FILTER (WHERE trial_converted_at IS NULL
                     AND trial_ends_at > now())                         AS in_trial,
  round(100.0 * count(*) FILTER (WHERE trial_converted_at IS NOT NULL)
        / NULLIF(count(*) FILTER (WHERE trial_converted_at IS NOT NULL
                                     OR trial_ends_at <= now()), 0), 1) AS conversion_pct
FROM public.subscriptions
WHERE trial_started_at IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC;

-- Aylık AI maliyeti: katman (free / trial / pro) ve rota kırılımında.
-- Bütçe varsayılanlarını (AI_BUDGET_SHARE vb.) ayarlamak için okunacak tablo.
CREATE OR REPLACE VIEW analytics.ai_cost_monthly AS
SELECT
  date_trunc('month', created_at)                          AS month,
  COALESCE(props->>'tier', 'unknown')                      AS tier,
  props->>'kind'                                           AS kind,
  count(*)                                                 AS calls,
  count(DISTINCT user_id)                                  AS users,
  round(sum(CASE WHEN jsonb_typeof(props->'cost_usd') = 'number'
                 THEN (props->>'cost_usd')::numeric END), 4) AS cost_usd
FROM public.events
WHERE name = 'ai_used'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, cost_usd DESC NULLS LAST;

-- Kullanıcı başına aylık maliyet: bütçeye kaç kişinin dayandığı buradan görünür.
CREATE OR REPLACE VIEW analytics.ai_cost_by_user AS
SELECT
  date_trunc('month', created_at)                          AS month,
  user_id,
  count(*)                                                 AS calls,
  round(sum(CASE WHEN jsonb_typeof(props->'cost_usd') = 'number'
                 THEN (props->>'cost_usd')::numeric END), 4) AS cost_usd
FROM public.events
WHERE name = 'ai_used'
GROUP BY 1, 2
ORDER BY 1 DESC, cost_usd DESC NULLS LAST;

-- 040'taki toplu GRANT yalnızca o an var olan görünümleri kapsıyordu.
GRANT SELECT ON analytics.trial_cohorts, analytics.ai_cost_monthly, analytics.ai_cost_by_user
  TO service_role;
