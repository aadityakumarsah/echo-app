-- Run this in: Supabase Dashboard → SQL Editor → New Query

create table if not exists subscriptions (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id  text,
  stripe_subscription_id text,
  plan                text,         -- 'weekly' | 'monthly' | 'yearly'
  status              text,         -- 'active' | 'trialing' | 'canceled' | 'past_due'
  current_period_end  bigint        -- Unix timestamp (seconds)
);

-- Row-level security: users can only read their own row
alter table subscriptions enable row level security;

create policy "Users can read own subscription"
  on subscriptions for select
  using (auth.uid() = user_id);

-- Service role (backend) bypasses RLS automatically — no extra policy needed.

-- ── Daily Checks ──────────────────────────────────────────────────────────────

create table if not exists daily_checks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  check_date   date not null,
  morning      boolean not null default false,
  refill       boolean not null default false,
  night        boolean not null default false,
  day_complete boolean not null default false,
  completed_at timestamptz,
  unique (user_id, check_date)
);

alter table daily_checks enable row level security;

create policy "Users can read own daily_checks"
  on daily_checks for select
  using (auth.uid() = user_id);

-- ── User Streaks ───────────────────────────────────────────────────────────────

create table if not exists user_streaks (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  current_streak  int not null default 0,
  longest_streak  int not null default 0,
  last_check_date date
);

alter table user_streaks enable row level security;

create policy "Users can read own streak"
  on user_streaks for select
  using (auth.uid() = user_id);
