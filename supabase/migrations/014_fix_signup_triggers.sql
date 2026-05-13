-- supabase/migrations/014_fix_signup_triggers.sql
-- Fix: auth.uid() returns NULL during trigger execution, causing RLS INSERT
-- policies to reject inserts made by on_auth_user_created triggers.
-- Solution: allow inserts when pg_trigger_depth() > 0 (inside a trigger).

-- ============================================================
-- 1. Fix handle_new_user: add ON CONFLICT + SET search_path
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name, timezone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'timezone', 'Europe/Istanbul')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user error: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 2. Fix create_default_subscription: add SET search_path
-- ============================================================
CREATE OR REPLACE FUNCTION create_default_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, status, plan)
  VALUES (NEW.id, 'free', 'free')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'create_default_subscription error: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 3. Fix user_profiles INSERT policy
-- ALL policy's implicit WITH CHECK blocks trigger inserts
-- because auth.uid() is NULL in trigger context.
-- ============================================================
DROP POLICY IF EXISTS "Users can CRUD own profile" ON user_profiles;

CREATE POLICY "profiles_select"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert"
  ON user_profiles FOR INSERT
  WITH CHECK (
    auth.uid() = id         -- authenticated user creates own profile
    OR pg_trigger_depth() > 0  -- system trigger during signup
  );

CREATE POLICY "profiles_update"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_delete"
  ON user_profiles FOR DELETE
  USING (auth.uid() = id);

-- ============================================================
-- 4. Fix subscriptions INSERT policy
-- ============================================================
DROP POLICY IF EXISTS "subscriptions_insert_service" ON subscriptions;

CREATE POLICY "subscriptions_insert"
  ON subscriptions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id       -- authenticated user (shouldn't normally insert directly)
    OR pg_trigger_depth() > 0  -- system trigger during signup
  );
