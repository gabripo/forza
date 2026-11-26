-- Staying signed in. A phone keeps its sign-in as a refresh token that changes every hour. An iPhone can lose the
-- last change it saved (the app closed by the system at the wrong moment): it then sends an older token, the server
-- takes it for a stolen one and ends the sign-in, and the person needed a new code from the family coach.
-- Now each phone also keeps a key of its own, made when it signs in, that never changes: with it the app signs in
-- again by itself (server function device-sign-in). Only the key's SHA-256 hash is stored, as for sync keys.
create table if not exists public.device_keys (
  key_hash text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  device text,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists device_keys_user on public.device_keys (user_id);

-- No policies: the app reaches the table only through the two functions below, the server function with the
-- secret key.
alter table public.device_keys enable row level security;

/** This phone's key (its hash), for the person signed in. A person keeps at most 5: the longest unused go. */
create or replace function public.remember_device(p_hash text, p_device text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad_key';
  end if;
  insert into public.device_keys (key_hash, user_id, device)
  values (p_hash, auth.uid(), left(p_device, 80))
  on conflict (key_hash) do nothing;
  delete from public.device_keys d
  where d.user_id = auth.uid()
    and d.key_hash not in (
      select k.key_hash from public.device_keys k
      where k.user_id = auth.uid()
      order by coalesce(k.used_at, k.created_at) desc
      limit 5);
end;
$$;

/** Signing out of a phone: its key stops working. */
create or replace function public.forget_device(p_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.device_keys where user_id = auth.uid() and key_hash = p_hash;
$$;

revoke all on function public.remember_device(text, text) from public, anon;
revoke all on function public.forget_device(text) from public, anon;
grant execute on function public.remember_device(text, text) to authenticated;
grant execute on function public.forget_device(text) to authenticated;
