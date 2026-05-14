-- workout_programs: kayıtlı antrenman programları (template + user-created)
CREATE TABLE workout_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = global template
  name TEXT NOT NULL,
  description TEXT,
  split_type TEXT NOT NULL DEFAULT 'custom', -- 'bro_split' | 'push_pull_legs' | 'full_body' | 'upper_lower' | 'custom'
  frequency_per_week INT DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE program_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES workout_programs(id) ON DELETE CASCADE,
  day_number INT NOT NULL,  -- 1-7
  day_name TEXT NOT NULL,   -- "Göğüs Günü", "Push", "Tüm Vücut" vb.
  is_rest BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE program_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_day_id UUID NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id),
  sets INT NOT NULL DEFAULT 3,
  reps INT DEFAULT 10,
  rest_seconds INT DEFAULT 90,
  order_index INT DEFAULT 0,
  notes TEXT
);

-- RLS
ALTER TABLE workout_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Programs: read global or own" ON workout_programs FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "Programs: manage own" ON workout_programs FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE program_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Program days: read if program accessible" ON program_days FOR SELECT USING (
  EXISTS (SELECT 1 FROM workout_programs p WHERE p.id = program_id AND (p.user_id IS NULL OR p.user_id = auth.uid()))
);
CREATE POLICY "Program days: manage own program" ON program_days FOR ALL USING (
  EXISTS (SELECT 1 FROM workout_programs p WHERE p.id = program_id AND p.user_id = auth.uid())
);

ALTER TABLE program_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Program exercises: read if day accessible" ON program_exercises FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM program_days pd
    JOIN workout_programs p ON p.id = pd.program_id
    WHERE pd.id = program_day_id AND (p.user_id IS NULL OR p.user_id = auth.uid())
  )
);
CREATE POLICY "Program exercises: manage own" ON program_exercises FOR ALL USING (
  EXISTS (
    SELECT 1 FROM program_days pd
    JOIN workout_programs p ON p.id = pd.program_id
    WHERE pd.id = program_day_id AND p.user_id = auth.uid()
  )
);

CREATE INDEX program_days_program_idx ON program_days(program_id);
CREATE INDEX program_exercises_day_idx ON program_exercises(program_day_id);
CREATE INDEX workout_programs_user_idx ON workout_programs(user_id);
