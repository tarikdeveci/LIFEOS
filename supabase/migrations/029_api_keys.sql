-- supabase/migrations/029_api_keys.sql
-- LifeOS API anahtarları: dış otomasyonların (mail → görev) kimlik doğrulaması.
-- Anahtar üretimi ve doğrulama server tarafında (service-role) yapılır.
-- Tam anahtar asla saklanmaz; yalnızca SHA-256 hash'i tutulur.

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,                 -- kullanıcı dostu etiket (ör: "n8n mail otomasyonu")
  key_prefix TEXT NOT NULL,           -- gösterim ipucu (ör: "lifeos_sk_ab12cd…"), gizli değil
  key_hash TEXT NOT NULL UNIQUE,      -- SHA-256(tam anahtar), hex — doğrulama bununla yapılır

  last_used_at TIMESTAMPTZ,           -- son başarılı istek zamanı
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ              -- iptal edilince set edilir; iptal edilen anahtar çalışmaz
);

-- Doğrulama sorgusu: WHERE key_hash = $1 AND revoked_at IS NULL
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_user ON api_keys(user_id);

-- ============================
-- RLS Politikaları
-- ============================
-- Anahtar üretimi/doğrulaması server'da service-role ile yapılır (RLS'i bypass eder).
-- Bu politikalar savunma derinliği + kullanıcının doğrudan istemciden kendi
-- anahtarlarını listeleyebilmesi içindir. key_hash asla istemciye seçtirilmez.
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_select_own" ON api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "api_keys_insert_own" ON api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "api_keys_update_own" ON api_keys
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "api_keys_delete_own" ON api_keys
  FOR DELETE USING (auth.uid() = user_id);
