-- LOCAL DEVELOPMENT ONLY (applied by `supabase db reset`, never pushed to the cloud).
-- A demo family member with ten weeks of history, to try the app and take screenshots.
-- Sign in at http://localhost:5173 with:  demo@forza.local  /  forza-demo-2026

select setseed(0.42);

do $$
declare
  uid uuid := 'd0d0d0d0-0000-4000-8000-000000000001';
  tpl_a uuid := 'a0a0a0a0-0000-4000-8000-00000000000a';
  tpl_b uuid := 'b0b0b0b0-0000-4000-8000-00000000000b';
  sid uuid;
  w int;
  k int;
  day date;
  is_a boolean;
  base timestamptz;
  prog numeric;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', 'demo@forza.local',
    extensions.crypt('forza-demo-2026', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Maria","locale":"it"}', now() - interval '72 days', now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', 'demo@forza.local'), 'email', now(), now(), now());

  update public.profiles set
    display_name = 'Maria', locale = 'it', sex = 'female', birth_year = 1961, height_cm = 162,
    goal = 'fat_loss', activity_level = 'light', experience = 'beginner',
    start_weight_kg = 74.0, target_weight_kg = 68, workouts_per_week = 3, steps_goal = 7000,
    onboarded_at = now() - interval '70 days'
  where id = uid;

  -- Weigh-ins: about every other day, trending from ~74 kg to ~71 kg with daily noise.
  insert into public.body_weights (user_id, measured_at, weight_kg, source)
  select uid, (current_date - d) + time '07:30',
         round((71.1 + d * 0.042 + (random() - 0.5) * 0.9)::numeric, 1), 'manual'
  from generate_series(0, 69) as d
  where d % 2 = 0 or d < 6;

  -- Steps: slowly increasing habit.
  insert into public.daily_steps (user_id, day, steps, source)
  select uid, current_date - d, (4200 + (60 - d) * 45 + random() * 2600)::int, 'health_connect'
  from generate_series(0, 59) as d;

  -- The plan prepared by the administrator.
  insert into public.workout_templates (id, user_id, name, position, managed_by_admin, exercises) values
  (tpl_a, uid, 'Allenamento A – Total body', 0, true, '[
    {"exercise_id":"goblet_squat","sets":3,"rep_min":8,"rep_max":12,"rest_s":90},
    {"exercise_id":"machine_chest_press","sets":3,"rep_min":8,"rep_max":12,"rest_s":90},
    {"exercise_id":"lat_pulldown","sets":3,"rep_min":10,"rep_max":12,"rest_s":90},
    {"exercise_id":"db_romanian_deadlift","sets":3,"rep_min":8,"rep_max":12,"rest_s":90},
    {"exercise_id":"plank","sets":3,"rep_min":20,"rep_max":40,"rest_s":60}
  ]'),
  (tpl_b, uid, 'Allenamento B – Total body', 1, true, '[
    {"exercise_id":"leg_press","sets":3,"rep_min":10,"rep_max":12,"rest_s":90},
    {"exercise_id":"seated_cable_row","sets":3,"rep_min":10,"rep_max":12,"rest_s":90},
    {"exercise_id":"db_shoulder_press","sets":3,"rep_min":8,"rep_max":12,"rest_s":90},
    {"exercise_id":"glute_bridge","sets":3,"rep_min":12,"rep_max":15,"rest_s":60},
    {"exercise_id":"farmers_walk","sets":2,"rep_min":30,"rep_max":45,"rest_s":60}
  ]');

  -- Ten weeks of workouts (Mon / Wed / Fri, a few missed), with steady progression.
  k := 0;
  for w in 0..9 loop
    foreach day in array array[
      (date_trunc('week', current_date) - make_interval(weeks => 9 - w))::date,
      (date_trunc('week', current_date) - make_interval(weeks => 9 - w) + interval '2 days')::date,
      (date_trunc('week', current_date) - make_interval(weeks => 9 - w) + interval '4 days')::date
    ] loop
      continue when day >= current_date;
      continue when random() < 0.15;
      is_a := k % 2 = 0;
      k := k + 1;
      prog := w;
      sid := gen_random_uuid();
      base := day + time '17:30';
      insert into public.workout_sessions (id, user_id, template_id, name, started_at, finished_at, effort)
      values (sid, uid, case when is_a then tpl_a else tpl_b end,
              case when is_a then 'Allenamento A – Total body' else 'Allenamento B – Total body' end,
              base, base + interval '52 minutes', 6 + (random() * 2)::int);
      if is_a then
        insert into public.set_logs (session_id, user_id, exercise_id, exercise_order, set_index, weight_kg, reps, duration_s, rir, performed_at)
        select sid, uid, x.ex, x.ord, s, x.kg, x.reps, x.dur, 2, base + make_interval(mins => x.ord * 10 + s * 3)
        from (values
          ('goblet_squat', 0, 8 + floor(prog / 2) * 2, 8 + (prog::int % 3) * 2, null::int),
          ('machine_chest_press', 1, 15 + floor(prog / 2) * 2.5, 8 + (prog::int % 3) * 2, null),
          ('lat_pulldown', 2, 20 + floor(prog / 2) * 2.5, 10 + (prog::int % 2), null),
          ('db_romanian_deadlift', 3, 6 + floor(prog / 3) * 2, 10 + (prog::int % 3), null),
          ('plank', 4, null, null, 20 + prog::int * 3)
        ) as x(ex, ord, kg, reps, dur), generate_series(0, 2) as s;
      else
        insert into public.set_logs (session_id, user_id, exercise_id, exercise_order, set_index, weight_kg, reps, duration_s, rir, performed_at)
        select sid, uid, x.ex, x.ord, s, x.kg, x.reps, x.dur, 2, base + make_interval(mins => x.ord * 10 + s * 3)
        from (values
          ('leg_press', 0, 40 + floor(prog / 2) * 5, 10 + (prog::int % 3), null::int),
          ('seated_cable_row', 1, 20 + floor(prog / 2) * 2.5, 10 + (prog::int % 3), null),
          ('db_shoulder_press', 2, 4 + floor(prog / 3) * 1, 8 + (prog::int % 3) * 2, null),
          ('glute_bridge', 3, null, 12 + (prog::int % 4), null),
          ('farmers_walk', 4, 8 + floor(prog / 3) * 2, null, 30 + prog::int * 2)
        ) as x(ex, ord, kg, reps, dur), generate_series(0, 1 + (x.ex <> 'farmers_walk')::int) as s;
      end if;
    end loop;
  end loop;

  -- A few meals today and yesterday.
  insert into public.food_logs (user_id, eaten_at, meal, title, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, score_fat_loss, score_muscle_gain, source) values
  (uid, current_date + time '08:00', 'breakfast', 'Yogurt greco, frutti di bosco, noci e avena', 380, 26, 38, 13, 7, 14, 82, 74, 'manual'),
  (uid, current_date + time '13:00', 'lunch', 'Pasta e ceci con insalata', 560, 24, 78, 15, 14, 6, 71, 78, 'ai'),
  (uid, current_date - 1 + time '08:00', 'breakfast', 'Caffellatte e fette biscottate', 290, 12, 44, 7, 3, 18, 48, 45, 'manual'),
  (uid, current_date - 1 + time '13:00', 'lunch', 'Riso, pollo e verdure', 610, 42, 70, 14, 6, 5, 84, 88, 'ai'),
  (uid, current_date - 1 + time '20:00', 'dinner', 'Frittata di verdure e pane', 520, 26, 40, 27, 6, 6, 66, 62, 'ai');

  insert into public.checkins (user_id, created_at, energy, sleep, mood, waist_cm)
  select uid, now() - make_interval(days => d * 7), least(5, 2 + (9 - d) / 3), least(5, 2 + (9 - d) / 4), least(5, 3 + (9 - d) / 4), 92 - (9 - d) * 0.5
  from generate_series(0, 9) as d;
end;
$$;
