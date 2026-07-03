-- ─────────────────────────────────────────────────────────────────────────────
-- Clario — Supabase migration
-- Run this entire file in: Supabase Dashboard > SQL Editor > New query
-- ─────────────────────────────────────────────────────────────────────────────

-- ── subscriptions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id               UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id    TEXT,
  stripe_subscription_id TEXT,
  plan                  TEXT,          -- 'weekly' | 'monthly' | 'yearly'
  status                TEXT,          -- 'active' | 'trialing' | 'canceled' | 'past_due' | ...
  current_period_end    BIGINT,        -- Unix timestamp (Stripe current_period_end)
  started_at            BIGINT,        -- Unix timestamp (Stripe start_date, never overwritten)
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Add started_at to existing deployments (safe to run multiple times)
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS started_at BIGINT;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own row (frontend direct queries if needed)
CREATE POLICY "Users read own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Backend uses service_role key → bypasses RLS for writes (no extra policy needed)


-- ── daily_checks ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_checks (
  user_id       UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  check_date    DATE    NOT NULL,
  morning       BOOLEAN NOT NULL DEFAULT FALSE,
  refill        BOOLEAN NOT NULL DEFAULT FALSE,
  night         BOOLEAN NOT NULL DEFAULT FALSE,
  day_complete  BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at  TIMESTAMPTZ,
  PRIMARY KEY (user_id, check_date)
);

ALTER TABLE public.daily_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own daily checks"
  ON public.daily_checks FOR ALL
  USING (auth.uid() = user_id);


-- ── user_streaks ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_streaks (
  user_id         UUID  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak  INTEGER NOT NULL DEFAULT 0,
  longest_streak  INTEGER NOT NULL DEFAULT 0,
  last_check_date DATE
);

ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own streaks"
  ON public.user_streaks FOR ALL
  USING (auth.uid() = user_id);


-- ── voice_sessions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.voice_sessions (
  session_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  ended_at          TIMESTAMPTZ,
  duration_seconds  INTEGER,
  call_report       JSONB
);

ALTER TABLE public.voice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sessions"
  ON public.voice_sessions FOR ALL
  USING (auth.uid() = user_id);


-- ── user_settings ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id                UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name                   TEXT        DEFAULT '',
  daily_reminder         BOOLEAN     DEFAULT TRUE,
  streak_notifications   BOOLEAN     DEFAULT TRUE,
  weekly_digest          BOOLEAN     DEFAULT FALSE,
  reminder_time          TEXT        DEFAULT '08:00',
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own settings"
  ON public.user_settings FOR ALL
  USING (auth.uid() = user_id);


-- ── conversation_history ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_history (
  id          BIGSERIAL   PRIMARY KEY,
  session_id  UUID        NOT NULL REFERENCES public.voice_sessions(session_id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL,   -- 'user' | 'assistant'
  message     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.conversation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own conversation history"
  ON public.conversation_history FOR ALL
  USING (auth.uid() = user_id);


-- ── Helper: auto-update updated_at ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
