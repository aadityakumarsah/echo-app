-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Clario App — Supabase Schema                                    ║
-- ║  Paste this entire file into Supabase > SQL Editor > Run         ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ── 1. voice_sessions ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.voice_sessions (
  session_id   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  ended_at     timestamptz,
  duration_seconds integer,
  call_report  jsonb
);

CREATE INDEX IF NOT EXISTS voice_sessions_user_created_idx
  ON public.voice_sessions (user_id, created_at DESC);

ALTER TABLE public.voice_sessions ENABLE ROW LEVEL SECURITY;

-- Users can read their own sessions (mobile fetches via the API, which uses service role,
-- but this policy also allows direct Supabase client reads if needed)
DROP POLICY IF EXISTS "select own sessions"  ON public.voice_sessions;
DROP POLICY IF EXISTS "delete own sessions"  ON public.voice_sessions;

CREATE POLICY "select own sessions"
  ON public.voice_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete their own sessions from the mobile app
CREATE POLICY "delete own sessions"
  ON public.voice_sessions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ── 2. conversation_history ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.conversation_history (
  id          bigserial   PRIMARY KEY,
  session_id  uuid        NOT NULL REFERENCES public.voice_sessions(session_id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  message     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_history_session_idx
  ON public.conversation_history (session_id, created_at ASC);

ALTER TABLE public.conversation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select own conversation" ON public.conversation_history;

CREATE POLICY "select own conversation"
  ON public.conversation_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ── Done ──────────────────────────────────────────────────────────────────────
-- After running this, set these env vars on Render (or .env locally):
--   SUPABASE_URL              = https://<project-ref>.supabase.co
--   SUPABASE_SERVICE_ROLE_KEY = <service_role key from Supabase > Settings > API>
--   SUPABASE_JWT_SECRET       = <JWT secret from Supabase > Settings > API > JWT Settings>
