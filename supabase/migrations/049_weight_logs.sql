-- 049_weight_logs.sql
-- Kilo geçmişi: adaptif kalori hedefinin (adaptiveTdee.ts) tek girdisi.
--
-- NEDEN AYRI TABLO, health_daily'e SÜTUN DEĞİL: health_daily.source tüm satırın
-- kaynağını temsil eder (o gün senkronize edilen adım/uyku/nabız hep birlikte
-- gelir). Kilo farklı: kullanıcı manuel girebilir, gün içinde birden fazla kez
-- düzeltebilir, senkron hiç çalışmamış bir günde bile girilebilir. PostgREST
-- upsert'i "yalnızca INSERT'te source yaz, UPDATE'te dokunma" şeklinde ifade
-- edemiyor — aynı satıra yazılırsa manuel bir kilo girişi, o günün asıl
-- kaynağı Apple Health olan adım/uyku verisinin source'unu "manual"a çevirirdi.
-- Ayrı tablo bu çakışmayı baştan ortadan kaldırıyor.
--
-- Şema ve RLS deseni 028_health_metrics.sql (health_daily) ile birebir aynı.

CREATE TABLE IF NOT EXISTS weight_logs (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       DATE NOT NULL,

  weight_kg  NUMERIC(5, 2) NOT NULL CHECK (weight_kg BETWEEN 20 AND 400),

  source     TEXT NOT NULL CHECK (source IN ('apple_health', 'health_connect', 'manual')),
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, date)
);

-- Trend hesabı ve son N günün okunması en sık sorgu
CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date
  ON weight_logs (user_id, date DESC);

DROP TRIGGER IF EXISTS update_weight_logs_updated_at ON weight_logs;
CREATE TRIGGER update_weight_logs_updated_at
  BEFORE UPDATE ON weight_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE weight_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weight_logs_own" ON weight_logs;
CREATE POLICY "weight_logs_own" ON weight_logs
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
