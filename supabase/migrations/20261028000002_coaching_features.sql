-- Weekday schedule, weekly calorie check-ins, activities, progress photos,
-- guided lessons and plan versions.

-- ---------------------------------------------------------------------------
-- Weekday schedule (0 = Monday … 6 = Sunday; null = no fixed day, just rotate)
-- ---------------------------------------------------------------------------
alter table public.workout_templates
  add column weekday smallint check (weekday between 0 and 6);

-- ---------------------------------------------------------------------------
-- Weekly calorie check-in: an adjustment on top of the estimated energy needs
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column kcal_adjust int not null default 0 check (kcal_adjust between -1000 and 1000),
  add column kcal_checkin_at timestamptz;

-- ---------------------------------------------------------------------------
-- Activities (walks, rides…) synced from Apple Health / Health Connect
-- ---------------------------------------------------------------------------
create table public.activities (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  -- walking | running | cycling | swimming | hiking | other
  kind text not null default 'other',
  title text,
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default now(),
  unique (user_id, started_at, source)
);
create index activities_user_time on public.activities (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Progress photos (private bucket, one folder per person)
-- ---------------------------------------------------------------------------
create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  taken_at timestamptz not null default now(),
  path text not null,
  weight_kg numeric(5, 2),
  note text,
  created_at timestamptz not null default now()
);
create index progress_photos_user_time on public.progress_photos (user_id, taken_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "progress photos: own folder read" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "progress photos: own folder write" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "progress photos: own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Guided lessons: which infographics have been read
-- ---------------------------------------------------------------------------
create table public.lesson_progress (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  lesson_id text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- ---------------------------------------------------------------------------
-- Plan versions: every change to a workout keeps the previous version
-- ---------------------------------------------------------------------------
create table public.workout_template_versions (
  id bigint generated always as identity primary key,
  template_id uuid not null references public.workout_templates on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  notes text,
  weekday smallint,
  exercises jsonb not null,
  saved_at timestamptz not null default now()
);
create index workout_template_versions_template on public.workout_template_versions (template_id, saved_at desc);

create function public.keep_template_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.exercises is distinct from new.exercises
     or old.name is distinct from new.name
     or old.weekday is distinct from new.weekday then
    insert into public.workout_template_versions (template_id, user_id, name, notes, weekday, exercises, saved_at)
    values (old.id, old.user_id, old.name, old.notes, old.weekday, old.exercises, old.updated_at);
  end if;
  return new;
end;
$$;

create trigger workout_templates_version before update on public.workout_templates
  for each row execute function public.keep_template_version();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.activities enable row level security;
alter table public.progress_photos enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.workout_template_versions enable row level security;

create policy "own rows" on public.activities for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.progress_photos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.lesson_progress for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own versions: read" on public.workout_template_versions for select to authenticated
  using (user_id = (select auth.uid()));
