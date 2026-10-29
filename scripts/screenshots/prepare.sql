-- Run after `supabase start` (which loads supabase/seed.sql): the README pictures are in English.
update public.profiles set locale = 'en' where id = 'd0d0d0d0-0000-4000-8000-000000000001';
update public.food_logs f set title = t.en
from (values
  ('Yogurt greco, frutti di bosco, noci e avena', 'Greek yogurt, berries, walnuts and oats'),
  ('Pasta e ceci con insalata', 'Pasta with chickpeas and a salad'),
  ('Caffellatte e fette biscottate', 'Milky coffee and rusks'),
  ('Riso, pollo e verdure', 'Rice, chicken and vegetables'),
  ('Frittata di verdure e pane', 'Vegetable omelette and bread')
) as t(it, en)
where f.title = t.it and f.user_id = 'd0d0d0d0-0000-4000-8000-000000000001';
update public.workout_templates set name = replace(replace(name, 'Allenamento', 'Workout'), 'Total body', 'Full body')
where user_id = 'd0d0d0d0-0000-4000-8000-000000000001';
update public.workout_sessions set name = replace(replace(name, 'Allenamento', 'Workout'), 'Total body', 'Full body')
where user_id = 'd0d0d0d0-0000-4000-8000-000000000001';
