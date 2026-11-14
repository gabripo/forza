-- The family coach can open and change anyone's meal from the family overview: its foods and their amounts, the
-- totals with them, its name and its part of the day. Meals synced from another app (Health Connect, Build With
-- Science) are changed there, as in the app. The person's own app works the score out again, against their target.

-- The overview: each meal now with its foods and where it came from (to open it, and to tell synced meals apart).
create or replace function public.family_overview(p_from timestamptz, p_to timestamptz, p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_family_coach() then
    raise exception 'not_family_coach';
  end if;
  -- One day (25 hours when the clocks change).
  if p_from is null or p_to is null or p_day is null or p_to <= p_from or p_to - p_from > interval '26 hours' then
    raise exception 'bad_day';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', p.display_name,
      'goal', p.goal,
      'target', (
        select jsonb_build_object('day', t.day, 'kcal', t.kcal, 'protein_g', t.protein_g, 'carbs_g', t.carbs_g, 'fat_g', t.fat_g)
        from public.target_history t
        where t.user_id = p.id and t.day <= p_day
        order by t.day desc
        limit 1),
      'meals', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', f.id, 'meal', f.meal, 'title', f.title, 'eaten_at', f.eaten_at, 'items', f.items,
          'kcal', f.kcal, 'protein_g', f.protein_g, 'carbs_g', f.carbs_g, 'fat_g', f.fat_g,
          'source', f.source, 'origin', f.origin, 'logged_by', f.logged_by)
          order by f.eaten_at)
        from public.food_logs f
        where f.user_id = p.id and f.eaten_at >= p_from and f.eaten_at < p_to), '[]'::jsonb))
      order by p.display_name)
    from public.profiles p
    where p.display_name <> '' and p.onboarded_at is not null), '[]'::jsonb);
end;
$$;

-- One meal of anyone in the family, to change it: the whole row, with the person's name.
create function public.family_meal(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  if not public.is_family_coach() then
    raise exception 'not_family_coach';
  end if;
  select to_jsonb(f) || jsonb_build_object('person', p.display_name) into r
  from public.food_logs f join public.profiles p on p.id = f.user_id
  where f.id = p_id;
  return r;
end;
$$;
revoke execute on function public.family_meal(uuid) from public, anon;
grant execute on function public.family_meal(uuid) to authenticated;

-- A meal changed by the family coach: its foods, totals, name and part of the day; nothing else (whose it is, when
-- it was eaten, its photo stay). The score is cleared, for the person's app to work it out against their target.
-- { meal, title, items, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g?, satfat_g? }
create function public.family_change_meal(p_id uuid, p_meal jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.food_logs;
  v_items jsonb := p_meal -> 'items';
  num numeric[];
begin
  if not public.is_family_coach() then
    raise exception 'not_family_coach';
  end if;
  select * into f from public.food_logs where id = p_id;
  if not found then
    raise exception 'not_found';
  end if;
  if f.source = 'health_connect' or (f.source = 'import' and f.origin is not null) then
    raise exception 'synced_meal';
  end if;
  if coalesce(p_meal ->> 'meal', '') not in ('breakfast', 'lunch', 'snack', 'dinner')
     or jsonb_typeof(v_items) is distinct from 'array' or jsonb_array_length(v_items) > 60 then
    raise exception 'bad_meal';
  end if;
  num := array[
    least(20000, greatest(0, coalesce((p_meal ->> 'kcal')::numeric, 0))),
    least(5000, greatest(0, coalesce((p_meal ->> 'protein_g')::numeric, 0))),
    least(5000, greatest(0, coalesce((p_meal ->> 'carbs_g')::numeric, 0))),
    least(5000, greatest(0, coalesce((p_meal ->> 'fat_g')::numeric, 0))),
    least(5000, greatest(0, coalesce((p_meal ->> 'fiber_g')::numeric, 0))),
    least(5000, greatest(0, coalesce((p_meal ->> 'sugar_g')::numeric, 0)))];
  update public.food_logs set
    meal = p_meal ->> 'meal',
    title = left(coalesce(nullif(trim(p_meal ->> 'title'), ''), f.title), 120),
    items = v_items,
    kcal = num[1], protein_g = num[2], carbs_g = num[3], fat_g = num[4], fiber_g = num[5], sugar_g = num[6],
    salt_g = least(999, greatest(0, (p_meal ->> 'salt_g')::numeric)),
    satfat_g = least(5000, greatest(0, (p_meal ->> 'satfat_g')::numeric)),
    score_fat_loss = null,
    score_muscle_gain = null
  where id = p_id;
end;
$$;
revoke execute on function public.family_change_meal(uuid, jsonb) from public, anon;
grant execute on function public.family_change_meal(uuid, jsonb) to authenticated;
