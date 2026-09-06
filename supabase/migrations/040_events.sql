-- supabase/migrations/040_events.sql
-- Ürün ölçümü: huninin nerede tıkandığını görmek için.
--
-- NEDEN: Bugüne kadar hiçbir yerde ölçüm yoktu. Kaç kişinin kayıt olup ilk gün
-- planını hiç kurmadığı, paywall'ı kaç kişinin gördüğü, aktivasyon oranının ne
-- olduğu bilinmiyordu — her ürün ve pazarlama kararı tahminle veriliyordu.
--
-- TASARIM KARARI: Önce altı olayı da istemciden yazmak planlanmıştı
-- (register, first_plan, task_done, meal_logged, paywall_view, ai_used).
-- Şema okununca dördünün ZATEN kayıtlı olduğu görüldü:
--
--   register     → user_profiles.created_at
--   first_plan   → min(time_blocks.created_at) per user
--   task_done    → tasks.completed_at
--   meal_logged  → meals.created_at
--
-- Aynı olguyu iki yere yazmak iki sayı üretir; sayılar çeliştiğinde hangisinin
-- doğru olduğu tartışması ölçümün tamamını çöpe atar. Üstelik mevcut sütunlar
-- GERİYE DÖNÜK çalışıyor: bu görünümler kurulduğu an lansmandan bugüne kadarki
-- huni okunabiliyor, yeni veri beklemeye gerek yok.
--
-- Geriye izi olmayan yalnızca iki olay kalıyor; tablo sadece onları tutuyor.
-- Bedeli: task_done/meal_logged için platform (iOS/Android/web) kırılımı yok.
-- Play yayına çıkıp platform karşılaştırması gerektiğinde ilgili tabloya sütun
-- eklenir — o zaman gerçekten eksik olan veri odur.

-- ============================================================
-- 1. Olaylar — yalnızca hiçbir tabloda izi olmayanlar
-- ============================================================
CREATE TABLE events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name       TEXT NOT NULL,
  props      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- KİŞİSEL VERİ YAZILMAZ
  platform   TEXT,                                 -- 'ios' | 'android' | 'web'

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Olay adları serbest metin DEĞİL. Serbest bırakılırsa 'paywall_view',
  -- 'paywallView' ve 'paywall-view' aynı anda birikir ve hiçbir sorgu doğru
  -- sayı vermez. Yeni olay eklemek migration gerektirir — kasıtlı sürtünme.
  CONSTRAINT events_name_check CHECK (name IN (
    'paywall_view',  -- Pro duvarı gösterildi (dönüşümün paydası)
    'ai_used'        -- bir yapay zekâ özelliği çalıştırıldı (Pro'nun değeri)
  ))
);

CREATE INDEX idx_events_name_created ON events(name, created_at DESC);
CREATE INDEX idx_events_user_name ON events(user_id, name, created_at DESC);

-- Olaylar yalnızca YAZILIR. Kullanıcı kendi olaylarını okuyamaz da: istemcinin
-- bu veriye ihtiyacı yok ve okuma açılsa ilk istekte tüm davranış geçmişi
-- cihaza inerdi. Analiz service-role ile yapılır.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_insert_own" ON events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 2. Analiz görünümleri — mevcut tablolardan, geriye dönük
-- ============================================================
-- Ayrı şema: `public` PostgREST üzerinden dışarı açık ve bu görünümlerde RLS
-- yok. `analytics` şeması API'ye açılmadığı için istemci hiçbir koşulda
-- buradan okuyamaz. Sorgular service-role ile (SQL editörü / admin sayfası).
CREATE SCHEMA IF NOT EXISTS analytics;
REVOKE ALL ON SCHEMA analytics FROM anon, authenticated;

-- Kullanıcı başına huni. Her sütun bir huni adımının GERÇEKLEŞTİĞİ an.
CREATE VIEW analytics.user_funnel AS
SELECT
  p.id                                        AS user_id,
  p.created_at                                AS registered_at,
  b.first_block_at,
  t.first_done_at,
  m.first_meal_at,
  pv.first_paywall_at,
  ai.ai_uses,
  -- AKTİVASYON tanımı: kullanıcı en az bir gün bloğu kurmuş. Ürünün vaadi
  -- "gününü kurar" olduğuna göre vaadi almış olmanın en dar tanımı budur.
  (b.first_block_at IS NOT NULL)               AS activated,
  -- Kayıttan aktivasyona geçen süre: onboarding'in ne kadar sürttüğünü gösterir.
  (b.first_block_at - p.created_at)            AS time_to_activate
FROM public.user_profiles p
LEFT JOIN (
  SELECT user_id, min(created_at) AS first_block_at
  FROM public.time_blocks GROUP BY user_id
) b ON b.user_id = p.id
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

-- Haftalık özet — pazartesi sabahı bakılacak beş sayı.
-- Hafta Postgres'te pazartesi başlar; TR için doğru. Saat dilimi UTC:
-- hafta sınırındaki birkaç kayıt kayabilir, trend için önemsiz.
CREATE VIEW analytics.weekly_summary AS
WITH weeks AS (
  SELECT DISTINCT date_trunc('week', created_at) AS week FROM public.user_profiles
  UNION SELECT DISTINCT date_trunc('week', created_at) FROM public.time_blocks
)
SELECT
  w.week,
  (SELECT count(*) FROM public.user_profiles p
     WHERE date_trunc('week', p.created_at) = w.week)                AS new_users,
  (SELECT count(DISTINCT f.user_id) FROM analytics.user_funnel f
     WHERE date_trunc('week', f.first_block_at) = w.week)            AS activated,
  -- KUZEY YILDIZI: o hafta en az bir gün bloğu kurmuş kullanıcı sayısı.
  (SELECT count(DISTINCT b.user_id) FROM public.time_blocks b
     WHERE date_trunc('week', b.created_at) = w.week)                AS planning_wau,
  (SELECT count(DISTINCT t.user_id) FROM public.tasks t
     WHERE date_trunc('week', t.completed_at) = w.week)              AS task_completers,
  (SELECT count(DISTINCT e.user_id) FROM public.events e
     WHERE e.name = 'paywall_view'
       AND date_trunc('week', e.created_at) = w.week)                AS paywall_views,
  (SELECT count(DISTINCT e.user_id) FROM public.events e
     WHERE e.name = 'ai_used'
       AND date_trunc('week', e.created_at) = w.week)                AS ai_users
FROM weeks w
ORDER BY w.week DESC;

-- Kayıt haftasına göre kohort: aktivasyon oranı zamanla iyileşiyor mu?
-- Tek bir toplam oran, onboarding değişikliklerinin etkisini gizler.
CREATE VIEW analytics.signup_cohorts AS
SELECT
  date_trunc('week', registered_at)                              AS cohort_week,
  count(*)                                                       AS users,
  count(*) FILTER (WHERE activated)                              AS activated,
  round(100.0 * count(*) FILTER (WHERE activated) / count(*), 1) AS activation_pct,
  count(*) FILTER (WHERE first_done_at IS NOT NULL)              AS completed_a_task,
  count(*) FILTER (WHERE first_paywall_at IS NOT NULL)           AS saw_paywall,
  -- Aktive olanlar arasında aktivasyonun medyan süresi: onboarding sürtünmesi.
  percentile_cont(0.5) WITHIN GROUP (ORDER BY time_to_activate)
    FILTER (WHERE activated)                                     AS median_time_to_activate
FROM analytics.user_funnel
GROUP BY 1
ORDER BY 1 DESC;

-- Yeni bir şema oluşturulduğunda hiçbir role otomatik erişim almaz —
-- service_role dahil. Grant verilmezse edge function veya API'den okuma
-- "permission denied for schema analytics" ile düşer.
GRANT USAGE ON SCHEMA analytics TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO service_role;
