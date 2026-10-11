-- 070: Jira / Notion / Microsoft To Do / Slack entegrasyonları kaldırıldı (yalnız Google Takvim
-- ve Todoist içe aktarma kaldı). 058'in kurduğu 15 dakikalık integrations-sync cron'u ve Slack
-- eşleme indeksi artık kullanılmıyor. integrations tablosu ve eski satırlar yerinde kalır.

DROP INDEX IF EXISTS idx_integrations_slack_user;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'integrations-sync') THEN
    PERFORM cron.unschedule('integrations-sync');
  END IF;
END $$;
