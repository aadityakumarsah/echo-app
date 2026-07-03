-- If you already created voice_sessions without ended_at / duration_seconds, run this once.

ALTER TABLE public.voice_sessions
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_seconds integer;
