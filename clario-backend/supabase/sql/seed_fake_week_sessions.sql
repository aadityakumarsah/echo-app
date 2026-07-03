-- Seed fake voice sessions + minimal conversation rows for the past 7 calendar days.
-- Run in Supabase SQL Editor as postgres (or service role) so RLS is bypassed.
--
-- Prerequisites:
--   1. `public.voice_sessions` and `public.conversation_history` exist (see sibling SQL files).
--   2. This user_id must exist in auth.users (sign up once or insert a test user).
--
-- Target user:
--   3f8c751c-2fb9-46ff-a182-d7e22a0704a8

BEGIN;

-- Optional: remove a previous seed for the same fixed session ids (safe to run twice)
DELETE FROM public.conversation_history
WHERE session_id IN (
  SELECT unnest(ARRAY[
    'a0000001-0000-4000-8000-000000000001'::uuid,
    'a0000002-0000-4000-8000-000000000002'::uuid,
    'a0000003-0000-4000-8000-000000000003'::uuid,
    'a0000004-0000-4000-8000-000000000004'::uuid,
    'a0000005-0000-4000-8000-000000000005'::uuid,
    'a0000006-0000-4000-8000-000000000006'::uuid,
    'a0000007-0000-4000-8000-000000000007'::uuid
  ])
);

DELETE FROM public.voice_sessions
WHERE session_id IN (
  SELECT unnest(ARRAY[
    'a0000001-0000-4000-8000-000000000001'::uuid,
    'a0000002-0000-4000-8000-000000000002'::uuid,
    'a0000003-0000-4000-8000-000000000003'::uuid,
    'a0000004-0000-4000-8000-000000000004'::uuid,
    'a0000005-0000-4000-8000-000000000005'::uuid,
    'a0000006-0000-4000-8000-000000000006'::uuid,
    'a0000007-0000-4000-8000-000000000007'::uuid
  ])
);

WITH
uid AS (
  SELECT '3f8c751c-2fb9-46ff-a182-d7e22a0704a8'::uuid AS u
),
days AS (
  SELECT *
  FROM (
    VALUES
      ('a0000001-0000-4000-8000-000000000001'::uuid, 6, 5.2::double precision),
      ('a0000002-0000-4000-8000-000000000002'::uuid, 5, 5.8::double precision),
      ('a0000003-0000-4000-8000-000000000003'::uuid, 4, 6.4::double precision),
      ('a0000004-0000-4000-8000-000000000004'::uuid, 3, 7.1::double precision),
      ('a0000005-0000-4000-8000-000000000005'::uuid, 2, 6.0::double precision),
      ('a0000006-0000-4000-8000-000000000006'::uuid, 1, 7.2::double precision),
      ('a0000007-0000-4000-8000-000000000007'::uuid, 0, 6.9::double precision)
  ) AS t(sid, days_ago, mood_avg)
)
INSERT INTO public.voice_sessions (session_id, user_id, created_at, ended_at, duration_seconds, call_report)
SELECT
  d.sid,
  uid.u,
  (date_trunc('day', now()) - (d.days_ago * interval '1 day')) + interval '10 hours',
  (date_trunc('day', now()) - (d.days_ago * interval '1 day')) + interval '10 hours 5 minutes',
  300,
  jsonb_build_object(
    'session_id', d.sid::text,
    'duration_seconds', 300,
    'user_words_spoken', 85,
    'session_overview', jsonb_build_array(
      'I carried a quiet weight and still chose to speak.',
      'Something softened when I named what was true.',
      'I left the session with a little more room to breathe.'
    ),
    'one_word_summary', 'steady',
    'average_mood_rating', d.mood_avg,
    'energy_level', 6,
    'mood_across_session', jsonb_build_array(
      jsonb_build_object('score', 6, 'label', 'calm'),
      jsonb_build_object('score', 7, 'label', 'hopeful')
    ),
    'themes_discussed', jsonb_build_array(
      jsonb_build_object('label', 'Work', 'summary', 'Pacing and deadlines.'),
      jsonb_build_object('label', 'Rest', 'summary', 'Needing permission to stop.')
    ),
    'things_you_did_today', jsonb_build_array(
      jsonb_build_object(
        'narrative',
        'I texted a friend when I felt small, and I took a short walk before dinner.',
        'category', 'social',
        'sentiment', 'positive'
      )
    ),
    'gratitude', jsonb_build_array('Warm tea', 'A clear window'),
    'insights', jsonb_build_array(
      jsonb_build_object('type', 'moment', 'body', 'You noticed tension before it became a story.')
    ),
    'suggestions', jsonb_build_array('Let the next hour be smaller than the whole week.'),
    'personal_reflection',
      'I want to remember that showing up counts even when I do not feel finished. Today I practiced listening to myself without rushing to fix everything.'
  )
FROM days d
CROSS JOIN uid;

INSERT INTO public.conversation_history (session_id, user_id, role, message, created_at)
SELECT
  d.sid,
  uid.u,
  'user',
  'Quick check-in — a lot on my mind today.',
  (date_trunc('day', now()) - (d.days_ago * interval '1 day')) + interval '10 hours'
FROM (
  VALUES
    ('a0000001-0000-4000-8000-000000000001'::uuid, 6),
    ('a0000002-0000-4000-8000-000000000002'::uuid, 5),
    ('a0000003-0000-4000-8000-000000000003'::uuid, 4),
    ('a0000004-0000-4000-8000-000000000004'::uuid, 3),
    ('a0000005-0000-4000-8000-000000000005'::uuid, 2),
    ('a0000006-0000-4000-8000-000000000006'::uuid, 1),
    ('a0000007-0000-4000-8000-000000000007'::uuid, 0)
) AS d(sid, days_ago)
CROSS JOIN (SELECT '3f8c751c-2fb9-46ff-a182-d7e22a0704a8'::uuid AS u) uid;

INSERT INTO public.conversation_history (session_id, user_id, role, message, created_at)
SELECT
  d.sid,
  uid.u,
  'assistant',
  'I am here with you.',
  (date_trunc('day', now()) - (d.days_ago * interval '1 day')) + interval '10 hours 1 second'
FROM (
  VALUES
    ('a0000001-0000-4000-8000-000000000001'::uuid, 6),
    ('a0000002-0000-4000-8000-000000000002'::uuid, 5),
    ('a0000003-0000-4000-8000-000000000003'::uuid, 4),
    ('a0000004-0000-4000-8000-000000000004'::uuid, 3),
    ('a0000005-0000-4000-8000-000000000005'::uuid, 2),
    ('a0000006-0000-4000-8000-000000000006'::uuid, 1),
    ('a0000007-0000-4000-8000-000000000007'::uuid, 0)
) AS d(sid, days_ago)
CROSS JOIN (SELECT '3f8c751c-2fb9-46ff-a182-d7e22a0704a8'::uuid AS u) uid;

COMMIT;
