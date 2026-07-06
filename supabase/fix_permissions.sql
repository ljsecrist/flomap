-- ============================================================================
-- Run this once in Supabase (SQL Editor) to fix:
--   "permission denied for table users"
--
-- The public API role `anon` needs privileges on the tables. This grants them
-- (and sets defaults so any future tables work too). Safe to run repeatedly.
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant all privileges on all tables    in schema public to anon, authenticated;
grant all privileges on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables    to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
