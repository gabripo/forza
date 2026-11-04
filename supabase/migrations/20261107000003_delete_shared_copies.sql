-- A meal shared by mistake, or not eaten after all: the person who shared it takes it out of the others' food logs
-- too. Only copies this person shared go; returns how many.
create function public.delete_shared_copies(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n int;
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 50 then
    raise exception 'too_many';
  end if;
  delete from public.food_logs where id = any (p_ids) and shared_by = uid;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.delete_shared_copies(uuid[]) from public, anon;
grant execute on function public.delete_shared_copies(uuid[]) to authenticated;
