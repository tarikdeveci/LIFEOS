-- supabase/migrations/013_subscriptions.sql
-- LifeOS abonelik sistemi: Free ve Pro planlar

-- ============================
-- Abonelik durumu enum
-- ============================
CREATE TYPE subscription_status AS ENUM (
  'free',
  'pro_monthly',
  'pro_annual',
  'cancelled',
  'past_due'
);

-- ============================
-- Abonelikler tablosu
-- ============================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  status subscription_status DEFAULT 'free' NOT NULL,
  plan TEXT DEFAULT 'free' NOT NULL, -- 'free' | 'pro_monthly' | 'pro_annual'

  -- İyzico referansları
  iyzico_subscription_reference_code TEXT,
  iyzico_customer_reference_code TEXT,
  iyzico_token TEXT,

  -- Fiyat ve para birimi
  price_usd NUMERIC(10, 2),
  currency TEXT DEFAULT 'USD',

  -- Dönem
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,

  -- İptal
  cancelled_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,

  -- Deneme
  trial_ends_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX subscriptions_user_id_idx ON subscriptions(user_id);

-- ============================
-- Ödeme geçmişi
-- ============================
CREATE TABLE payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id),

  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL, -- 'success' | 'failure' | 'pending'

  -- İyzico
  iyzico_payment_id TEXT,
  iyzico_payment_transaction_id TEXT,
  iyzico_conversation_id TEXT,

  plan TEXT,
  description TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================
-- updated_at trigger
-- ============================
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================
-- RLS Politikaları
-- ============================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- Kullanıcı sadece kendi aboneliğini görebilir
CREATE POLICY "subscriptions_select_own" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Sadece service role yazabilir (edge functions, webhooks)
CREATE POLICY "subscriptions_insert_service" ON subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "subscriptions_update_service" ON subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

-- Ödeme geçmişi: sadece okuma
CREATE POLICY "payment_history_select_own" ON payment_history
  FOR SELECT USING (auth.uid() = user_id);

-- ============================
-- Mevcut kullanıcılar için free subscription oluştur
-- ============================
INSERT INTO subscriptions (user_id, status, plan)
SELECT id, 'free', 'free'
FROM auth.users
ON CONFLICT DO NOTHING;

-- ============================
-- Yeni kayıt olan kullanıcılar için otomatik free subscription
-- ============================
CREATE OR REPLACE FUNCTION create_default_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO subscriptions (user_id, status, plan)
  VALUES (NEW.id, 'free', 'free')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_default_subscription();

-- ============================
-- Helper: Kullanıcının Pro olup olmadığını kontrol et
-- ============================
CREATE OR REPLACE FUNCTION is_pro_user(check_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = check_user_id
      AND status IN ('pro_monthly', 'pro_annual')
      AND (current_period_end IS NULL OR current_period_end > NOW())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
