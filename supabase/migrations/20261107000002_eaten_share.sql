-- How much of a logged meal was eaten: a dish logged whole (a portion of a Cookidoo recipe, a plate) and finished
-- only in part. Every food and total of the meal follows it in the app; 1 = all of it, as logged. Kept so the
-- choice can be changed later (from half to three quarters) from what was logged, not from what is left.
alter table public.food_logs add column if not exists eaten_share numeric(4, 2) not null default 1
  check (eaten_share > 0 and eaten_share <= 4);

-- As before; the amounts it sets are all of the meal (the share eaten starts again from 1).
create or replace function public.update_shared_meal(p_id uuid, p_items jsonb)
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
    score_muscle_gain = null,
    -- The amounts are set afresh: all of it was eaten, as now written.
    eaten_share = 1
  where id = p_id;
end;
$$;
