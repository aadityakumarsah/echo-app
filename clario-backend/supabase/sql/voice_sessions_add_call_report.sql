-- Run in Supabase SQL Editor after voice_sessions.sql (and related migrations).

ALTER TABLE public.voice_sessions
  ADD COLUMN IF NOT EXISTS call_report jsonb;

COMMENT ON COLUMN public.voice_sessions.call_report IS
  'Structured post-session report JSON (generated via POST /sessions/{id}/report).';
