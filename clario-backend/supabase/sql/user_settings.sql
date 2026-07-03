-- Run this in Supabase: SQL Editor → New query → Paste → Run.

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  daily_reminder boolean NOT NULL DEFAULT true,
  streak_notifications boolean NOT NULL DEFAULT true,
  weekly_digest boolean NOT NULL DEFAULT false,
  reminder_time text NOT NULL DEFAULT '08:00',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.user_settings_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_settings_updated_at ON public.user_settings;
CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE PROCEDURE public.user_settings_set_updated_at();

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_settings_select_own ON public.user_settings;
DROP POLICY IF EXISTS user_settings_insert_own ON public.user_settings;
DROP POLICY IF EXISTS user_settings_update_own ON public.user_settings;

-- Logged-in users (e.g. browser client) can only touch their own row.
CREATE POLICY user_settings_select_own
  ON public.user_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY user_settings_insert_own
  ON public.user_settings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_settings_update_own
  ON public.user_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
