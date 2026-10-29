-- Meals synced from Health Connect (Build With Science and other food diaries) remember the app
-- they came from, so Forza! can label them and mirror edits and deletions made in that app.
alter table public.food_logs add column if not exists origin text;
create index if not exists food_logs_user_source_time on public.food_logs (user_id, source, eaten_at);
