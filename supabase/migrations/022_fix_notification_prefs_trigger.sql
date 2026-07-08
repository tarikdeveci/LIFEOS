-- supabase/migrations/022_fix_notification_prefs_trigger.sql
-- Fix: notification_preferences ALL policy blocks INSERT during signup trigger
-- because auth.uid() is NULL in trigger context → 500 on signup.

-- ============================================================
-- 1. Fix RLS policy: split ALL into per-operation policies
-- ============================================================
DROP POLICY IF EXISTS "notification_preferences_own" ON notification_preferences;

CREATE POLICY "notification_preferences_select" ON notification_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notification_preferences_insert" ON notification_preferences
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR pg_trigger_depth() > 0  -- system trigger during signup
  );

CREATE POLICY "notification_preferences_update" ON notification_preferences
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notification_preferences_delete" ON notification_preferences
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 2. Fix trigger function: add EXCEPTION handling + search_path
-- ============================================================
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'create_default_notification_preferences error: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
