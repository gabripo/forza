-- Motivation features: lesson quizzes, an opt-in family challenge, hiding the training section,
-- and "sync now" requests for Build With Science.

alter table public.profiles
  -- Some people never log training in the app: the Train tab and its cards are hidden for them.
  add column if not exists hide_training boolean not null default false,
  -- Family challenge: only people who opt in appear on the board (and only they can see it).
  add column if not exists challenge_opt_in boolean not null default false,
  -- Build With Science workouts are synced by Forza! Coach; the app shows the state and can ask
  -- for a sync now (Coach picks the request up within a minute when the phone is connected).
  add column if not exists bws_auto_sync boolean not null default false,
  add column if not exists bws_synced_at timestamptz,
  add column if not exists bws_sync_requested_at timestamptz;

alter table public.lesson_progress
  add column if not exists quiz_score int check (quiz_score between 0 and 100),
  add column if not exists quiz_passed_at timestamptz;

-- Points for the family challenge, from activity only (never weight, food details or photos):
--   workout 20 · lesson read 10 · quiz passed 20 · day with a weigh-in 5
--   day with 2+ meals logged 10 · day at the step goal 10
-- Returns the board only to people who joined it; everyone sees names and points, nothing else.
create or replace function public.family_board(p_days int default 7)
returns table (user_id uuid, display_name text, points int, workouts int, lessons int, active_days int, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select challenge_opt_in from public.profiles where id = (select auth.uid())
  ),
  since as (select (now() - make_interval(days => greatest(1, least(p_days, 90)))) as t),
  players as (
    select p.id, p.display_name, p.steps_goal from public.profiles p
    where p.challenge_opt_in and coalesce((select challenge_opt_in from me), false)
  ),
  w as (select s.user_id, count(*)::int n from public.workout_sessions s, since where s.started_at >= since.t group by 1),
  l as (select r.user_id, count(*)::int n, count(r.quiz_passed_at)::int quizzes from public.lesson_progress r, since where r.read_at >= since.t group by 1),
  wd as (select b.user_id, count(distinct b.measured_at::date)::int n from public.body_weights b, since where b.measured_at >= since.t group by 1),
  fd as (
    select f.user_id, count(*)::int n from (
      select user_id, eaten_at::date d from public.food_logs, since where eaten_at >= since.t group by 1, 2 having count(*) >= 2
    ) f group by 1
  ),
  sd as (
    select st.user_id, count(*)::int n from public.daily_steps st join players p on p.id = st.user_id, since
    where st.day >= since.t::date and st.steps >= p.steps_goal group by 1
  ),
  ad as (
    select x.user_id, count(distinct x.d)::int n from (
      select user_id, started_at::date d from public.workout_sessions, since where started_at >= since.t
      union select user_id, eaten_at::date from public.food_logs, since where eaten_at >= since.t
      union select user_id, measured_at::date from public.body_weights, since where measured_at >= since.t
      union select user_id, read_at::date from public.lesson_progress, since where read_at >= since.t
    ) x group by 1
  )
  select p.id, p.display_name,
    (coalesce(w.n, 0) * 20 + coalesce(l.n, 0) * 10 + coalesce(l.quizzes, 0) * 20 + coalesce(wd.n, 0) * 5
      + coalesce(fd.n, 0) * 10 + coalesce(sd.n, 0) * 10)::int as points,
    coalesce(w.n, 0), coalesce(l.n, 0), coalesce(ad.n, 0),
    p.id = (select auth.uid())
  from players p
  left join w on w.user_id = p.id
  left join l on l.user_id = p.id
  left join wd on wd.user_id = p.id
  left join fd on fd.user_id = p.id
  left join sd on sd.user_id = p.id
  left join ad on ad.user_id = p.id
  order by 3 desc, 2;
$$;
revoke execute on function public.family_board(int) from public, anon;
grant execute on function public.family_board(int) to authenticated;
