-- Run after voice_sessions.sql in Supabase: SQL Editor → New query → Paste → Run.

CREATE TABLE IF NOT EXISTS public.conversation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.voice_sessions (session_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_history_session_created_idx
  ON public.conversation_history (session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS conversation_history_user_created_idx
  ON public.conversation_history (user_id, created_at DESC);

ALTER TABLE public.conversation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_history_select_own ON public.conversation_history;

CREATE POLICY conversation_history_select_own
  ON public.conversation_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
