-- ============================================================================
-- Migration: manual cycle overrides + learning
-- Run once in Supabase (SQL Editor). Safe to run more than once.
-- ============================================================================

-- Learned luteal-phase length (days from ovulation to next period). Used to
-- place ovulation/fertile windows; refined when the user logs real ovulation.
alter table public.users add column if not exists luteal_length int not null default 14;

-- Manually logged phase segments. These override predictions on the days they
-- cover, and feed the learning routine.
create table if not exists public.cycle_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  phase      text not null check (phase in ('period','fertile','ovulation','follicular','luteal')),
  start_date date not null,
  end_date   date not null,
  created_at timestamptz not null default now()
);
create index if not exists cycle_events_user_idx on public.cycle_events(user_id, start_date desc);

alter table public.cycle_events enable row level security;
drop policy if exists "allow_all_cycle_events" on public.cycle_events;
create policy "allow_all_cycle_events" on public.cycle_events for all using (true) with check (true);

grant all privileges on public.cycle_events to anon, authenticated;
