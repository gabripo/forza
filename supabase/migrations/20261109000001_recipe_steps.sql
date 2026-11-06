-- A recipe's preparation: steps to follow, each with what to do and, for some kinds, its settings (an oven's
-- temperature, mode and time; a pan's heat; a Thermomix's time, temperature and speed):
-- [{ kind, text, minutes?, seconds?, temp_c?, oven?, preheat?, heat?, speed?, reverse? }]
alter table public.recipes add column steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array');

-- save_recipe() keeps the steps too ({ …, steps? }); everything else as before.
create or replace function public.save_recipe(p_recipe jsonb)
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
  v_steps jsonb := coalesce(p_recipe -> 'steps', '[]'::jsonb);
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
  if jsonb_typeof(v_steps) <> 'array' or jsonb_array_length(v_steps) > 40 then
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
    insert into public.recipes (food_id, name, servings, total_g, items, steps, source, source_url, created_by)
    values (fid, v_name, v_servings, v_total, v_items, v_steps,
            case when p_recipe ->> 'source' in ('manual', 'link', 'text') then p_recipe ->> 'source' else 'manual' end,
            left(nullif(trim(coalesce(p_recipe ->> 'source_url', '')), ''), 500), uid)
    returning id into rid;
  else
    update public.recipes set food_id = fid, name = v_name, servings = v_servings, total_g = v_total, items = v_items, steps = v_steps, updated_at = now()
      where id = rid;
  end if;
  return rid;
end;
$$;
