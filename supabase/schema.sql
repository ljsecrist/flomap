-- ============================================================================
-- FloMap database schema
-- ============================================================================
-- Run this whole file once in your Supabase project:
--   Supabase Dashboard  ->  SQL Editor  ->  New query  ->  paste  ->  Run
--
-- Notes on security:
--   The app is intentionally low-security (per project spec): passwords are
--   stored in plaintext and Row Level Security is left OPEN so the public
--   "anon" key can read/write. This is fine for a friends-only hobby app but
--   do NOT store anything sensitive here.
-- ============================================================================

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- USERS
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password      text not null,                 -- plaintext by design (see note)
  username      text unique not null,
  avatar_url    text,                          -- compressed base64 data URL
  gender        text not null default 'female' check (gender in ('female','male','other')),
  cycle_length  int  not null default 28,      -- average full-cycle length in days
  period_length int  not null default 5,       -- average bleeding days
  luteal_length int  not null default 14,      -- learned ovulation-to-period gap
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- PERIOD STARTS  (each row is a logged "Day 1"; newest = current anchor)
-- Lets users correct/update Day 1 and keeps history for better prediction.
-- ----------------------------------------------------------------------------
create table if not exists public.period_starts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  start_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, start_date)
);
create index if not exists period_starts_user_idx on public.period_starts(user_id, start_date desc);

-- ----------------------------------------------------------------------------
-- CYCLE EVENTS  (manually logged phase segments; override predictions + train)
-- ----------------------------------------------------------------------------
create table if not exists public.cycle_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  phase      text not null check (phase in ('period','fertile','ovulation','follicular','luteal')),
  start_date date not null,
  end_date   date not null,
  created_at timestamptz not null default now()
);
create index if not exists cycle_events_user_idx on public.cycle_events(user_id, start_date desc);

-- ----------------------------------------------------------------------------
-- FRIENDSHIPS  (one row per relationship; direction = requester -> addressee)
-- ----------------------------------------------------------------------------
create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users(id) on delete cascade,
  addressee_id uuid not null references public.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index if not exists friendships_requester_idx on public.friendships(requester_id);
create index if not exists friendships_addressee_idx on public.friendships(addressee_id);

-- ----------------------------------------------------------------------------
-- COMMENTS  (a "day thread" is just all comments sharing the same day)
-- ----------------------------------------------------------------------------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  day        date not null,
  body       text,
  image_url  text,                             -- compressed base64 data URL
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists comments_day_idx on public.comments(day);
create index if not exists comments_user_idx on public.comments(user_id);

-- ----------------------------------------------------------------------------
-- DERIODS  ("dude periods" a male user can drop on the calendar)
-- ----------------------------------------------------------------------------
create table if not exists public.deriods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  day        date not null,
  note       text,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
create index if not exists deriods_day_idx on public.deriods(day);

-- ============================================================================
-- Row Level Security: enabled with fully-permissive policies.
-- (Turning RLS on but allowing all keeps Supabase's linter happy while still
--  letting the anon key work. Tighten these later if you ever add real auth.)
-- ============================================================================
alter table public.users         enable row level security;
alter table public.period_starts enable row level security;
alter table public.cycle_events  enable row level security;
alter table public.friendships   enable row level security;
alter table public.comments      enable row level security;
alter table public.deriods       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['users','period_starts','cycle_events','friendships','comments','deriods']
  loop
    execute format('drop policy if exists "allow_all_%s" on public.%I;', t, t);
    execute format(
      'create policy "allow_all_%s" on public.%I for all using (true) with check (true);',
      t, t
    );
  end loop;
end $$;

-- ============================================================================
-- Grants: the public API role (`anon`) needs table privileges, otherwise every
-- request fails with "permission denied for table ...". RLS (above) is what
-- actually controls access; these grants just let the role reach the tables.
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant all privileges on all tables    in schema public to anon, authenticated;
grant all privileges on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables    to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- ============================================================================
-- Done. Your FloMap backend is ready. Copy your Project URL + anon key into
-- js/config.js and open the app.
-- ============================================================================
