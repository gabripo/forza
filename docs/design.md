# How Forza! is designed

This document gathers the features of Forza! and the reasons behind its design choices, for
contributors and for anyone who wants to understand what the app does with their data.

## Who it is for

Two people use Forza!, with very different needs:

- **The person training**, often an older parent or grandparent who has never lifted weights, may not like
  apps, and needs short, clear, encouraging steps. Everything they see has to be readable at a glance, with
  big buttons, plain words and no jargon.
- **The coach**, usually a son, daughter or grandchild, sets everything up, prepares the workout plan and
  follows the progress from home. They are comfortable with a computer but are not developers.

So the design splits the work: the app on the phone stays simple; anything technical (accounts, server,
imports, plan editing) happens in **Forza! Coach**, on the coach's computer.

## Principles

1. **Simple and kind.** One main action per screen, big tap targets, a daily checklist instead of
   dashboards full of numbers, verdicts in words (*Good / OK / Needs work*) with one concrete tip.
2. **Every number is explainable.** All health maths lives in one file
   ([`app/src/lib/calc.ts`](../app/src/lib/calc.ts)) and the app can show where each figure comes from
   (for example the step-by-step calorie target).
3. **Private by default.** Each family has its own database; each person sees only their own data;
   accounts are created only by the coach; the master key never leaves the coach's computer.
4. **Free to run.** Every piece works on free plans (Supabase, GitHub Pages, Gemini, Open Food Facts).
5. **Works in a gym basement.** Workouts are saved on the phone first and uploaded when the connection
   comes back; the app is installable and caches what it needs.
6. **Bilingual.** English and Italian everywhere, switchable at any time; the Italian copy is
   gender-neutral.

## Architecture

```
 Phone (any browser, installable PWA)                    Coach's computer (macOS / Windows / Linux)
 ┌──────────────────────────────┐                        ┌───────────────────────────────────────┐
 │ Forza! app (React, Vite)     │                        │ Forza! Coach (Node, local web UI)     │
 │  - publishable key only      │                        │  - secret key in the password store   │
 │  - row-level security        │                        │  - Supabase Management API (set-up)   │
 └──────┬──────────────┬────────┘                        │  - ADB (Build With Science import)    │
        │              │ barcodes                        └──────────────┬────────────────────────┘
        │              └──────────► Open Food Facts                      │
        ▼                                                                ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │ The family's Supabase project: Postgres (RLS) · Auth · Storage · Edge Functions        │
 │   food-estimate ──► Google Gemini (or any OpenAI-compatible vision API)                │
 │   health-ingest ◄── Android helper (Health Connect) / Apple Shortcut (Apple Health)    │
 └────────────────────────────────────────────────────────────────────────────────────────┘
```

- **App**: React 19 + TypeScript + Tailwind CSS 4, built with Vite as a Progressive Web App and hosted on
  GitHub Pages. It uses a hash router (`#/…`) because GitHub Pages serves only static files. Charts are
  hand-written SVG (small, accessible, themeable). Exercise photos are cached the first time they are seen.
- **Server**: one Supabase project per family. Tables have row-level security policies "own rows only";
  the few operations that need more power (calling the AI with a shared key, receiving health data from a
  phone helper) are Edge Functions that check the caller themselves.
- **One app for every family**: the app does not hard-code a server. The setup QR code carries the
  family's server address and publishable key (both public by design) and the phone remembers them. A
  build-time default is used until a code is scanned, so a fork can still pin its own server.
- **Forza! Coach**: a small Node web app that listens only on `127.0.0.1`. Node runs the same on the three
  desktop systems, and the browser gives a familiar interface without an installer.

## Accounts and signing in

- **Only the coach creates accounts**; public sign-up is turned off by the installer.
- **No passwords for the person.** Coach makes a one-time sign-in code: a link containing the server, the
  publishable key and the hashed token of a Supabase magic link, shown as a QR code (or printed on a
  welcome card). It works once, for 24 hours. The app asks for confirmation and shows which server it
  connects to, so a stray code cannot silently move someone to another server. Everything sits after the
  `#` of the address, which browsers never send to a server.
- **No email needed.** Without an email, Coach uses a private placeholder address under `.invalid`, a
  domain that by definition never exists; the person signs in with the QR code. A real email and a
  password can be added later.
- **Sessions persist**: the person signs in once per phone.
- **iPhone**: a home-screen web app keeps its own storage, separate from Safari, so on iPhone the person
  installs the app first and scans the code from inside it ("Scan my code" uses the camera in the app).
- The QR scanner is the same component as the food barcode scanner.

## Security

| Concern | Measure |
|---|---|
| People seeing each other's data | Postgres row-level security on every table and storage folder |
| Strangers creating accounts | sign-up disabled; only the service key (Coach) can create users |
| The master (secret) key | only in Coach, in the OS password store; never in the app, never in git |
| Other websites calling Coach | Coach binds to 127.0.0.1, rejects other `Host` headers (DNS rebinding), needs a random per-launch token, sends a strict Content-Security-Policy |
| Draining the shared AI key | per-person daily limit (`FOOD_AI_DAILY_LIMIT`), counted server-side |
| Phone helpers sending data | a personal sync key; only its SHA-256 hash is stored; the helper's setup link asks for confirmation |
| Untrusted values in Coach's UI | every database value is HTML-escaped |
| AI answers | validated and clamped (numbers, ranges, lengths) before reaching the app |
| Android helper updates | signed release key, kept by the maintainer (Keychain + GitHub secrets) |

On macOS, Coach uses Apple's `security` tool rather than a Node keyring library: items created by
`security` are readable by it without an "allow access?" prompt each time Node is updated.

## Features and why they work this way

### Home

A greeting, a **daily checklist** (workout or rest day, weigh-in, meals, steps: "3 of 4 done"), the next
workout from the weekly schedule, the weight trend, steps, today's food and the next lesson. A checklist is
easier to act on than a page of statistics.

### Training

- **Exercise library** (84 exercises) with start/end photos (from the public-domain
  [free-exercise-db](https://github.com/yuhonas/free-exercise-db)), three simple steps, one key tip and a
  video search link that the coach can replace with a chosen video.
- **Weights are pre-filled** using **double progression**, the simplest method that works for beginners:
  stay at a weight until every set reaches the top of the rep range, then add the smallest step
  (2 kg for dumbbells, 2.5 kg otherwise).
- **Effort per set** on a four-step scale (Easy · Right · Hard · Limit), stored as reps in reserve.
- **Rest timer** with sound and vibration; the screen stays on during a workout.
- **Warm-up sets** are added automatically to heavy compound lifts (50% × 8, 70% × 4, 85% × 2 of the
  working weight) and never count as records.
- **Supersets**: two exercises alternate with one rest after the round, to save time.
- **Weekly schedule**: workouts can be pinned to weekdays; the app shows today's workout or a rest day
  and the week's done/missed/upcoming days, including walks synced from the phone.
- **Exercise history** with personal records (heaviest weight, best set).
- **Offline first**: a finished workout is written to an outbox on the phone and uploaded by a
  database function (`save_workout`) that is idempotent, so retries never duplicate it.

### Progress

- **Weight trend**: daily weigh-ins are smoothed with an exponential moving average (15% weight to each
  new day, adjusted for gaps), so one salty dinner does not look like a failure. Body weight is shown
  with **two decimals**, as smart scales measure it.
- **Strength**: estimated one-repetition maximum (Epley formula, capped at 15 reps) per exercise, from
  working sets only.
- **Verdicts** for weight pace (against the goal pace), strength, consistency, steps and food, each with
  a concrete tip; weekly **check-ins** for energy, sleep, mood and waist.
- **Streaks and records** (weeks in a row with a workout, recent personal records), **progress photos**
  (private storage) and a **"Share with family"** image.

### Food and the calorie target

The calorie target is built in five explainable steps, shown in the app with the person's own numbers
(*Food → How is this calculated?*):

1. **At rest (BMR)**: Mifflin-St Jeor, `10 × weight + 6.25 × height − 5 × age + 5` (men) or `− 161`
   (women), using the smoothed trend weight.
2. **Moving**: with steps from the phone, `BMR × 1.2` (daily basics) + walking (0.04 kcal per step for
   70 kg, scaled by weight) + training (≈ 4 kcal per kg of body weight per hour above rest, averaged over the
   week); without steps, `BMR ×` the activity factor the person chose (1.2–1.9).
3. **Reality check**: after 14 days with meals logged and a weight trend, the measured need is
   `average intake − weight change × 7,700 kcal / days`; the app then uses the average of formula and
   measurement (only when the measurement is plausible).
4. **Goal**: fat loss −20% (about 0.5% of body weight a week), muscle gain +250 kcal, maintain = TDEE.
   A **weekly check-in** compares the trend with the goal pace and suggests ±100–150 kcal, never more than
   ±600 in total; never below 1,200 (women) / 1,500 (men) kcal.
5. **Split**: protein 1.8 / 1.6 / 1.4 g per kg (at least 1.4 after 60; above BMI 30 a reference weight
   is used), fat 30% of calories, carbohydrates the rest, fibre 14 g per 1,000 kcal.

Ways to log a meal:

- **Photo**: the Edge Function asks a vision model for every item with grams and nutrients, using a strict
  JSON schema; portions can be corrected and nutrients scale with the grams.
- **Barcode**: the phone reads EAN/UPC codes (built-in `BarcodeDetector` on Android, a WebAssembly
  decoder elsewhere, served by the app itself) and looks the product up in **Open Food Facts**: free, open,
  no key, and strong on Italian and European products. This is the same source Build With Science falls
  back to for barcodes. Unknown product? A photo of the **nutrition label** is read by the AI (values per
  100 g). Recently scanned products are one tap away.
- **By hand**: 60+ common foods with typical portions, or custom values.

Every plate gets a **score for fat loss and for muscle gain** (0–100) from protein share, fibre, calories
against the meal's share of the day, sugar and ultra-processing, with the reasons spelled out.

### Learn

Twelve beginner infographics, printable on A4 or saved as images, in a short guided course: why strength
matters with age, macronutrients, the balanced plate and hand portions, protein, where nutrients are,
fibre, insulin sensitivity, eating around training, meal ideas, moving more, sleep, ten small habits.

### Steps, weight and scales

- **Android**: the *Forza! Health* helper reads steps, weight (with body fat), and walks/exercise from
  Health Connect a few times a day (WorkManager) and posts them with the personal sync key.
- **iPhone**: an Apple Shortcut reads Apple Health and posts the same data; it can run daily as an automation.
- **Smart scales** (Eufy and others) write to Health Connect / Apple Health, so they need no integration
  of their own; past weigh-ins can also be imported from a CSV export.

### Importing from Build With Science

Build With Science has no export, so Forza! Coach reads it the way a person would: through Android's
accessibility tree (`uiautomator dump`) over ADB, plus screenshots for the coloured effort dots
(green = easy, yellow = moderate, orange-red = hard). Design choices:

- **Read-only**: it only taps rows that open and close, "Preview" and "Back"; it refuses to tap anything
  labelled Start, Edit, Change, Delete, Skip or Log, and stops if the phone locks or another app comes to
  the front.
- **Resumable and incremental**: every workout read is saved immediately; a new run skips workouts already
  read or already in Forza!.
- **Stable ids**: each workout gets a UUID derived from its name and date, so importing twice never
  duplicates anything.
- **Faithful plan**: weekdays and supersets come from the plan preview; the number of sets is capped by
  what was really done recently (Build With Science counts optional extra sets).
- **Device-independent**: positions are written for one phone and scaled by screen density.
- **Not imported**: the food diary (that screen never becomes idle, so Android cannot describe it),
  height and age (not shown by the app) and progress photos. Weigh-ins come through Health Connect.

The result is a `forza-history-v1` file ([format](import-format.md)), imported by code shared between
Coach and the app ([`shared/history-import.mjs`](../shared/history-import.mjs)).

### Forza! Coach

- **Set-up wizard**: Supabase access token → choose or create a project → optional Gemini key → install.
  It uses the Supabase Management API to apply migrations (recorded like the Supabase CLI does), deploy the
  Edge Functions, close sign-ups and read the keys. No CLI, no Docker. "Update the server" reruns it after
  a new release.
- **People**: create accounts (email optional), make sign-in QR codes and printable welcome cards, fill in
  the profile so the person skips the questions, reset passwords, delete accounts.
- **Following progress**: weight, strength per exercise, workouts with every set, steps, meals with photos,
  check-ins, lessons, calorie check-ins, health-sync status, progress photos (only on request).
- **Plans**: edit exercises, sets, reps, rest, weekdays, supersets, warm-ups and starting weights; copy a
  plan between people; every save keeps the previous version, restorable in one click.
- **Exercises**: video links and coach notes for any exercise; shared custom exercises.
- **Food AI test**: send a photo with the project's secret key to check the key, the model and the speed.
- **Imports**: Build With Science (USB) and history files.
- **Runs everywhere**: double-click launchers for macOS (`.command`), Windows (`.bat`) and Linux (`.sh`)
  install the dependencies on first run; a CLI (`node cli.mjs`) does the same for servers and power users.
  If Android tools are missing, Coach downloads Google's official platform-tools.

## Food photo AI: choices

Gemini is the default because its free tier needs no credit card and handles food photos well, with a
response schema that guarantees valid JSON. The function also speaks the OpenAI chat format, so any
OpenAI-compatible vision API (free tiers of OpenRouter, Groq or Mistral, Cloudflare Workers AI, or a paid
model) can replace it with three settings. Measurements and the comparison of free alternatives are in
[food-ai.md](food-ai.md).

## Languages

All texts live in [`app/src/locales/en.ts`](../app/src/locales/en.ts) and `it.ts` (typed, so a missing
translation is a build error). The language can be changed on the sign-in screen, during the first
questions and at any time in Settings (it applies immediately). Numbers and dates follow the language
(76,55 kg in Italian, 76.55 kg in English).

## Testing

- App: TypeScript strict build, `oxlint`, production build (CI on every push).
- Coach: unit tests with Node's test runner (`npm test`): import conversion (ids identical to earlier
  imports, warm-up detection, effort colours, plan sets, dates without a year), screen parsing, regions,
  key storage fallback.
- Edge Functions: `deno check`.
- End to end: the app and Coach are tried against a local Supabase stack, and on a real Android phone
  over USB (`adb reverse`), including the Build With Science import.

## Known limits

- Build With Science import: Android only (iPhone apps cannot be read from a computer), and tied to the
  app's current layout; a new version of Build With Science may need small changes to the extractor.
- The food photo AI gives estimates, not measurements: portions should be checked.
- Health data on iPhone needs the Shortcut to run (iOS does not let web apps or background helpers read
  Apple Health on their own).
- Forza! is not a medical device and gives general information only.
