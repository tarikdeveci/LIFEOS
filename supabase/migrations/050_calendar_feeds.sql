-- supabase/migrations/050_calendar_feeds.sql
-- Takvim aboneliği (ICS): Google Calendar, Outlook ve Apple Takvim zaman
-- bloklarını kullanıcı başına gizli bir linkten okur. Takvim uygulamaları
-- oturum açamadığı için linkteki token kimlik yerine geçer.
--
-- api_keys (029) ile aynı ilke: token'ın kendisi saklanmaz, yalnızca SHA-256
-- hash'i tutulur. Üretim ve doğrulama web API'sinde service-role ile yapılır;
-- link yalnızca oluşturulduğu an bir kez gösterilir. Kullanıcı başına tek link:
-- yenisi üretilince eskisi çalışmaz.

CREATE TABLE IF NOT EXISTS calendar_feeds (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Takvim uygulamasının linki en son çektiği an; "senkron çalışıyor mu"
  -- sorusunun cevabı olarak ayarlarda gösterilir.
  last_fetched_at TIMESTAMPTZ
);

ALTER TABLE calendar_feeds ENABLE ROW LEVEL SECURITY;

-- Yazma service-role ile yapılır. Bu politikalar savunma derinliği ve
-- kullanıcının kendi linkini istemciden kapatabilmesi içindir.
CREATE POLICY "calendar_feeds_select_own" ON calendar_feeds
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "calendar_feeds_delete_own" ON calendar_feeds
  FOR DELETE USING (auth.uid() = user_id);
