-- The family at a glance, for the family coach's phone: each person's daily targets (the latest kept on or before
-- the day) and the meals logged that day, read-only. Only the family coach can ask; everyone else keeps seeing
-- only their own food log.
-- p_from, p_to: the day's start and end in the coach's time zone; p_day: that day, for the targets.
-- → [{ id, name, goal, target: { day, kcal, protein_g, carbs_g, fat_g } | null,
--      meals: [{ id, meal, title, eaten_at, kcal, protein_g, carbs_g, fat_g, logged_by }] }]
create function public.family_overview(p_from timestamptz, p_to timestamptz, p_day date)
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
          'id', f.id, 'meal', f.meal, 'title', f.title, 'eaten_at', f.eaten_at,
          'kcal', f.kcal, 'protein_g', f.protein_g, 'carbs_g', f.carbs_g, 'fat_g', f.fat_g, 'logged_by', f.logged_by)
          order by f.eaten_at)
        from public.food_logs f
        where f.user_id = p.id and f.eaten_at >= p_from and f.eaten_at < p_to), '[]'::jsonb))
      order by p.display_name)
    from public.profiles p
    where p.display_name <> '' and p.onboarded_at is not null), '[]'::jsonb);
end;
$$;
revoke execute on function public.family_overview(timestamptz, timestamptz, date) from public, anon;
grant execute on function public.family_overview(timestamptz, timestamptz, date) to authenticated;
