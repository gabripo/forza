-- How much of the meal each person had, chosen when sharing it: a percentage of the whole meal as logged (a
-- Cookidoo dish logged whole, of which this person ate only part, counts whole), one per person. Each copy keeps it
-- as its share eaten, so its owner can change it later like any meal of theirs.
drop function public.share_meal(uuid[], uuid[], numeric);
create function public.share_meal(p_ids uuid[], p_users uuid[], p_factor numeric default 1, p_shares numeric[] default null)
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
  if p_shares is not null and array_length(p_shares, 1) is distinct from array_length(p_users, 1) then
    raise exception 'bad_shares';
  end if;
  select nullif(display_name, '') into who from public.profiles where id = uid;
  insert into public.food_logs (user_id, eaten_at, meal, title, items, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g, satfat_g, source, origin, ai_notes, shared_by, shared_from, eaten_share)
  select u.id, f.eaten_at, f.meal, f.title,
         coalesce((select jsonb_agg(
                     i || jsonb_build_object('grams', round((i ->> 'grams')::numeric * x.k, 1), 'kcal', round((i ->> 'kcal')::numeric * x.k, 1),
                       'protein_g', round((i ->> 'protein_g')::numeric * x.k, 1), 'carbs_g', round((i ->> 'carbs_g')::numeric * x.k, 1),
                       'fat_g', round((i ->> 'fat_g')::numeric * x.k, 1), 'fiber_g', round((i ->> 'fiber_g')::numeric * x.k, 1),
                       'sugar_g', round((i ->> 'sugar_g')::numeric * x.k, 1))
                     -- Salt and saturated fat only on the foods that say how much they have.
                     || jsonb_strip_nulls(jsonb_build_object('salt_g', round((i ->> 'salt_g')::numeric * x.k, 2), 'satfat_g', round((i ->> 'satfat_g')::numeric * x.k, 1))))
                   from jsonb_array_elements(f.items) as i), '[]'::jsonb),
         round(f.kcal * x.k, 1), round(f.protein_g * x.k, 1), round(f.carbs_g * x.k, 1), round(f.fat_g * x.k, 1), round(f.fiber_g * x.k, 1),
         round(f.sugar_g * x.k, 1), round(f.salt_g * x.k, 2), round(f.satfat_g * x.k, 1), 'shared', coalesce(who, 'family'), null, uid, f.id,
         coalesce(s.share, 1)
  from public.food_logs f
  -- One row per person, with their share of the whole meal (none: this person's portion times p_factor, as before).
  cross join (
    select distinct on (p.user_id) p.user_id, case when p.pct is not null then round(least(3, greatest(0.05, p.pct)), 2) end as share
    from unnest(p_users, p_shares) as p(user_id, pct)
  ) as s
  join public.profiles u on u.id = s.user_id and u.id <> uid
  -- What was logged is f.eaten_share of the whole meal.
  cross join lateral (select coalesce(s.share / f.eaten_share, k) as k) as x
  where f.id = any (p_ids) and f.user_id = uid;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.share_meal(uuid[], uuid[], numeric, numeric[]) from public, anon;
grant execute on function public.share_meal(uuid[], uuid[], numeric, numeric[]) to authenticated;
