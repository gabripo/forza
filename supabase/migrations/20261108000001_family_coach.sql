-- The family coach: one person of the family who logs meals in the app for the others too (whoever cooks for
-- everyone, or helps someone who does not log). Chosen in Forza! Coach; nobody until then. The coach sees and
-- changes only the meals they logged for someone; the person sees them in their own food log, as their own.

create table public.family (
  id boolean primary key default true check (id),
  coach_id uuid references public.profiles on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.family default values;
alter table public.family enable row level security;
-- Everyone can see who the coach is; only Forza! Coach (the service key) chooses.
create policy "family: read" on public.family for select to authenticated using (true);

create function public.is_family_coach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.family where coach_id = (select auth.uid()));
$$;
revoke execute on function public.is_family_coach() from public, anon;
grant execute on function public.is_family_coach() to authenticated;

-- Who logged a meal for the person it belongs to (the family coach); null when they logged it themselves.
alter table public.food_logs add column logged_by uuid references auth.users on delete set null;

-- The coach logs a meal for someone, and can change or delete it afterwards, while they are the coach.
create policy "family coach: meals logged for others" on public.food_logs for all to authenticated
  using (logged_by = (select auth.uid()) and (select public.is_family_coach()))
  with check (logged_by = (select auth.uid()) and (select public.is_family_coach()));

-- The meal's photo goes into the person's own folder, so their app shows it.
create policy "food photos: family coach write" on storage.objects for insert to authenticated
  with check (bucket_id = 'food-photos' and (select public.is_family_coach()));

-- The foods of a meal logged for someone count as used by that person, as when they log them.
create function public.remember_foods_for(p_user uuid, p_foods jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is distinct from (select auth.uid()) and not public.is_family_coach() then
    raise exception 'not_allowed';
  end if;
  perform public.remember_foods_as(p_user, p_foods);
end;
$$;
revoke execute on function public.remember_foods_for(uuid, jsonb) from public, anon;
grant execute on function public.remember_foods_for(uuid, jsonb) to authenticated;
