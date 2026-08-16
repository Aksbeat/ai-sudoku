-- Run this in your Supabase project: SQL Editor -> New query -> paste & run.
create table if not exists public.scores (
  id        bigint generated always as identity primary key,
  date      text     not null,
  name      text     not null,
  timeMs    bigint   not null,
  difficulty text,
  mode      text,
  ts        timestamptz default now()
);

create index if not exists scores_date_time_idx on public.scores (date, timeMs);

alter table public.scores enable row level security;

-- Allow anyone (the app, no login) to read scores
drop policy if exists "anon read scores" on public.scores;
create policy "anon read scores"
  on public.scores for select
  using (true);

-- Allow anyone to submit a score (no login)
drop policy if exists "anon insert scores" on public.scores;
create policy "anon insert scores"
  on public.scores for insert
  with check (true);
