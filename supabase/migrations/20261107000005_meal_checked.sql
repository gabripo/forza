-- A meal the person looked at after Forza! found it odd (a food named but logged as something much lighter, a main
-- meal far lighter than usual, one heavier than any meal): corrected or confirmed as right, it is not asked again.
alter table public.food_logs add column checked_at timestamptz;
