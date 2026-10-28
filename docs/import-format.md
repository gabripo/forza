# Importing history from another app

The admin dashboard (person → **Account → Import history**) accepts a JSON file in the
`forza-history-v1` format. Use it to bring over workouts logged in another app, so the
dashboard and the automatic weight suggestions work from day one.

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
  "weights": [{ "measured_at": "2026-10-28T07:30:00+01:00", "weight_kg": 77.0 }]
}
```

Exercises that do not exist in Forza! can be declared once and referenced as `custom:<key>`; they are
created as shared custom exercises (or reused if one with the same English name exists):

```jsonc
"custom_exercises": [{ "key": "ground_sit", "name_en": "Ground sit", "name_it": "Ground sit", "kind": "time", "muscles": ["abs"] }]
// … then in templates or sets: "exercise_id": "custom:ground_sit"
```

Otherwise `exercise_id` is an id from [`app/src/data/exercises.json`](../app/src/data/exercises.json) or a custom
exercise id (`c_…`, see the admin dashboard → Exercises & videos).
