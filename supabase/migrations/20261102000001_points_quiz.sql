-- "Gain Family Points": two review questions a day from the lessons already read, 5 points for each right
-- answer, so points keep coming after every lesson and quiz is done. Questions answered wrong come back the
-- next day, right ones later and later (the app picks them).

create table public.quiz_answers (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  -- The person's own calendar day.
  day date not null,
  -- '<lesson id>:<question index>'
  question_id text not null check (length(question_id) between 3 and 80),
  correct boolean not null,
  answered_at timestamptz not null default now(),
  primary key (user_id, day, question_id)
);

alter table public.quiz_answers enable row level security;
create policy "own rows: read" on public.quiz_answers for select to authenticated
  using (user_id = (select auth.uid()));

-- Answers are saved only through this function, which keeps to two a day.
create function public.answer_points_quiz(p_day date, p_question text, p_correct boolean)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n int;
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  -- The person's day, which is at most a day away from the server's in any time zone.
  if p_day not between current_date - 1 and current_date + 1 then
    raise exception 'wrong_day';
  end if;
  select count(*) into n from public.quiz_answers where user_id = uid and day = p_day;
  if n >= 2 then
    raise exception 'daily_quiz_done';
  end if;
  insert into public.quiz_answers (user_id, day, question_id, correct)
  values (uid, p_day, p_question, p_correct)
  on conflict do nothing;
  return (select count(*) filter (where correct)::int * 5 from public.quiz_answers where user_id = uid and day = p_day);
end;
$$;
revoke execute on function public.answer_points_quiz(date, text, boolean) from public, anon;
grant execute on function public.answer_points_quiz(date, text, boolean) to authenticated;

-- The family board, now with the daily quiz:
--   workout 20 · lesson read 10 · quiz passed 20 · daily quiz right answer 5 · day with a weigh-in 5
--   day with 2+ meals logged 10 · day at the step goal 10
-- A lesson quiz now counts in the week it was passed (it counted in the week the lesson was read).
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
  l as (select r.user_id, count(*)::int n from public.lesson_progress r, since where r.read_at >= since.t group by 1),
  q as (select r.user_id, count(*)::int n from public.lesson_progress r, since where r.quiz_passed_at >= since.t group by 1),
  qa as (select a.user_id, count(*) filter (where a.correct)::int n from public.quiz_answers a, since where a.day >= since.t::date group by 1),
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
      union select user_id, day from public.quiz_answers, since where day >= since.t::date
    ) x group by 1
  )
  select p.id, p.display_name,
    (coalesce(w.n, 0) * 20 + coalesce(l.n, 0) * 10 + coalesce(q.n, 0) * 20 + coalesce(qa.n, 0) * 5
      + coalesce(wd.n, 0) * 5 + coalesce(fd.n, 0) * 10 + coalesce(sd.n, 0) * 10)::int as points,
    coalesce(w.n, 0), coalesce(l.n, 0), coalesce(ad.n, 0),
    p.id = (select auth.uid())
  from players p
  left join w on w.user_id = p.id
  left join l on l.user_id = p.id
  left join q on q.user_id = p.id
  left join qa on qa.user_id = p.id
  left join wd on wd.user_id = p.id
  left join fd on fd.user_id = p.id
  left join sd on sd.user_id = p.id
  left join ad on ad.user_id = p.id
  order by 3 desc, 2;
$$;
