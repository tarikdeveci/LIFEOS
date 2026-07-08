-- supabase/migrations/021_paytr_integration.sql
-- PayTR ödeme sağlayıcısı için kolon eklemeleri

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS paytr_merchant_oid TEXT;

ALTER TABLE payment_history
  ADD COLUMN IF NOT EXISTS paytr_merchant_oid TEXT;

CREATE INDEX IF NOT EXISTS subscriptions_paytr_merchant_oid_idx
  ON subscriptions (paytr_merchant_oid)
  WHERE paytr_merchant_oid IS NOT NULL;
