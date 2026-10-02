CREATE TABLE IF NOT EXISTS public.focus_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block_id UUID REFERENCES public.time_blocks(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 600),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ended_at > started_at)
);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_started
  ON public.focus_sessions(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_block
  ON public.focus_sessions(block_id);

ALTER TABLE public.focus_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "focus_sessions_select_own" ON public.focus_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "focus_sessions_insert_own" ON public.focus_sessions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND (block_id IS NULL OR EXISTS (
      SELECT 1 FROM public.time_blocks b WHERE b.id = block_id AND b.user_id = auth.uid()
    ))
    AND (task_id IS NULL OR EXISTS (
      SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid()
    ))
  );

CREATE POLICY "focus_sessions_delete_own" ON public.focus_sessions
  FOR DELETE USING (auth.uid() = user_id);
