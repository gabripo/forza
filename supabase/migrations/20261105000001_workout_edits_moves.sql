-- Workouts on any day: saving a workout again (after changing it, or logging a past one) also changes its date
-- and time; and a planned workout can be moved to another day once ("this Wednesday's Workout B on Thursday").

create or replace function public.save_workout(p_session jsonb, p_sets jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sid uuid := (p_session ->> 'id')::uuid;
  tid uuid;
begin
  select t.id into tid
  from public.workout_templates t
  where t.id = nullif(p_session ->> 'template_id', '')::uuid;

  insert into public.workout_sessions (id, user_id, template_id, name, started_at, finished_at, effort, notes, source)
  values (
    sid,
    auth.uid(),
    tid,
    p_session ->> 'name',
    (p_session ->> 'started_at')::timestamptz,
    (p_session ->> 'finished_at')::timestamptz,
    (p_session ->> 'effort')::int,
    p_session ->> 'notes',
    coalesce(p_session ->> 'source', 'app')
  )
  on conflict (id) do update set
    template_id = excluded.template_id,
    name = excluded.name,
    started_at = excluded.started_at,
    finished_at = excluded.finished_at,
    effort = excluded.effort,
    notes = excluded.notes;

  delete from public.set_logs where session_id = sid;

  insert into public.set_logs (session_id, user_id, exercise_id, exercise_order, set_index, weight_kg, reps, duration_s, rir, is_warmup, performed_at)
  select
    sid,
    auth.uid(),
    s ->> 'exercise_id',
    (s ->> 'exercise_order')::int,
    (s ->> 'set_index')::int,
    (s ->> 'weight_kg')::numeric,
    (s ->> 'reps')::int,
    (s ->> 'duration_s')::int,
    (s ->> 'rir')::int,
    coalesce((s ->> 'is_warmup')::boolean, false),
    coalesce((s ->> 'performed_at')::timestamptz, now())
  from jsonb_array_elements(p_sets) as s;

  return sid;
end;
$$;

-- A planned workout done on another day than its usual one, this time only. The plan keeps its days.
create table public.workout_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  template_id uuid not null references public.workout_templates on delete cascade,
  -- The day it was planned for, and the day it moves to.
  from_day date not null,
  to_day date not null check (to_day <> from_day),
  created_at timestamptz not null default now(),
  unique (user_id, template_id, from_day)
);
create index workout_moves_user_day on public.workout_moves (user_id, to_day);

alter table public.workout_moves enable row level security;
create policy "own rows" on public.workout_moves for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
