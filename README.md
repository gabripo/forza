<p align="center"><img src="app/public/pwa-192.png" width="96" alt="Forza! logo"></p>

<h1 align="center">Forza!</h1>
<p align="center"><b>Help the people you love get stronger and healthier, one small step at a time.</b></p>
<p align="center">Free · open source · English and Italian · works on any phone<br><a href="README.it.md">🇮🇹 Leggi in italiano</a></p>

---

Our parents are getting older. We know that **strength training, enough protein, walking and good sleep**
keep them independent and healthy for many more years, but "go to the gym and eat better" is not advice
anyone can follow.

**Forza!** is a simple, friendly app that you set up *for* a parent or a relative. It guides them through
beginner-friendly workouts, explains their progress in plain words, estimates meals from a photo or a
barcode, and teaches the basics with printable infographics. You, the family "coach", follow their progress
and adjust their plan from your own computer.

<p align="center">
  <img src="docs/screenshots/dashboard.jpg" width="190" alt="Home: daily checklist and today's workout">
  <img src="docs/screenshots/workout.jpg" width="190" alt="Workout with pre-filled weights and warm-up sets">
  <img src="docs/screenshots/strength.jpg" width="190" alt="Exercise history and personal records">
  <img src="docs/screenshots/progress.jpg" width="190" alt="Progress in plain words">
</p>

*Screenshots of the demo family member, retaken automatically after every change to the app.*

## For the person training

| | |
|---|---|
| <img src="docs/screenshots/dashboard.jpg" width="200" alt="Home"> | **A clear plan for every day.** Photo, dictate and barcode buttons right at the top, the tip of the day, a short checklist (workout or rest, weigh-in, meals, steps), today's workout, the weight trend and the next lesson. Not training in the app? Hide the Train section. Every part of the page can be moved up or down, by them or by their coach. |
| <img src="docs/screenshots/workout.jpg" width="200" alt="Workout"> | **Workouts for beginners.** Every exercise has photos, three simple steps and a video. Weights are **pre-filled and go up automatically** when they get stronger. Warm-up sets, supersets, a rest timer with sound, and "how hard was it?" for each set. Works without signal in the gym. The main ideas link to the studies behind them. |
| <img src="docs/screenshots/progress.jpg" width="200" alt="Progress"> | **Progress anyone can understand.** Weight trend (smoothed, so daily ups and downs don't discourage), strength gained, consistency, steps, each with a verdict in words and one concrete tip. Streaks, records, private progress photos and a "share with family" card. |
| <img src="docs/screenshots/voice.jpg" width="200" alt="Dictate a meal"> | **Or just say it.** Tap **Dictate** and say what you ate (“two eggs, a slice of bread and a coffee”): the phone's own speech recognition writes it down, Forza! recognises the foods and amounts on the phone, and asks the AI only about the ones it does not know. Fix the words, and the grams only if you want to. |
| <img src="docs/screenshots/food.jpg" width="200" alt="Next meal idea"> | **What to eat next.** After each meal, an idea for the next one that brings what the day is missing (chicken and potatoes for lunch? Dinner with healthy fats), already sized to the calories left and one tap away from logging. |
| <img src="docs/screenshots/barcode.jpg" width="200" alt="Barcode"> | **Food in three ways.** Snap a photo of the plate (AI estimates every item), **scan a barcode** (Open Food Facts, millions of products), or add it by hand. After a photo, Forza! first says **what to do** ("Add some protein!"), then shows the numbers; one tap retakes the photo or fixes it by hand. Every plate gets a score for losing fat and for building muscle. |
| <img src="docs/screenshots/calories.jpg" width="200" alt="Calorie target"> | **A calorie target that explains itself.** Five steps with their own numbers: energy at rest, walking and training (from the phone's steps), a reality check with the scale, the goal, and how calories split into protein, fat and carbs. |
| <img src="docs/screenshots/lesson.jpg" width="200" alt="Lessons"> | **Learn the basics, then more.** A beginners' course of 14 short infographics (protein, balanced plates, meal tricks for steady energy, sleep, …) and expert lessons (glycogen, meal timing, creatine, …), each with a two-question quiz, points and badges. Print them on A4 paper, in English or Italian. |

Steps and weight arrive by themselves from **Health Connect** (Android, every hour) or **Apple Health** (iPhone),
so smart scales like **Eufy** just work. Coming from **Build With Science**? The whole workout history comes
along, and it **stays in sync**: meals through Health Connect, new workouts through Forza! Coach.
A friendly, opt-in **family challenge** gives points for showing up (workouts, lessons, steps, meals logged),
never for weight, so a beginner can beat the family athlete.

## For you, the family coach

| | |
|---|---|
| <img src="docs/screenshots/coach.jpg" width="420" alt="Forza! Coach"> | **Forza! Coach** runs on your computer (Mac, Windows or Linux). It sets everything up for you, creates the accounts, and shows each person's weight, strength, workouts, meals and check-ins. Edit their workout plan from home: it appears on their phone at the next opening. Add AI keys from several services (Gemini, OpenRouter, …) and choose the order in which food photos try them. |
| <img src="docs/screenshots/coach-signin.jpg" width="420" alt="Sign in with a QR code"> | **No passwords for them.** Make a QR code, they point the phone camera at it, and Forza! opens already signed in. Print it on a welcome card with simple instructions. |
| <img src="docs/screenshots/coach-import.jpg" width="420" alt="Import from Build With Science"> | **Bring their history, and keep it in sync.** Connect their Android phone (cable or Wi-Fi) and Coach imports every workout, set and effort, the weekly plan and the goal from Build With Science. Turn on automatic sync and new workouts follow by themselves. |

## Get started

You need a computer and about 30 minutes. No technical skills, no cost.

1. **Install [Node.js](https://nodejs.org/en/download)** (the LTS version) and **download Forza!**
   (green **Code** button above → **Download ZIP**, then unzip it).
2. **Double-click "Forza Coach"** in the folder (`Forza Coach (Mac).command`, `Forza Coach (Windows).bat`,
   or `forza-coach-linux.sh`). Follow the four steps on screen: a free Supabase account, your database, an
   optional free key for food photos, install.
3. **Add a person** and let them **scan the QR code** with their phone. Done.

👉 The **[Coach guide](docs/coach-guide.md)** ([italiano](docs/coach-guide.it.md)) walks you through every
step, including health sync, smart scales and the Build With Science import.

## Private and free

- Each family has **its own database** (a free Supabase project that belongs to you). Each person sees only
  their own data. Only the coach can create accounts.
- The master key stays **on the coach's computer**, in its password store (Keychain, Credential Manager or
  the Linux keyring).
- Everything runs on free plans: Supabase, GitHub Pages, Google Gemini (food photos), Open Food Facts.

## Documentation

| | |
|---|---|
| [Coach guide](docs/coach-guide.md) | Step-by-step set-up for the family coach (also in [Italian](docs/coach-guide.it.md)) |
| [How Forza! is designed](docs/design.md) | Features, formulas, architecture, security and the reasons behind them |
| [Advanced set-up](docs/advanced-setup.md) | Command line on macOS/Windows/Linux, Supabase CLI, your own copy of the app, local development |
| [Food photo AI](docs/food-ai.md) | Test results with well-known foods, and free alternatives to Gemini |
| [Apple Shortcut](docs/apple-shortcut.md) · [Import format](docs/import-format.md) | iPhone health sync · importing history from other apps |

## Contributing

Ideas, translations (more languages are welcome!), exercise content and bug reports are very welcome: open
an issue or a pull request. Health content aims to be simple **and** correct: if something looks inaccurate,
please tell us.

## Disclaimer

Forza! gives general information and **does not replace medical advice**. Anyone starting an exercise
programme, especially older people or people with health conditions, should talk to their doctor first.

## License

[MIT](LICENSE)
