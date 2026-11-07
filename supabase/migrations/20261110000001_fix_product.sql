-- "Non è questo?": a product scanned and found wrong (another product, or wrong values in Open Food Facts) is put
-- right for its barcode, for the whole family: name, brand, values per 100 g and serving all replaced. The next scan
-- of that barcode, by anyone, finds the family's product first.
-- { barcode, name, name_key, brand?, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g?, satfat_g?, portion_g?, source? }
-- → the food's id. source: label (read from the nutrition label) | manual (typed in, or another product chosen).
create function public.fix_product(p_food jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  code text := p_food ->> 'barcode';
  v_name text := left(trim(coalesce(p_food ->> 'name', '')), 120);
  v_key text;
  v_brand text := nullif(left(trim(coalesce(p_food ->> 'brand', '')), 60), '');
  src text := case when p_food ->> 'source' = 'label' then 'label' else 'manual' end;
  num numeric[];
  fid uuid;
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  if coalesce(code, '') !~ '^[0-9]{6,14}$' or v_name = '' then
    raise exception 'bad_product';
  end if;
  -- The words names are matched on, as the app writes them; the name in lower case otherwise.
  v_key := left(lower(coalesce(nullif(trim(p_food ->> 'name_key'), ''), v_name)), 160);
  num := array[
    least(950, greatest(0, coalesce((p_food ->> 'kcal')::numeric, 0))),
    least(100, greatest(0, coalesce((p_food ->> 'protein_g')::numeric, 0))),
    least(100, greatest(0, coalesce((p_food ->> 'carbs_g')::numeric, 0))),
    least(100, greatest(0, coalesce((p_food ->> 'fat_g')::numeric, 0))),
    least(100, greatest(0, coalesce((p_food ->> 'fiber_g')::numeric, 0))),
    least(100, greatest(0, coalesce((p_food ->> 'sugar_g')::numeric, 0)))];
  insert into public.foods (name, name_key, brand, barcode, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g, satfat_g, portion_g, source, created_by)
  values (v_name, v_key, v_brand, code, num[1], num[2], num[3], num[4], num[5], num[6],
          least(100, greatest(0, (p_food ->> 'salt_g')::numeric)), least(100, greatest(0, (p_food ->> 'satfat_g')::numeric)),
          nullif(least(3000, greatest(0, coalesce((p_food ->> 'portion_g')::int, 0))), 0), src, uid)
  on conflict (barcode) do update set
    name = excluded.name, name_key = excluded.name_key, brand = excluded.brand,
    kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g, fat_g = excluded.fat_g,
    fiber_g = excluded.fiber_g, sugar_g = excluded.sugar_g, salt_g = excluded.salt_g, satfat_g = excluded.satfat_g,
    portion_g = coalesce(excluded.portion_g, public.foods.portion_g), source = excluded.source, updated_at = now()
  returning id into fid;
  return fid;
end;
$$;
revoke execute on function public.fix_product(jsonb) from public, anon;
grant execute on function public.fix_product(jsonb) to authenticated;
