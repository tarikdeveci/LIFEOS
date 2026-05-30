-- supabase/migrations/019_notification_preferences.sql
-- Bildirim tercihleri ve push token yönetimi

-- ============================
-- Bildirim tercihleri tablosu
-- ============================
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  digest_enabled BOOLEAN DEFAULT true,
  digest_hour INTEGER DEFAULT 8 CHECK (digest_hour >= 0 AND digest_hour <= 23),
  timezone TEXT DEFAULT 'Europe/Istanbul',
  block_reminder_enabled BOOLEAN DEFAULT true,
  block_reminder_minutes INTEGER DEFAULT 15 CHECK (block_reminder_minutes IN (5, 15, 30, 60)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================
-- Push token tablosu
-- ============================
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, platform)
);

-- ============================
-- updated_at trigger
-- ============================
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================
-- RLS
-- ============================
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_preferences_own" ON notification_preferences
  USING (auth.uid() = user_id);

CREATE POLICY "push_tokens_select_own" ON push_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "push_tokens_insert_own" ON push_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_tokens_update_own" ON push_tokens
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "push_tokens_delete_own" ON push_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- ============================
-- Yeni kullanıcı için otomatik tercih oluştur
-- ============================
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_notification_prefs
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_default_notification_preferences();

-- Mevcut kullanıcılar için tercih oluştur
INSERT INTO notification_preferences (user_id)
SELECT id FROM auth.users
ON CONFLICT DO NOTHING;

-- ============================
-- time_blocks için bildirim takip kolonu
-- ============================
ALTER TABLE time_blocks ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ;
