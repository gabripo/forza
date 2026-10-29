-- The order of the Home page sections, chosen by the person (Settings) or by their coach (Forza! Coach).
-- Null means the default order. Ids are listed in shared/home-sections.mjs.
alter table public.profiles add column if not exists home_order text[];
