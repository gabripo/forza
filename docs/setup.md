# Set up Forza! for your family

This guide is for the **family administrator**: the person who sets Forza! up and creates
accounts for parents and relatives. Everything runs on free tiers.

| Piece | Where it runs | Cost |
|---|---|---|
| The app (website, installable on phones) | GitHub Pages | free |
| Accounts and data | Supabase (Postgres + Auth + Storage + Edge Functions) | free tier |
| Food photo estimates | Google Gemini API | free tier / pay-per-use |
| Admin dashboard | **only on your computer** (macOS) | free |
| Android step/weight sync | the *Forza! Health* helper APK | free |
| iPhone step/weight sync | an Apple Shortcut | free |

## 1. Fork the repository

Fork `gabripo/forza` on GitHub. The app will live at `https://<you>.github.io/<repo>/`.

## 2. Create the Supabase project

1. Create a free account and project at [supabase.com](https://supabase.com) (choose the EU region if your family is in Europe).
2. **Authentication → Sign In / Providers → turn OFF "Allow new users to sign up".**
   Only you create accounts, from the admin dashboard.
3. Note from **Project Settings → API**: the *Project URL*, the *publishable (anon)* key and the *secret (service_role)* key.

## 3. Deploy the backend

```bash
brew install supabase/tap/supabase
supabase login
./scripts/deploy-backend.sh <project-ref>
```

It applies the database schema (with row-level security: everyone sees only their own data),
deploys the two server functions, stores your Gemini key as a server secret, and checks that
public sign-ups are closed.

Get a Gemini key at [Google AI Studio](https://aistudio.google.com/apikey). Optional settings
(Supabase → Edge Functions → Secrets): `GEMINI_MODEL` (default `gemini-3.6-flash`) and
`FOOD_AI_DAILY_LIMIT` (photos per person per day, default 25).

## 4. Publish the app

In your fork on GitHub:

1. **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**:
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_KEY` = the publishable (anon) key — it is designed to be public
   - `VITE_IOS_SHORTCUT_URL` (optional) = iCloud link of the shortcut, see [apple-shortcut.md](apple-shortcut.md)
3. Push to `main` (or run the *Deploy app to GitHub Pages* workflow).

## 5. Admin dashboard (on your Mac)

```bash
./scripts/admin-setup.sh     # stores URL + service key in the macOS Keychain
cd admin && npm install && npm start
```

The dashboard opens in your browser. It only listens on `127.0.0.1`, uses a new random access
token at every launch, and the secret key never leaves your Mac. From there you can:

- **create accounts** (email + password) and reset passwords,
- see each person's weight trend, strength gains, steps, workouts, meals and check-ins,
- **edit their workout plan remotely** (changes appear on their phone the next time they open the app),
- copy a plan from one person to another,
- add video links and coach notes to exercises, and add shared custom exercises.

## 6. Set up each phone

1. Open the app link in **Safari** (iPhone) or **Chrome** (Android) → **Add to Home Screen**.
2. Sign in **once** inside the installed app: the login is remembered.
3. Complete the 2-minute setup (goal, weight, activity level).
4. **Settings → Connect Health & scale**:
   - **Android**: install the *Forza! Health* APK from the latest
     [release](https://github.com/gabripo/forza/releases/latest), then tap **Connect the helper**.
   - **iPhone**: add the shortcut ([guide](apple-shortcut.md)).
   - **Eufy scale**: in EufyLife turn on Apple Health / Health Connect for weight. Past weigh-ins can be imported
     from EufyLife's *Export all data* CSV (Forza! → Weight history → Import CSV).

## Android helper signing (optional, for maintainers)

The *Android Health helper* workflow builds the APK. Without signing secrets it publishes a debug build.
For updates that install over the previous version, create a keystore once and add two repository secrets:

```bash
keytool -genkeypair -v -keystore forza.keystore -alias forza -keyalg RSA -keysize 4096 -validity 10000
base64 -i forza.keystore | gh secret set FORZA_KEYSTORE_B64
gh secret set FORZA_KEYSTORE_PASSWORD
```

Then tag a release: `git tag helper-v1.0 && git push --tags`.

## Local development

```bash
supabase start                       # local Postgres/Auth/Storage (Docker)
supabase db reset                    # schema + demo user "Maria" with 10 weeks of history
supabase functions serve --no-verify-jwt
cd app && npm install && npm run dev # http://localhost:5173  (demo@forza.local / forza-demo-2026)
cd admin && npm run local            # admin dashboard against the local stack
```

`app/.env.local`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_KEY=<publishable key printed by `supabase status`>
```

For food photos locally, put `GEMINI_API_KEY=...` in `supabase/functions/.env` (git-ignored).
