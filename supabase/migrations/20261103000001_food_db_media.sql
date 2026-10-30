-- Exercise photos, GIFs and videos set in Forza! Coach; custom exercises that can be retired; a calorie target
-- set by hand; salt in the food log; the family food database with each person's remembered foods; and good
-- meals in the family challenge.

-- ---------------------------------------------------------------------------
-- Exercise media
-- ---------------------------------------------------------------------------

-- Photos, GIFs and short videos of the exercises, uploaded by Forza! Coach (service role) and shown in the app.
-- Public: they are pictures of exercises, and the app shows them without signing each address.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-media', 'exercise-media', true, 26214400,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;

-- A built-in exercise's own photos, replaced by the coach's (in order; a video plays on its own).
alter table public.exercise_overrides add column if not exists media_urls text[] not null default '{}';
-- A custom exercise already used in a plan or a workout is retired instead of deleted: history keeps its name.
alter table public.custom_exercises add column if not exists archived boolean not null default false;

-- ---------------------------------------------------------------------------
-- Calorie target set by hand, and salt
-- ---------------------------------------------------------------------------

alter table public.profiles
  -- With kcal_source 'manual': the daily calories, set by the person or their coach (macros follow).
  add column if not exists kcal_target int check (kcal_target between 800 and 6000),
  -- Salt (and sodium) in the food log, for people who want it.
  add column if not exists track_salt boolean not null default false;
alter table public.profiles drop constraint if exists profiles_kcal_source_check;
alter table public.profiles add constraint profiles_kcal_source_check check (kcal_source in ('forza', 'bws', 'manual'));

-- Grams of salt in the meal (sodium × 2.5); null when no food in it says.
alter table public.food_logs add column if not exists salt_g numeric(6, 2);

-- ---------------------------------------------------------------------------
-- The family food database
-- ---------------------------------------------------------------------------

-- Foods the family logged that are not in the app's built-in table: products scanned or read from a label,
-- foods typed in, foods the AI recognised. Values per 100 g. Everyone in the project can search them.
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  -- Lower case, no accents: what names are matched on.
  name_key text not null check (length(name_key) between 1 and 160),
  brand text check (length(brand) <= 60),
  barcode text unique check (barcode ~ '^[0-9]{6,14}$'),
  kcal numeric(6, 1) not null check (kcal between 0 and 950),
  protein_g numeric(5, 1) not null default 0 check (protein_g between 0 and 100),
  carbs_g numeric(5, 1) not null default 0 check (carbs_g between 0 and 100),
  fat_g numeric(5, 1) not null default 0 check (fat_g between 0 and 100),
  fiber_g numeric(5, 1) not null default 0 check (fiber_g between 0 and 100),
  sugar_g numeric(5, 1) not null default 0 check (sugar_g between 0 and 100),
  salt_g numeric(5, 2) check (salt_g between 0 and 100),
  portion_g int check (portion_g between 1 and 3000),
  -- barcode | label | manual (typed in) | ai (recognised from a photo or words) | web (Open Food Facts search)
  source text not null check (source in ('barcode', 'label', 'manual', 'ai', 'web')),
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index foods_name_brand on public.foods (name_key, coalesce(brand, '')) where barcode is null;

-- What each person eats and how often: their usual foods come first, and their mozzarella is "the" mozzarella.
create table public.food_memory (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  -- 'b:<built-in food id>' or the id of a row in foods
  food_key text not null check (length(food_key) between 3 and 60),
  uses int not null default 1,
  last_grams int,
  last_used_at timestamptz not null default now(),
  primary key (user_id, food_key)
);

alter table public.foods enable row level security;
alter table public.food_memory enable row level security;
create policy "family: read" on public.foods for select to authenticated using (true);
create policy "own rows: read" on public.food_memory for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows: forget" on public.food_memory for delete to authenticated using (user_id = (select auth.uid()));

-- Saves the foods of a meal just logged: new ones join the family database, and each counts as used once more
-- by this person. Values from a barcode, a label or typed in replace what the AI had guessed; an AI guess never
-- replaces them. Up to 40 foods a call.
--   [{ builtin, grams? }] (a food of the app's table), [{ id, grams? }] (one already in foods), or
--   [{ name, name_key, brand?, barcode?, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g?, portion_g?, source, grams? }]
create function public.remember_foods(p_foods jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  f jsonb;
  fid uuid;
  key text;
  src text;
  code text;
  v_brand text;
  num numeric[];
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  for f in select value from jsonb_array_elements(coalesce(p_foods, '[]'::jsonb)) with ordinality where ordinality <= 40 loop
    if f ? 'builtin' then
      key := 'b:' || left(f ->> 'builtin', 50);
    elsif f ? 'id' then
      continue when coalesce(f ->> 'id', '') !~ '^[0-9a-f-]{36}$';
      select id into fid from public.foods where id = (f ->> 'id')::uuid;
      continue when fid is null;
      key := fid::text;
    else
      continue when coalesce(trim(f ->> 'name'), '') = '' or coalesce(trim(f ->> 'name_key'), '') = '';
      src := case when f ->> 'source' in ('barcode', 'label', 'manual', 'ai', 'web') then f ->> 'source' else 'manual' end;
      code := case when f ->> 'barcode' ~ '^[0-9]{6,14}$' then f ->> 'barcode' end;
      v_brand := nullif(left(trim(coalesce(f ->> 'brand', '')), 60), '');
      num := array[
        least(950, greatest(0, coalesce((f ->> 'kcal')::numeric, 0))),
        least(100, greatest(0, coalesce((f ->> 'protein_g')::numeric, 0))),
        least(100, greatest(0, coalesce((f ->> 'carbs_g')::numeric, 0))),
        least(100, greatest(0, coalesce((f ->> 'fat_g')::numeric, 0))),
        least(100, greatest(0, coalesce((f ->> 'fiber_g')::numeric, 0))),
        least(100, greatest(0, coalesce((f ->> 'sugar_g')::numeric, 0)))];
      fid := null;
      if code is not null then
        select id into fid from public.foods where barcode = code;
      else
        select id into fid from public.foods where name_key = left(lower(trim(f ->> 'name_key')), 160) and coalesce(brand, '') = coalesce(v_brand, '') and barcode is null;
      end if;
      if fid is null then
        insert into public.foods (name, name_key, brand, barcode, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g, portion_g, source, created_by)
        values (left(trim(f ->> 'name'), 120), left(lower(trim(f ->> 'name_key')), 160), v_brand, code, num[1], num[2], num[3], num[4], num[5], num[6],
                least(100, greatest(0, (f ->> 'salt_g')::numeric)), nullif(least(3000, greatest(0, coalesce((f ->> 'portion_g')::int, 0))), 0), src, uid)
        returning id into fid;
      elsif src <> 'ai' then
        update public.foods set kcal = num[1], protein_g = num[2], carbs_g = num[3], fat_g = num[4], fiber_g = num[5], sugar_g = num[6],
          salt_g = coalesce(least(100, greatest(0, (f ->> 'salt_g')::numeric)), salt_g), source = src, updated_at = now()
        where id = fid and (source = 'ai' or src in ('barcode', 'label', 'manual'));
      end if;
      key := fid::text;
    end if;
    insert into public.food_memory (user_id, food_key, uses, last_grams, last_used_at)
    values (uid, key, 1, nullif(least(3000, greatest(0, coalesce((f ->> 'grams')::int, 0))), 0), now())
    on conflict (user_id, food_key) do update
      set uses = public.food_memory.uses + 1, last_grams = coalesce(excluded.last_grams, public.food_memory.last_grams), last_used_at = now();
  end loop;
end;
$$;
revoke execute on function public.remember_foods(jsonb) from public, anon;
grant execute on function public.remember_foods(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Family challenge: good meals count
-- ---------------------------------------------------------------------------

-- The board, now with good meals: a meal scoring 70 or more for the person's goal gives 5 points, up to 3 a day.
--   workout 20 · lesson read 10 · quiz passed 20 · daily quiz right answer 5 · good meal 5 (3 a day)
--   day with a weigh-in 5 · day with 2+ meals logged 10 · day at the step goal 10
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
    select p.id, p.display_name, p.steps_goal, p.goal from public.profiles p
    where p.challenge_opt_in and coalesce((select challenge_opt_in from me), false)
  ),
  w as (select s.user_id, count(*)::int n from public.workout_sessions s, since where s.started_at >= since.t group by 1),
  l as (select r.user_id, count(*)::int n from public.lesson_progress r, since where r.read_at >= since.t group by 1),
  q as (select r.user_id, count(*)::int n from public.lesson_progress r, since where r.quiz_passed_at >= since.t group by 1),
  qa as (select a.user_id, count(*) filter (where a.correct)::int n from public.quiz_answers a, since where a.day >= since.t::date group by 1),
  gm as (
    select x.user_id, sum(least(x.n, 3))::int n from (
      select f.user_id, f.eaten_at::date d,
        count(*) filter (where (case when p.goal = 'muscle_gain' then f.score_muscle_gain else f.score_fat_loss end) >= 70) n
      from public.food_logs f join players p on p.id = f.user_id, since
      where f.eaten_at >= since.t group by 1, 2
    ) x group by 1
  ),
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
    (coalesce(w.n, 0) * 20 + coalesce(l.n, 0) * 10 + coalesce(q.n, 0) * 20 + coalesce(qa.n, 0) * 5 + coalesce(gm.n, 0) * 5
      + coalesce(wd.n, 0) * 5 + coalesce(fd.n, 0) * 10 + coalesce(sd.n, 0) * 10)::int as points,
    coalesce(w.n, 0), coalesce(l.n, 0), coalesce(ad.n, 0),
    p.id = (select auth.uid())
  from players p
  left join w on w.user_id = p.id
  left join l on l.user_id = p.id
  left join q on q.user_id = p.id
  left join qa on qa.user_id = p.id
  left join gm on gm.user_id = p.id
  left join wd on wd.user_id = p.id
  left join fd on fd.user_id = p.id
  left join sd on sd.user_id = p.id
  left join ad on ad.user_id = p.id
  order by 3 desc, 2;
$$;
