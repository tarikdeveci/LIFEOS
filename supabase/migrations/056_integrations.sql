-- 056: Entegrasyon temeli
-- 1) integrations: bağlı dış hesaplar (Google Calendar, Jira, Slack, Notion...). Token'lar
--    tabloda değil Supabase Vault'ta; satır sadece secret_id tutar. İstemci kendi satırını
--    okuyup silebilir, yazma yalnızca sunucuda (service_role).
-- 2) tasks.source / external_id: dışarıdan gelen her görev bu ikiliyle upsert edilir.
--    Inbox API, içe aktarma ve ileride senkronlar aynı mekanizmayı kullanır; aynı görev iki
--    kez gelirse çift kayıt oluşmaz.

-- ============================================================
-- integrations
-- ============================================================
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN (
    'google_calendar', 'jira', 'slack', 'notion', 'todoist', 'ticktick', 'microsoft_todo'
  )),
  account_label TEXT NOT NULL DEFAULT '' CHECK (char_length(account_label) <= 200),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'revoked')),
  secret_id UUID,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  sync_cursor TEXT,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT integrations_account_unique UNIQUE (user_id, provider, account_label)
);

CREATE INDEX IF NOT EXISTS idx_integrations_user ON integrations(user_id);

DROP TRIGGER IF EXISTS update_integrations_updated_at ON integrations;
CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integrations_select_own" ON integrations;
CREATE POLICY "integrations_select_own" ON integrations
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "integrations_delete_own" ON integrations;
CREATE POLICY "integrations_delete_own" ON integrations
  FOR DELETE USING (auth.uid() = user_id);

-- secret_id istemciye gitmesin: SELECT izni kolon bazında.
REVOKE ALL ON integrations FROM anon, authenticated;
GRANT SELECT (id, user_id, provider, account_label, status, settings, last_synced_at, last_error, created_at, updated_at)
  ON integrations TO authenticated;
GRANT DELETE ON integrations TO authenticated;

-- ============================================================
-- Vault yardımcıları (yalnızca service_role)
-- ============================================================

-- Token'ı yazar (varsa değiştirir), secret_id'yi satıra bağlar.
CREATE OR REPLACE FUNCTION public.integration_set_secret(p_integration UUID, p_secret TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE
  v_secret UUID;
BEGIN
  SELECT secret_id INTO v_secret FROM integrations WHERE id = p_integration FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'integration not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_secret IS NULL THEN
    v_secret := vault.create_secret(p_secret, 'integration:' || p_integration::text);
    UPDATE integrations SET secret_id = v_secret WHERE id = p_integration;
  ELSE
    PERFORM vault.update_secret(v_secret, p_secret);
  END IF;
  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.integration_get_secret(p_integration UUID)
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER SET search_path = public, vault AS $$
  SELECT ds.decrypted_secret
  FROM integrations i
  JOIN vault.decrypted_secrets ds ON ds.id = i.secret_id
  WHERE i.id = p_integration;
$$;

-- Satır silinince (bağlantıyı kes, hesap silme kaskadı) token da Vault'tan gider.
CREATE OR REPLACE FUNCTION public.integration_drop_secret()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
BEGIN
  IF OLD.secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = OLD.secret_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS integrations_drop_secret ON integrations;
CREATE TRIGGER integrations_drop_secret
  AFTER DELETE ON integrations
  FOR EACH ROW EXECUTE FUNCTION public.integration_drop_secret();

REVOKE ALL ON FUNCTION public.integration_set_secret(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.integration_get_secret(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.integration_drop_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integration_set_secret(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.integration_get_secret(UUID) TO service_role;

-- ============================================================
-- tasks: dış kaynak kimliği
-- ============================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS source TEXT CHECK (source IS NULL OR char_length(source) <= 40),
  ADD COLUMN IF NOT EXISTS external_id TEXT CHECK (external_id IS NULL OR char_length(external_id) <= 200),
  ADD COLUMN IF NOT EXISTS external_url TEXT CHECK (external_url IS NULL OR char_length(external_url) <= 2000),
  ADD COLUMN IF NOT EXISTS external_updated_at TIMESTAMPTZ;

-- Kısmi değil, düz tekil kısıt: PostgREST'in on_conflict'i kısmi indeksi kullanamıyor.
-- NULL'lar birbirine eşit sayılmadığı için external_id'siz görevler etkilenmez.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_external_unique') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_external_unique UNIQUE (user_id, source, external_id);
  END IF;
END;
$$;
