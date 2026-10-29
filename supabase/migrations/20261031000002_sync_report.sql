-- What the person's phone sent on its last sync, per kind of data (allowed? how many? from which apps?),
-- so the family coach can see why weight or steps are missing without holding the phone.
alter table public.sync_tokens add column if not exists last_report jsonb;
