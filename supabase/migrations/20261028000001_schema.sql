-- Forza! database schema.
-- Every table is protected by row-level security: a signed-in person can only
-- read and write their own rows. The administrator uses the service-role key
-- (kept in the macOS Keychain, see admin/) which bypasses RLS.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  locale text not null default 'en' check (locale in ('en', 'it')),
  sex text check (sex in ('male', 'female')),
  birth_year int check (birth_year between 1900 and 2100),
  height_cm numeric(5, 1) check (height_cm between 100 and 250),
  goal text check (goal in ('fat_loss', 'muscle_gain', 'maintain')),
  activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  experience text not null default 'beginner' check (experience in ('beginner', 'intermediate')),
  start_weight_kg numeric(5, 2),
  target_weight_kg numeric(5, 2),
  workouts_per_week int not null default 3 check (workouts_per_week between 1 and 7),
  steps_goal int not null default 7000 check (steps_goal between 1000 and 30000),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A profile row is created automatically for every new account.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'en')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Body weight and daily steps
-- ---------------------------------------------------------------------------
create table public.body_weights (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  measured_at timestamptz not null,
  weight_kg numeric(5, 2) not null check (weight_kg between 20 and 400),
  body_fat_pct numeric(4, 1) check (body_fat_pct between 1 and 80),
  -- manual | apple_health | health_connect | eufy_csv | import
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (user_id, measured_at, source)
);
create index body_weights_user_time on public.body_weights (user_id, measured_at desc);

create table public.daily_steps (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  steps int not null check (steps between 0 and 200000),
  source text not null default 'manual',
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- Exercises: the built-in catalogue ships with the app (app/src/data/exercises.ts).
-- Here we only keep custom exercises and administrator overrides (e.g. a video link).
-- ---------------------------------------------------------------------------
create table public.custom_exercises (
  id text primary key default ('c_' || replace(gen_random_uuid()::text, '-', '')),
  -- null owner = shared with everyone (created by the administrator)
  owner_id uuid default auth.uid() references auth.users on delete cascade,
  name_en text not null,
  name_it text,
  muscles text[] not null default '{}',
  equipment text not null default 'other',
  kind text not null default 'reps' check (kind in ('reps', 'bodyweight', 'time', 'cardio')),
  steps_en text[] not null default '{}',
  steps_it text[] not null default '{}',
  image_urls text[] not null default '{}',
  video_url text,
  created_at timestamptz not null default now()
);

create table public.exercise_overrides (
  exercise_id text primary key,
  video_url text,
  note_en text,
  note_it text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Workouts
-- ---------------------------------------------------------------------------
create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  notes text,
  position int not null default 0,
  -- [{ exercise_id, sets, rep_min, rep_max, rest_s, target_kg, note }]
  exercises jsonb not null default '[]'::jsonb,
  managed_by_admin boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workout_templates_user on public.workout_templates (user_id, position);
create trigger workout_templates_touch before update on public.workout_templates
  for each row execute function public.touch_updated_at();

create table public.workout_sessions (
  -- generated on the phone so a workout saved offline can be retried safely
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  template_id uuid references public.workout_templates on delete set null,
  name text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  effort int check (effort between 1 and 10),
  notes text,
  source text not null default 'app',
  created_at timestamptz not null default now()
);
create index workout_sessions_user_time on public.workout_sessions (user_id, started_at desc);

create table public.set_logs (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.workout_sessions on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  exercise_id text not null,
  exercise_order int not null default 0,
  set_index int not null,
  weight_kg numeric(6, 2),
  reps int check (reps between 0 and 1000),
  duration_s int check (duration_s between 0 and 86400),
  -- reps in reserve: how many more reps were left in the tank (0 = all-out)
  rir int check (rir between 0 and 10),
  is_warmup boolean not null default false,
  performed_at timestamptz not null default now(),
  unique (session_id, exercise_order, set_index)
);
create index set_logs_user_exercise on public.set_logs (user_id, exercise_id, performed_at desc);

-- Saves a whole workout in one transaction (idempotent: safe to retry).
create function public.save_workout(p_session jsonb, p_sets jsonb)
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

-- ---------------------------------------------------------------------------
-- Food log and AI usage
-- ---------------------------------------------------------------------------
create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  eaten_at timestamptz not null default now(),
  meal text not null default 'snack' check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  title text not null,
  -- [{ name, grams, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g }]
  items jsonb not null default '[]'::jsonb,
  kcal numeric(7, 1) not null default 0,
  protein_g numeric(6, 1) not null default 0,
  carbs_g numeric(6, 1) not null default 0,
  fat_g numeric(6, 1) not null default 0,
  fiber_g numeric(6, 1) not null default 0,
  sugar_g numeric(6, 1) not null default 0,
  score_fat_loss int check (score_fat_loss between 0 and 100),
  score_muscle_gain int check (score_muscle_gain between 0 and 100),
  photo_path text,
  -- ai | manual
  source text not null default 'manual',
  ai_notes text,
  created_at timestamptz not null default now()
);
create index food_logs_user_time on public.food_logs (user_id, eaten_at desc);

-- Written only by the food-estimate function (service role), read by the owner.
create table public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  calls int not null default 0,
  primary key (user_id, day)
);

create function public.bump_ai_usage(p_user uuid, p_limit int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  insert into public.ai_usage (user_id, day, calls)
  values (p_user, current_date, 1)
  on conflict (user_id, day) do update set calls = public.ai_usage.calls + 1
  returning calls into n;
  if n > p_limit then
    raise exception 'daily_limit_reached';
  end if;
  return n;
end;
$$;
revoke execute on function public.bump_ai_usage(uuid, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Check-ins (how do you feel?) and health-sync tokens
-- ---------------------------------------------------------------------------
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  waist_cm numeric(5, 1) check (waist_cm between 30 and 250),
  energy int check (energy between 1 and 5),
  sleep int check (sleep between 1 and 5),
  mood int check (mood between 1 and 5),
  notes text,
  snapshot jsonb
);
create index checkins_user_time on public.checkins (user_id, created_at desc);

-- The Apple Shortcut and the Android helper authenticate with a personal sync key.
-- Only its SHA-256 hash is stored.
create table public.sync_tokens (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.body_weights enable row level security;
alter table public.daily_steps enable row level security;
alter table public.custom_exercises enable row level security;
alter table public.exercise_overrides enable row level security;
alter table public.workout_templates enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.set_logs enable row level security;
alter table public.food_logs enable row level security;
alter table public.ai_usage enable row level security;
alter table public.checkins enable row level security;
alter table public.sync_tokens enable row level security;

create policy "own profile: read" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Standard "only my rows" policies for the per-person tables.
do $$
declare
  t text;
begin
  foreach t in array array['body_weights', 'daily_steps', 'workout_templates', 'workout_sessions',
                           'set_logs', 'food_logs', 'checkins', 'sync_tokens']
  loop
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

create policy "own usage: read" on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));

create policy "shared or own: read" on public.custom_exercises for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy "own: write" on public.custom_exercises for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "everyone: read" on public.exercise_overrides for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Food photos (private bucket, one folder per person)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-photos', 'food-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "food photos: own folder read" on storage.objects for select to authenticated
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "food photos: own folder write" on storage.objects for insert to authenticated
  with check (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "food photos: own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
