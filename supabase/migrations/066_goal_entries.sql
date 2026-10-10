-- 066: Elle girilen hedef ilerlemesi ("50 km", "10 kitap").
-- Sayilabilir hedefte miktar = gorevlerden gelen + bu kayitlarin periyot icindeki toplami;
-- count_mode 'units' yalnizca kayitlari sayar (shared utils/goals.ts).
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_count_mode_check;
ALTER TABLE goals ADD CONSTRAINT goals_count_mode_check
  CHECK (count_mode IN ('tasks', 'hours', 'units'));

CREATE TABLE IF NOT EXISTS goal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0 AND amount <= 100000),
  entry_date DATE NOT NULL,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_entries_goal_date ON goal_entries(goal_id, entry_date);
ALTER TABLE goal_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS goal_entries_own ON goal_entries;
CREATE POLICY goal_entries_own ON goal_entries
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM goals g WHERE g.id = goal_id AND g.user_id = auth.uid()
  ));
