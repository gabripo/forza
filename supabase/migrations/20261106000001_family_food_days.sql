-- The family's food, together: recipes (the family's own dishes, and ones imported from Cookidoo or a recipe
-- site), the foods the family logs most, meals cooked for more people, the meals Forza! Coach adds joining the
-- family database; and each day's food checked: a day logged only in part is left out of the sums, a meal that is
-- always skipped (intermittent fasting) is not asked about again. Then the history of the daily targets.

-- ---------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------

-- A recipe is also a food of the family database (source 'recipe', values per 100 g of the dish), so it is found
-- like any other food: in the search, and by name when it is dictated.
alter table public.foods drop constraint if exists foods_source_check;
alter table public.foods add constraint foods_source_check check (source in ('barcode', 'label', 'manual', 'ai', 'web', 'recipe'));
-- Two recipes, or a recipe and a food, may share a name ("lasagne"): only plain foods are matched by name.
drop index if exists public.foods_name_brand;
create unique index foods_name_brand on public.foods (name_key, coalesce(brand, '')) where barcode is null and source <> 'recipe';

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  -- Its row in the family database (values per 100 g of the dish as served).
  food_id uuid references public.foods on delete set null,
  name text not null check (length(name) between 1 and 120),
  servings int not null default 1 check (servings between 1 and 50),
  -- The dish when ready, in grams (cooking changes the weight); null = the ingredients' weight.
  total_g int check (total_g between 1 and 20000),
  -- The ingredients, as foods of a meal: [{ name, grams, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, ... }]
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array'),
  -- manual (made in the app) | link (read from a recipe page, e.g. Cookidoo) | text (pasted or dictated)
  source text not null default 'manual' check (source in ('manual', 'link', 'text')),
  source_url text check (length(source_url) <= 500),
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.recipes enable row level security;
create policy "family: read" on public.recipes for select to authenticated using (true);
create policy "own: delete" on public.recipes for delete to authenticated using (created_by = (select auth.uid()));

-- Saves a recipe (new, or one this person made) and its food: values per 100 g of the dish from the ingredients
-- and the weight when ready. { id?, name, servings, total_g?, items, source?, source_url? } → the recipe's id.
create function public.save_recipe(p_recipe jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  rid uuid := nullif(p_recipe ->> 'id', '')::uuid;
  fid uuid;
  v_name text := left(trim(coalesce(p_recipe ->> 'name', '')), 120);
  v_items jsonb := coalesce(p_recipe -> 'items', '[]'::jsonb);
  v_servings int := least(50, greatest(1, coalesce((p_recipe ->> 'servings')::int, 1)));
  v_total int := nullif(least(20000, greatest(0, coalesce((p_recipe ->> 'total_g')::int, 0))), 0);
  sums numeric[];
  weight numeric;
  k numeric;
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  if v_name = '' or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 or jsonb_array_length(v_items) > 60 then
    raise exception 'bad_recipe';
  end if;
  select array[
      coalesce(sum((i ->> 'grams')::numeric), 0), coalesce(sum((i ->> 'kcal')::numeric), 0), coalesce(sum((i ->> 'protein_g')::numeric), 0),
      coalesce(sum((i ->> 'carbs_g')::numeric), 0), coalesce(sum((i ->> 'fat_g')::numeric), 0), coalesce(sum((i ->> 'fiber_g')::numeric), 0),
      coalesce(sum((i ->> 'sugar_g')::numeric), 0), sum((i ->> 'salt_g')::numeric), sum((i ->> 'satfat_g')::numeric)]
    into sums
    from jsonb_array_elements(v_items) as i;
  weight := coalesce(v_total, sums[1]);
  if weight <= 0 then
    raise exception 'bad_recipe';
  end if;
  k := 100 / weight;
  if rid is not null then
    select food_id into fid from public.recipes where id = rid and created_by = uid;
    if not found then
      raise exception 'not_yours';
    end if;
  end if;
  if fid is null then
    insert into public.foods (name, name_key, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g, satfat_g, portion_g, source, created_by)
    values (v_name, left(lower(v_name), 160), 0, 0, 0, 0, 0, 0, null, null, null, 'recipe', uid)
    returning id into fid;
  end if;
  update public.foods set
      name = v_name, name_key = left(lower(v_name), 160),
      kcal = least(950, round(sums[2] * k, 1)), protein_g = least(100, round(sums[3] * k, 1)), carbs_g = least(100, round(sums[4] * k, 1)),
      fat_g = least(100, round(sums[5] * k, 1)), fiber_g = least(100, round(sums[6] * k, 1)), sugar_g = least(100, round(sums[7] * k, 1)),
      salt_g = least(100, round(sums[8] * k, 2)), satfat_g = least(100, round(sums[9] * k, 1)),
      -- One portion: the dish shared by its servings.
      portion_g = least(3000, greatest(1, round(weight / v_servings)::int)), updated_at = now()
    where id = fid;
  if rid is null then
    insert into public.recipes (food_id, name, servings, total_g, items, source, source_url, created_by)
    values (fid, v_name, v_servings, v_total, v_items,
            case when p_recipe ->> 'source' in ('manual', 'link', 'text') then p_recipe ->> 'source' else 'manual' end,
            left(nullif(trim(coalesce(p_recipe ->> 'source_url', '')), ''), 500), uid)
    returning id into rid;
  else
    update public.recipes set food_id = fid, name = v_name, servings = v_servings, total_g = v_total, items = v_items, updated_at = now()
      where id = rid;
  end if;
  return rid;
end;
$$;
revoke execute on function public.save_recipe(jsonb) from public, anon;
grant execute on function public.save_recipe(jsonb) to authenticated;

-- A recipe deleted takes its food out of the search (meals already logged keep their values).
create function public.recipe_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.foods where id = old.food_id and source = 'recipe';
  return old;
end;
$$;
create trigger recipe_deleted after delete on public.recipes for each row execute function public.recipe_deleted();

-- ---------------------------------------------------------------------------
-- The family database, fed by everyone
-- ---------------------------------------------------------------------------

-- remember_foods for a given person: the app calls remember_foods (as the person signed in), Forza! Coach this one
-- (with the service key) for the meals it adds. Plain foods are matched by name, never a recipe.
create function public.remember_foods_as(p_user uuid, p_foods jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  fid uuid;
  key text;
  src text;
  code text;
  v_brand text;
  num numeric[];
begin
  if p_user is null then
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
        select id into fid from public.foods
          where name_key = left(lower(trim(f ->> 'name_key')), 160) and coalesce(brand, '') = coalesce(v_brand, '') and barcode is null and source <> 'recipe';
      end if;
      if fid is null then
        insert into public.foods (name, name_key, brand, barcode, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g, satfat_g, portion_g, source, created_by)
        values (left(trim(f ->> 'name'), 120), left(lower(trim(f ->> 'name_key')), 160), v_brand, code, num[1], num[2], num[3], num[4], num[5], num[6],
                least(100, greatest(0, (f ->> 'salt_g')::numeric)), least(100, greatest(0, (f ->> 'satfat_g')::numeric)),
                nullif(least(3000, greatest(0, coalesce((f ->> 'portion_g')::int, 0))), 0), src, p_user)
        returning id into fid;
      elsif src <> 'ai' then
        update public.foods set kcal = num[1], protein_g = num[2], carbs_g = num[3], fat_g = num[4], fiber_g = num[5], sugar_g = num[6],
          salt_g = coalesce(least(100, greatest(0, (f ->> 'salt_g')::numeric)), salt_g),
          satfat_g = coalesce(least(100, greatest(0, (f ->> 'satfat_g')::numeric)), satfat_g), source = src, updated_at = now()
        where id = fid and (source = 'ai' or src in ('barcode', 'label', 'manual'));
      end if;
      key := fid::text;
    end if;
    insert into public.food_memory (user_id, food_key, uses, last_grams, last_used_at)
    values (p_user, key, 1, nullif(least(3000, greatest(0, coalesce((f ->> 'grams')::int, 0))), 0), now())
    on conflict (user_id, food_key) do update
      set uses = public.food_memory.uses + 1, last_grams = coalesce(excluded.last_grams, public.food_memory.last_grams), last_used_at = now();
  end loop;
end;
$$;
revoke execute on function public.remember_foods_as(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.remember_foods_as(uuid, jsonb) to service_role;

create or replace function public.remember_foods(p_foods jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.remember_foods_as((select auth.uid()), p_foods);
end;
$$;

-- The foods the whole family logs most (how many times, by how many people): they come first for everyone, after
-- the person's own. Counts only, never who.
create function public.family_food_uses()
returns table (food_key text, uses int, people int)
language sql
stable
security definer
set search_path = ''
as $$
  select m.food_key, sum(m.uses)::int, count(*)::int
  from public.food_memory m
  group by m.food_key
  order by sum(m.uses) desc
  limit 300;
$$;
revoke execute on function public.family_food_uses() from public, anon;
grant execute on function public.family_food_uses() to authenticated;

-- ---------------------------------------------------------------------------
-- A meal for more people
-- ---------------------------------------------------------------------------

-- Everyone in the family, by name: to choose who ate the same meal.
create function public.family_people()
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name from public.profiles p where p.display_name <> '' order by p.display_name;
$$;
revoke execute on function public.family_people() from public, anon;
grant execute on function public.family_people() to authenticated;

-- One person cooked, more ate: copies meals the caller logged into the others' food logs (same time and part of
-- the day, each portion scaled by p_factor), marked as shared by the caller. Up to 20 meals and 10 people a call;
-- returns how many meals were written. The others can change or delete their copy like any meal of theirs.
create function public.share_meal(p_ids uuid[], p_users uuid[], p_factor numeric default 1)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  k numeric := least(3, greatest(0.25, coalesce(p_factor, 1)));
  who text;
  n int;
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 20 or coalesce(array_length(p_users, 1), 0) > 10 then
    raise exception 'too_many';
  end if;
  select nullif(display_name, '') into who from public.profiles where id = uid;
  insert into public.food_logs (user_id, eaten_at, meal, title, items, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g, satfat_g, source, origin, ai_notes)
  select u.id, f.eaten_at, f.meal, f.title,
         coalesce((select jsonb_agg(
                     i || jsonb_build_object('grams', round((i ->> 'grams')::numeric * k), 'kcal', round((i ->> 'kcal')::numeric * k),
                       'protein_g', round((i ->> 'protein_g')::numeric * k, 1), 'carbs_g', round((i ->> 'carbs_g')::numeric * k, 1),
                       'fat_g', round((i ->> 'fat_g')::numeric * k, 1), 'fiber_g', round((i ->> 'fiber_g')::numeric * k, 1),
                       'sugar_g', round((i ->> 'sugar_g')::numeric * k, 1)))
                   from jsonb_array_elements(f.items) as i), '[]'::jsonb),
         round(f.kcal * k, 1), round(f.protein_g * k, 1), round(f.carbs_g * k, 1), round(f.fat_g * k, 1), round(f.fiber_g * k, 1),
         round(f.sugar_g * k, 1), round(f.salt_g * k, 2), round(f.satfat_g * k, 1), 'shared', coalesce(who, 'family'), null
  from public.food_logs f
  join public.profiles u on u.id = any (p_users) and u.id <> uid
  where f.id = any (p_ids) and f.user_id = uid;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.share_meal(uuid[], uuid[], numeric) from public, anon;
grant execute on function public.share_meal(uuid[], uuid[], numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Each day's food, checked
-- ---------------------------------------------------------------------------

-- What the person said about a day: everything logged (complete), or not (incomplete: left out of every sum and
-- average), and the meals they skipped that day.
create table public.food_days (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  status text check (status in ('complete', 'incomplete')),
  skipped text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.food_days enable row level security;
create policy "own rows" on public.food_days for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Meals the person usually does not have (intermittent fasting: no dinner): never asked about, never suggested.
alter table public.profiles add column if not exists skip_meals text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- The daily targets over time
-- ---------------------------------------------------------------------------

-- The targets the person saw each day (written when the app or Forza! Coach works them out, once a day).
create table public.target_history (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  kcal int not null check (kcal between 500 and 10000),
  protein_g int not null check (protein_g between 0 and 1000),
  carbs_g int not null check (carbs_g between 0 and 2000),
  fat_g int not null check (fat_g between 0 and 1000),
  tdee int check (tdee between 500 and 10000),
  -- formula | adaptive | blend (how the energy used was estimated)
  method text,
  weight_kg numeric(5, 2),
  primary key (user_id, day)
);
alter table public.target_history enable row level security;
create policy "own rows" on public.target_history for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
