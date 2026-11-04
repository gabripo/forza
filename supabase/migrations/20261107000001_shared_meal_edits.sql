-- Meals shared with the family, changed afterwards by the person who shared them: one cooked, more ate, and the
-- cook knows best how much each one had. Each copy remembers who shared it and from which meal.

alter table public.food_logs add column if not exists shared_by uuid references auth.users on delete set null;
alter table public.food_logs add column if not exists shared_from uuid references public.food_logs on delete set null;
create index if not exists food_logs_shared_from on public.food_logs (shared_from) where shared_from is not null;

-- Copies made before: the person who shared them by the name written on them, the meal by its time and title.
update public.food_logs c set shared_by = p.id
from public.profiles p
where c.source = 'shared' and c.shared_by is null and p.display_name = c.origin and p.id <> c.user_id;
update public.food_logs c set shared_from = o.id
from public.food_logs o
where c.source = 'shared' and c.shared_from is null and o.user_id = c.shared_by and o.eaten_at = c.eaten_at and o.title = c.title;

-- As before, and the copies now say who shared them and from which meal.
create or replace function public.share_meal(p_ids uuid[], p_users uuid[], p_factor numeric default 1)
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
  insert into public.food_logs (user_id, eaten_at, meal, title, items, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g, satfat_g, source, origin, ai_notes, shared_by, shared_from)
  select u.id, f.eaten_at, f.meal, f.title,
         coalesce((select jsonb_agg(
                     i || jsonb_build_object('grams', round((i ->> 'grams')::numeric * k), 'kcal', round((i ->> 'kcal')::numeric * k),
                       'protein_g', round((i ->> 'protein_g')::numeric * k, 1), 'carbs_g', round((i ->> 'carbs_g')::numeric * k, 1),
                       'fat_g', round((i ->> 'fat_g')::numeric * k, 1), 'fiber_g', round((i ->> 'fiber_g')::numeric * k, 1),
                       'sugar_g', round((i ->> 'sugar_g')::numeric * k, 1)))
                   from jsonb_array_elements(f.items) as i), '[]'::jsonb),
         round(f.kcal * k, 1), round(f.protein_g * k, 1), round(f.carbs_g * k, 1), round(f.fat_g * k, 1), round(f.fiber_g * k, 1),
         round(f.sugar_g * k, 1), round(f.salt_g * k, 2), round(f.satfat_g * k, 1), 'shared', coalesce(who, 'family'), null, uid, f.id
  from public.food_logs f
  join public.profiles u on u.id = any (p_users) and u.id <> uid
  where f.id = any (p_ids) and f.user_id = uid;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- The copies of one of this person's meals that they shared: in whose food log, and what each one had.
create function public.shared_copies(p_from uuid)
returns table (id uuid, user_id uuid, person text, items jsonb, kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.user_id, coalesce(p.display_name, ''), c.items, c.kcal, c.protein_g, c.carbs_g, c.fat_g
  from public.food_logs c
  left join public.profiles p on p.id = c.user_id
  where c.shared_from = p_from and c.shared_by = (select auth.uid())
  order by p.display_name;
$$;
revoke execute on function public.shared_copies(uuid) from public, anon;
grant execute on function public.shared_copies(uuid) to authenticated;

-- The person who shared a meal changes someone's copy: their portion, a food taken out or put back, an amount.
-- The totals follow the foods; the score is worked out again by the other person's app, against their target.
create function public.update_shared_meal(p_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean jsonb;
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  if not exists (select 1 from public.food_logs where id = p_id and shared_by = uid) then
    raise exception 'not_shared_by_you';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 40 then
    raise exception 'bad_items';
  end if;
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'name', left(trim(i ->> 'name'), 120),
           'grams', round(least(5000, greatest(0, coalesce((i ->> 'grams')::numeric, 0)))),
           'kcal', round(least(10000, greatest(0, coalesce((i ->> 'kcal')::numeric, 0)))),
           'protein_g', round(least(1000, greatest(0, coalesce((i ->> 'protein_g')::numeric, 0))), 1),
           'carbs_g', round(least(1000, greatest(0, coalesce((i ->> 'carbs_g')::numeric, 0))), 1),
           'fat_g', round(least(1000, greatest(0, coalesce((i ->> 'fat_g')::numeric, 0))), 1),
           'fiber_g', round(least(1000, greatest(0, coalesce((i ->> 'fiber_g')::numeric, 0))), 1),
           'sugar_g', round(least(1000, greatest(0, coalesce((i ->> 'sugar_g')::numeric, 0))), 1),
           -- Not known stays not known (greatest() would turn it into 0).
           'salt_g', case when i ->> 'salt_g' is not null then round(least(50, greatest(0, (i ->> 'salt_g')::numeric)), 2) end,
           'satfat_g', case when i ->> 'satfat_g' is not null then round(least(300, greatest(0, (i ->> 'satfat_g')::numeric)), 1) end))
         order by n)
    into clean
  from jsonb_array_elements(p_items) with ordinality as e(i, n)
  where coalesce(trim(i ->> 'name'), '') <> '';
  if clean is null then
    raise exception 'bad_items';
  end if;
  update public.food_logs set
    items = clean,
    kcal = (select coalesce(sum((x ->> 'kcal')::numeric), 0) from jsonb_array_elements(clean) x),
    protein_g = (select coalesce(sum((x ->> 'protein_g')::numeric), 0) from jsonb_array_elements(clean) x),
    carbs_g = (select coalesce(sum((x ->> 'carbs_g')::numeric), 0) from jsonb_array_elements(clean) x),
    fat_g = (select coalesce(sum((x ->> 'fat_g')::numeric), 0) from jsonb_array_elements(clean) x),
    fiber_g = (select coalesce(sum((x ->> 'fiber_g')::numeric), 0) from jsonb_array_elements(clean) x),
    sugar_g = (select coalesce(sum((x ->> 'sugar_g')::numeric), 0) from jsonb_array_elements(clean) x),
    -- Salt and saturated fat only when some food says how much it has.
    salt_g = (select sum((x ->> 'salt_g')::numeric) from jsonb_array_elements(clean) x),
    satfat_g = (select sum((x ->> 'satfat_g')::numeric) from jsonb_array_elements(clean) x),
    score_fat_loss = null,
    score_muscle_gain = null
  where id = p_id;
end;
$$;
revoke execute on function public.update_shared_meal(uuid, jsonb) from public, anon;
grant execute on function public.update_shared_meal(uuid, jsonb) to authenticated;
