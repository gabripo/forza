-- Saturated fat: in each meal and in the family food database, so the app can warn when a day goes past the
-- limit (WHO: under 10% of the calories).

-- Grams of saturated fat in the meal; null when no food in it says.
alter table public.food_logs add column if not exists satfat_g numeric(6, 1);
-- Per 100 g, like the other values; null when not known.
alter table public.foods add column if not exists satfat_g numeric(5, 1) check (satfat_g between 0 and 100);

-- The same as before, now keeping saturated fat too (satfat_g, per 100 g, optional in each food).
create or replace function public.remember_foods(p_foods jsonb)
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
        insert into public.foods (name, name_key, brand, barcode, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g, satfat_g, portion_g, source, created_by)
        values (left(trim(f ->> 'name'), 120), left(lower(trim(f ->> 'name_key')), 160), v_brand, code, num[1], num[2], num[3], num[4], num[5], num[6],
                least(100, greatest(0, (f ->> 'salt_g')::numeric)), least(100, greatest(0, (f ->> 'satfat_g')::numeric)),
                nullif(least(3000, greatest(0, coalesce((f ->> 'portion_g')::int, 0))), 0), src, uid)
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
    values (uid, key, 1, nullif(least(3000, greatest(0, coalesce((f ->> 'grams')::int, 0))), 0), now())
    on conflict (user_id, food_key) do update
      set uses = public.food_memory.uses + 1, last_grams = coalesce(excluded.last_grams, public.food_memory.last_grams), last_used_at = now();
  end loop;
end;
$$;
