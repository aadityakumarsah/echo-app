-- Run this in Supabase: SQL Editor → New query → Paste → Run.

CREATE TABLE IF NOT EXISTS public.voice_sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  call_report jsonb
);

CREATE INDEX IF NOT EXISTS voice_sessions_user_id_created_at_idx
  ON public.voice_sessions (user_id, created_at DESC);

ALTER TABLE public.voice_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS voice_sessions_select_own ON public.voice_sessions;

-- Browser clients can read their own session rows (writes go through the API / service role).
CREATE POLICY voice_sessions_select_own
  ON public.voice_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
