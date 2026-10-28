# Forza! app

The phone app (installable PWA). React + TypeScript + Vite + Tailwind CSS.

```bash
npm install
npm run dev     # needs app/.env.local, see ../docs/setup.md
npm run build
```

- `src/pages/` – one file per screen (dashboard, training, progress, food, learn, settings)
- `src/lib/calc.ts` – all health maths (TDEE, targets, weight trend, estimated max, plate scores)
- `src/lib/workout.ts` – workout in progress, progression suggestions, offline outbox
- `src/locales/` – English and Italian texts (`it.ts` is type-checked against `en.ts`)
- `src/data/exercises.json` – exercise catalogue (EN/IT instructions); photos in `public/exercises/`
- `src/pages/learn/content.ts` – the infographics content
