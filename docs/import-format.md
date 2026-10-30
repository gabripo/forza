# Importing history from another app

A JSON file in the `forza-history-v1` format brings over workouts, a plan, weigh-ins, meals and profile
details logged in another app, so the charts and the automatic weight suggestions work from day one.
It can be imported:

- by the coach: Forza! Coach → person → **Import → Import a history file**;
- by the person: Forza! app → **Settings → Connect Health & scale → Import a history file**.

Forza! Coach writes this format itself when it imports from Build With Science
(see the [Coach guide](coach-guide.md#5-coming-from-build-with-science)). The same code
(`shared/history-import.mjs`) runs in both places.

```jsonc
{
  "format": "forza-history-v1",

  // Optional: the workout plan. A workout with the same name as an existing one is updated.
  "templates": [
    {
      "name": "Workout A",
      "notes": "Thursday",
      "exercises": [
        { "exercise_id": "incline_db_press", "sets": 5, "rep_min": 8, "rep_max": 12, "rest_s": 150, "note": "Low incline, 15-30°" }
      ]
    }
  ],

  // Optional: past workouts. `id` must be a UUID and stay the same between imports
  // (re-importing replaces that workout's sets instead of duplicating it).
  "sessions": [
    {
      "id": "5f0c7f5e-2f0a-5a37-9d6b-6a1d8a7a4b01",
      "name": "Workout A",
      "started_at": "2026-10-18T17:30:00+02:00",
      "finished_at": "2026-10-18T18:39:00+02:00",
      "effort": null,
      "notes": null,
      "sets": [
        // weight in kg, reps or duration_s, rir = reps in reserve (0 = to failure)
        { "exercise_id": "incline_db_press", "exercise_order": 0, "set_index": 0, "weight_kg": 34, "reps": 11, "rir": 2, "is_warmup": false }
      ]
    }
  ],

  // Optional: body weight
  "weights": [{ "measured_at": "2026-10-28T07:30:00+01:00", "weight_kg": 77.05 }],

  // Optional: meals. `id` must be a UUID, stable between imports (re-importing replaces the meal).
  "food": [
    {
      "id": "0e5c2f1a-8f8e-5d2b-9a51-3c1d2e4f5a6b",
      "eaten_at": "2026-10-28T13:00:00+01:00",
      "meal": "lunch",
      "title": "Pasta al pomodoro",
      "items": [{ "name": "Pasta", "grams": 90, "kcal": 320, "protein_g": 11, "carbs_g": 65, "fat_g": 1.5, "fiber_g": 3, "sugar_g": 3 }],
      "kcal": 410, "protein_g": 13, "carbs_g": 72, "fat_g": 8, "fiber_g": 5, "sugar_g": 8,
      "origin": "Build With Science"   // optional: the app the meal comes from, shown next to it
    }
  ],

  // Optional: profile. Before the person's first set-up it pre-fills the questions; afterwards it only
  // fills fields that are still empty.
  "profile": { "goal": "fat_loss", "start_weight_kg": 78, "steps_goal": 7000, "workouts_per_week": 3, "experience": "intermediate" }
}
```

Exercises that do not exist in Forza! can be declared once and referenced as `custom:<key>`; they are
created as custom exercises (shared with everyone when the coach imports, private when the person does),
or reused if one with the same English name exists:

```jsonc
"custom_exercises": [{ "key": "ground_sit", "name_en": "Ground sit", "name_it": "Ground sit", "kind": "time", "muscles": ["abs"] }]
// … then in templates or sets: "exercise_id": "custom:ground_sit"
```

Otherwise `exercise_id` is an id from [`app/src/data/exercises.json`](../app/src/data/exercises.json) or a custom
exercise id (`c_…`, see Forza! Coach → Exercises & videos).

Profile fields: `sex` (`female`/`male`), `birth_year`, `height_cm`, `goal` (`fat_loss`/`muscle_gain`/`maintain`),
`activity_level` (`sedentary`/`light`/`moderate`/`active`/`very_active`), `start_weight_kg`, `target_weight_kg`,
`steps_goal`, `workouts_per_week`, `experience` (`beginner`/`intermediate`).
