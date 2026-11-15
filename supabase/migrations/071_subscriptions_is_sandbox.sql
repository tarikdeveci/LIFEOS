-- Sandbox (test) alimlari isaretle. Apple incelemecileri sandbox'ta satin alir
-- ve Pro gormeli, o yuzden satir yazilmaya devam eder; ama gelir/donusum
-- raporlari is_sandbox = false ile filtreleyebilsin.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;
