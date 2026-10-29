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
| The family challenge | opt-in; `family_board()` returns only names and points, and only to people who joined |
| Phone helpers sending data | a personal sync key; only its SHA-256 hash is stored; the helper's setup link asks for confirmation |
| Untrusted values in Coach's UI | every database value is HTML-escaped |
| AI answers | validated and clamped (numbers, ranges, lengths) before reaching the app |
| Android helper updates | signed release key, kept by the maintainer (Keychain + GitHub secrets) |

On macOS, Coach uses Apple's `security` tool rather than a Node keyring library: items created by
`security` are readable by it without an "allow access?" prompt each time Node is updated.

## Features and why they work this way

### Home

Built so that the most frequent action takes one glance and one tap:

1. **Photo**, **dictate** and **barcode** buttons at the very top: logging a meal never needs a menu.
2. **The tip of the day**, highlighted in a coloured card with a link to the lesson that explains it.
3. A **daily checklist** (workout or rest day, weigh-in, meals, steps: "3 of 4 done"). A checklist is
   easier to act on than a page of statistics.
4. The next workout, the weight trend, the next lesson (with a teaser quiz question and the points it is
   worth), today's food, this week's points and the family challenge.

The **Log weight** button disappears when a scale already sends weigh-ins (any weigh-in from Health Connect
or Apple Health in the last 30 days): one less thing to do, and no duplicate entries. Until the day's
weigh-in arrives, the checklist item says "step on the scale (it syncs by itself)". Every weigh-in form reminds people to weigh in the same conditions: just woken
up, after the toilet, before drinking or eating.

Home sits in the middle of the bottom bar, raised, so it is always under the thumb. People who never log
workouts can hide **Train** (Settings → Training section, or from Coach): the tab becomes Settings, and
workout items leave the Home page.

**Arrange the page.** Each part of Home (log food, tip, checklist, next workout, lesson, weight, food today,
points, strength, week) can be moved up or down: in the app (Settings → Arrange the Home page, big arrow
buttons rather than dragging, saved at each move) or by the coach in Coach (Profile → Home page order). The
order is one list of ids in the profile (`home_order`); ids are defined once in
[`shared/home-sections.mjs`](../shared/home-sections.mjs), and parts added in later versions slot into
their default place.

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
- **By hand**: about 230 common foods and Italian dishes with typical portions (searched by everyday names
  too: "hamburger di tacchino", "pasta e fagioli", "nutella"), or custom values.

Every plate gets a **score for fat loss and for muscle gain** (0–100) from protein share, fibre, calories
against the meal's share of the day, sugar and ultra-processing, with the reasons spelled out.

**Dictate.** Tap **Dictate** and say the meal. The words come from the phone's own speech recognition (the
Web Speech API in Chrome on Android and Safari on iPhone; where a browser lacks it, such as Firefox, the
microphone key of the keyboard does the same), so no speech model runs anywhere. The sentence is then read
**on the phone**: it is split at "and", "with" and commas, each part is matched to the built-in food table
(with everyday names: "pollo", "spaghetti", "caffè"; singular and plural; longest name first) and its
amount understood (grams, kilos, spoons, slices, glasses, pots, "two", "half"; a bare small number counts
pieces, a large one grams). Only the words it does not recognise ("lasagne") go to the food AI, as text; if
the AI is not set up, the rest still counts and the person is told what was left out. The words can be
corrected before going on; grams appear as inputs only after **Adjust quantities**, to keep the screen
simple. "Not right? Ask the AI" sends the whole sentence instead.

Dishes are recognised as one food: names containing "e" or "con" ("pasta e fagioli", "toast prosciutto e
formaggio") are kept whole before the sentence is split; a form followed by what it is made of ("hamburger
di salmone", "polpette di tacchino") counts as that food in the form's portion; grams said for a plate of
pasta or risotto are read as the dry pasta in it ("80 grammi di pasta al pomodoro" is a full plate). Words
that are neither food, amount nor description ("al curry") go to the AI. Chrome on Android repeats earlier
words in each new piece of recognised speech ("due hamburger", "due hamburger di tacchino"): pieces are
merged by their overlap, and Android listens one sentence at a time.

**Advice before numbers.** After a photo, the first thing shown is at most three things to do ("Add some
protein!", "Add vegetables", "A smaller portion"), or a compliment if the plate is good; calories and protein
follow in one line, and the item list with grams is behind a **Details** toggle. Tapping a piece of advice
explains it and offers two ways forward: **retake the photo** (after changing the plate) or **adjust it by
hand** (the manual form opens pre-filled with the items). Beginners act on a sentence; a number like
"38% of calories from fat" means nothing to them.

**The next meal.** Once a meal is logged, Forza! suggests the next one. It looks at what the day has so far
against the targets: the nutrient lagging furthest behind the calories (half the calories eaten but a fifth
of the fat → fat), or "something light" when fewer than 300 kcal are left. It picks a real dish built around
that nutrient (salmon and vegetables, a tuna and bean salad, lentils, chicken salad, yogurt with oats…),
made of foods from the built-in table and scaled to the calories left for that meal, so "Log this meal"
opens it pre-filled. Snacks are suggested only to people who log snacks; "Another idea" shows the next best
dish.

The food page shows the last seven days as dots: a day is **balanced** when it has at least two meals,
calories within ±15% of the target and at least 80% of the protein target.

### Sources

The Training section explains why it works the way it does, in plain words, with the studies behind each
point (a "Source" link opens the reference and its DOI): strength training twice a week for every adult
(WHO 2020 guidelines; NSCA position statement on older adults, Fragala 2019), strength gains at any age
(Peterson 2010), progressive overload (ACSM position stand 2009), stopping short of failure (Grgic 2022) and
the reps-in-reserve effort scale (Zourdos 2016), light and heavy loads (Schoenfeld 2017), weekly sets and
frequency (Schoenfeld 2016, 2017), warm-up sets (Fradkin 2010), rest between sets (Grgic 2018), supersets
(Weakley 2017) and protein (Morton 2018). The list lives in
[`app/src/data/sources.ts`](../app/src/data/sources.ts).

### Learn

Two tracks of infographics, in English and Italian:

- **Beginners' course** (14 lessons): why strength matters with age, macronutrients, the balanced plate and
  hand portions, protein, where nutrients are, fibre, insulin sensitivity, eating around training, meal
  ideas, **steady energy** (carbs spread over the day instead of one big pasta lunch) and **meal tricks**
  (protein at breakfast, vegetables first, the "carbs as a side" plate, a protein snack instead of a sweet
  one), moving more, sleep, ten small habits.
- **Expert lessons** (6): glycogen, meal timing, creatine, progressive overload, protein timing, recovery.

Every lesson ends with a **two-question quiz**; each answer explains itself, right or wrong.

**Printing on A4.** Lessons are real text and SVG, not images, so they print sharp: one lesson, the whole
course, the expert track or everything, laid out on ISO A4 sheets (210 × 297 mm, `@page size A4`, a page
break between lessons and none inside a card). The print page (`#/learn/print/course?lang=it`) works
without signing in, so a coach can print the lessons for someone who does not use a phone; "Save as PDF"
in the print dialog gives a file.

### Motivation

Older beginners do not open a nutrition lesson because it is good for them; they open it because it is
short, it promises something and it pays back at once. The app uses a few well-known levers, gently:

| Lever | In Forza! |
|---|---|
| Immediate reward | points and confetti when a quiz is passed; a trophy on the lesson |
| Curiosity gap | the Home page shows the next lesson's quiz question without the answer |
| Goal gradient | the Learn page shows the next badge and how close it is ("2 of 5 lessons") |
| Small wins | lessons take two minutes; quizzes have two questions; a failed quiz just says "try again" |
| Collection | eight badges: first lesson, 5 lessons, 5 quizzes, the course, 3 expert lessons, a balanced week, protein three days in a row, a week of food logging |
| Social proof, friendly | the opt-in family challenge (below) |

Points: workout 20, lesson read 10, quiz passed 20, a day with two or more meals logged 10, step goal
reached 10, weigh-in 5. **Nothing is ever scored on weight or calories**: a person who does not yet know what
a calorie is can beat a gym regular by showing up, reading and logging. No streak is ever "lost" with a red
message; the app only counts what was done.

**Family challenge.** A weekly or monthly leaderboard of the people in the same Forza! project, with
medals and a gentle "12 points to catch up with Anna". It is **opt-in**: people who have not joined do not
appear and cannot see it. The board comes from one database function, `family_board()`, that runs with
elevated rights but returns only display names and point totals (plus workouts, lessons and active days
counts), and only to callers who joined; nobody can read anyone else's weight, meals or photos through it.

### Steps, weight and scales

- **Android**: the *Forza! Health* helper reads steps, weight (with body fat), walks/exercise and **meals**
  from Health Connect every hour (WorkManager, which survives reboots and app updates) and posts them with the
  personal sync key. Meals are grouped per day, meal and source app, each group gets a stable id, and the
  server replaces the whole window it receives: an entry edited or deleted in the food app is edited or
  deleted in Forza! too. Synced meals show their source and are changed only in the app that logged them.
- **iPhone**: an Apple Shortcut reads Apple Health and posts the same data; it can run daily as an automation.
- **Smart scales** (Eufy and others) write to Health Connect / Apple Health, so they need no integration
  of their own; past weigh-ins can also be imported from a CSV export.
- **Sync now**: Settings → Connect Health & scale has a button that wakes the Android helper at once
  (`forzahealth://sync`), and, for Build With Science, one that asks Coach to import new workouts at its next
  check (a timestamp in the profile, which Coach reads every minute).

### Importing from Build With Science

Build With Science keeps its data in its own cloud and has no export. Reading the copy it keeps on the
phone is not possible either: Android stores each app's database in a private folder (`/data/data/…`) that
only that app can open. A computer over ADB can reach it only if the app is "debuggable" or allows backups,
and Build With Science is neither (`run-as` is refused, backups are disabled and nothing is kept in the shared
folders). Rooting the phone would work but voids its security, which is not acceptable for a family
member's phone. Three paths cover it instead:

| Data | How it reaches Forza! | Automatic? |
|---|---|---|
| Weigh-ins | Build With Science (and the scale) store them in Health Connect → *Forza! Health* helper | yes, hourly |
| Food diary | Build With Science writes every entry to Health Connect (Nutrition) → helper | yes, hourly |
| Workouts, plan, goal | the *Forza! Health* helper reads the app on the phone itself, or Forza! Coach over ADB (below) | on request or with a daily reminder (phone); when the phone is connected and idle (Coach) |

Workouts are not in Health Connect (Build With Science does not write exercise sessions), so Forza! Coach reads
them the way a person would: through Android's
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
- **Automatic sync**: Coach checks every minute for phones with automatic sync on, connected by cable or
  Wi-Fi debugging. It starts only when the phone is awake, unlocked and untouched for 3 minutes (Android's
  power manager reports the last touch), posts a notification on the phone first, imports only the new
  workouts (the plan at most once a day), then returns to the home screen. Each phone is recognised by its
  own serial number, the same over USB and Wi-Fi. "Start when I log in" keeps Coach running in the
  background (a LaunchAgent on macOS, the Startup folder on Windows, XDG autostart on Linux); a second start
  opens the running Coach instead of starting another.
- **Not imported**: height and age (not shown by the app) and progress photos. The food diary screen cannot
  be read (it never becomes idle), which is why meals come through Health Connect instead.

**On the phone, without a computer.** The extractor talks to the phone through a handful of methods (read
the screen's texts and positions, tap, swipe, back, restart the app, which app is in front, the colour of a
pixel). The *Forza! Health* helper provides the same methods with an Android **accessibility service**: the
accessibility tree (what `uiautomator dump` reads too), gestures (`dispatchGesture`), global Back/Home, and
`takeScreenshot` for the effort dots. The extractor and the converter are not rewritten: the same files
from `coach/lib` are packed into the APK at build time and run in a hidden WebView inside the helper. So:

- one reader for Coach and phone, with the same read-only rules and the same ids, so both can be used;
- conversion happens on the phone, in its time zone, like Coach on the family computer;
- the new `bws-ingest` Edge Function, authenticated with the person's sync key like `health-ingest`, tells
  the phone which workouts it already has (and the last 90 days, which the plan needs) and imports the
  result, keeping only workouts, the plan and the goal from it, with the same plan guard as Coach;
- the service listens only to Build With Science and acts only during a sync the person started (from the
  helper, from Forza!'s *Sync workouts on this phone*, or from the optional daily reminder). A thin bar over
  the status bar keeps the screen on, says what is happening and stops the sync when tapped; locking the
  phone or opening another app stops it too.

Why not something else: Android keeps the app's database private (above); the phone's own *wireless
debugging* could give the helper ADB, but it switches off at every reboot and Wi-Fi change; reading Build With
Science's cloud would mean handling the person's password and going against its terms. Limits: the phone
must be unlocked while it reads (nothing can unlock a phone with a PIN), Android 11 or newer, and on
Android 13+ a helper installed outside the Play Store needs "Allow restricted settings" once.

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
- **Food photo AI**: one key per provider (Gemini, OpenRouter, Groq, Mistral, OpenAI or any
  OpenAI-compatible service), an overview of which keys are set, and the **model use order**: a list of
  models tried top to bottom. Models whose provider has no key are greyed out and skipped. For OpenRouter the
  model list comes live from its catalogue (vision models only, free ones first). **Test** sends a photo
  through one model or the whole order and reports which model answered, how long it took and why the others
  were skipped.
- **Per-person settings**: everything in the profile, including hiding the Train section and the order of
  the Home page.
- **Imports**: Build With Science (cable or Wi-Fi, once or automatically) and history files.
- **Background mode**: optional start at login, so automatic syncs need no one at the computer.
- **Runs everywhere**: double-click launchers for macOS (`.command`), Windows (`.bat`) and Linux (`.sh`)
  install the dependencies on first run; a CLI (`node cli.mjs`) does the same for servers and power users.
  If Android tools are missing, Coach downloads Google's official platform-tools.

## Food photo AI: choices

Gemini is the default because its free tier needs no credit card and handles food photos well, with a
response schema that guarantees valid JSON. Free tiers have daily limits and busy hours, so the function
works through a **model use order** (`FOOD_AI_ORDER`): each model gets 30 seconds; if it is out of quota
(429), overloaded (503), out of credit (402) or silent, the photo goes to the next one, and the person only
notices a slightly longer wait. Besides Gemini, the function speaks the OpenAI chat format, so OpenRouter,
Groq, Mistral, OpenAI or any compatible service (Cloudflare Workers AI, a self-hosted model) can be added with
a key. Measurements and the comparison of free alternatives are in [food-ai.md](food-ai.md).

## What runs where

Everything a person uses daily runs in the cloud, so **the coach's computer can be off or offline**:

| Part | Runs on | Needs the coach's computer? |
|---|---|---|
| The app | GitHub Pages (static files), cached on the phone as a PWA | no |
| Data, sign-in, photos | the family's Supabase project | no |
| Food photo AI | Supabase Edge Function → AI provider | no |
| Steps, weight, scale, meals from other apps | the phone (Android helper, hourly; Apple Shortcut) → Supabase | no |
| Build With Science **workouts** | the phone itself (helper's accessibility service → `bws-ingest`), or Forza! Coach over ADB | no (phone); yes, if Coach does it |
| Following progress, editing plans | Forza! Coach (or nothing: the person's own app works without it) | only when the coach wants to look |

Docker is **not** needed to use Forza!: it is only used by developers to run a local copy of Supabase
([advanced set-up](advanced-setup.md#local-development)). Coach talks to the cloud project directly.

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
- End to end: the screenshots workflow (`.github/workflows/screenshots.yml`) starts a local Supabase stack
  with the demo data, opens the app and Coach in a browser, goes through the main screens (Home, a workout,
  food by dictation, a barcode, the calorie explanation, lessons, Coach) and commits the pictures that
  changed, so the README always shows the current version ([`scripts/screenshots`](../scripts/screenshots)).

## Known limits

- Build With Science workouts: Android only (iPhone apps cannot be read by another app or a computer), tied
  to the app's current layout (a new version of Build With Science may need small changes to the extractor),
  and the phone must stay unlocked for the 1–3 minutes it reads. Meals and weigh-ins have no such limit.
- The food photo AI gives estimates, not measurements: portions should be checked.
- Dictation uses the browser's speech recognition where it exists (Chrome on Android, Safari on iPhone);
  elsewhere the keyboard's microphone key does the same job. Foods outside the built-in table need the food AI.
- Health data on iPhone needs the Shortcut to run (iOS does not let web apps or background helpers read
  Apple Health on their own).
- Forza! is not a medical device and gives general information only.
