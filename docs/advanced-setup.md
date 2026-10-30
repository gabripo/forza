# Advanced set-up

For developers and for anyone who prefers the command line. Most families only need the
[Coach guide](coach-guide.md): Forza! Coach does everything below with a few clicks.

## The pieces

| Piece | Where it runs | Cost |
|---|---|---|
| The app (installable website, PWA) | GitHub Pages: the shared copy at `https://gabripo.github.io/forza/`, or your own fork | free |
| Accounts and data | your own Supabase project (Postgres + Auth + Storage + Edge Functions) | free tier |
| Food photo estimates | Google Gemini (default) or any OpenAI-compatible vision API, called by an Edge Function | free tier |
| Barcodes | Open Food Facts, called from the phone | free, no key |
| Forza! Coach (set-up, accounts, progress, plans) | only on the coach's computer: macOS, Windows or Linux | free |
| Android step/weight sync | the *Forza! Health* helper APK (Health Connect) | free |
| iPhone step/weight sync | an Apple Shortcut ([guide](apple-shortcut.md)) | free |

One copy of the app serves every family: each phone is told which Supabase project to use by the
setup QR code (server address + publishable key, which are public by design). The data of each family
lives only in its own project.

## Forza! Coach from the command line (all systems)

Requirements: [Node.js](https://nodejs.org) 20 or newer, and a Supabase
[access token](https://supabase.com/dashboard/account/tokens).

```bash
cd coach
npm ci --omit=dev
```

Install or update Forza! on a project (database migrations, the two Edge Functions, sign-in settings,
keys stored in the system password store):

```bash
# macOS / Linux
SUPABASE_ACCESS_TOKEN=sbp_… GEMINI_API_KEY=AIza… node cli.mjs install <project-ref>
```

```powershell
# Windows (PowerShell)
$env:SUPABASE_ACCESS_TOKEN="sbp_…"; $env:GEMINI_API_KEY="AIza…"; node cli.mjs install <project-ref>
```

`<project-ref>` is the `abcd1234` in `https://abcd1234.supabase.co`. The Gemini key is optional.
Then `node cli.mjs people`, `node cli.mjs bws <email>` (Build With Science import) or `npm start` for the
dashboard. `node cli.mjs help` lists everything.

What `install` does, through the [Supabase Management API](https://supabase.com/docs/reference/api)
(no Supabase CLI or Docker needed):

1. applies the files in `supabase/migrations/` that the project does not have yet, each one in a single
   transaction, recording them in `supabase_migrations.schema_migrations` (the same table the Supabase CLI
   uses, so both tools can manage one project);
2. deploys `supabase/functions/food-estimate`, `food-search`, `health-ingest` and `bws-ingest` with JWT verification off
   (all three check the caller themselves);
3. closes public sign-ups, sets one-time sign-in links to last 24 hours, and adds the app address to the
   allowed redirect URLs;
4. stores the Gemini key as a function secret, if given;
5. reads the project's publishable and secret keys and saves the secret one in the password store.

Running it again is safe: it only applies what is missing.

### Where Coach keeps its keys

| System | Secret key and access token | Settings (`config.json`) and Build With Science cache |
|---|---|---|
| macOS | Keychain, service `forza-admin` (through Apple's `security` tool) | `~/Library/Application Support/Forza Coach/` |
| Windows | Credential Manager, service `forza-admin` | `%APPDATA%\Forza Coach\` |
| Linux | Secret Service (GNOME Keyring / KWallet) | `~/.config/forza-coach/` |

Without a password store (e.g. a Linux server with no desktop session) the keys go to `secrets.json` in
the same folder, readable only by your user, and the dashboard says so. `FORZA_COACH_HOME` overrides the
folder.

Coach listens only on `127.0.0.1` (port 4545, or the next free one), refuses other host names, and
requires a random token generated at each launch (it is in the address that opens the browser). The running
instance writes its port and token to `running.json` in the folder above (readable only by you), so a second
start opens it instead of starting another.

**Run in the background** (Coach → Setup), needed for automatic Build With Science syncs, adds a login item:
`~/Library/LaunchAgents/app.forza.coach.plist` (macOS, log in `coach.log`), `Forza Coach.vbs` in the Startup
folder (Windows), `~/.config/autostart/forza-coach.desktop` (Linux). Unticking removes it.
`node server.mjs --background` is the same thing by hand.

## Alternative: the Supabase CLI

If you already use the [Supabase CLI](https://supabase.com/docs/guides/cli) (macOS, Windows, Linux):

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push --linked
supabase functions deploy food-estimate --no-verify-jwt
supabase functions deploy food-search --no-verify-jwt
supabase functions deploy health-ingest --no-verify-jwt
supabase functions deploy bws-ingest --no-verify-jwt
supabase secrets set GEMINI_API_KEY=AIza…
```

Then, in the Supabase dashboard, **Authentication → Sign In / Providers → turn off "Allow new users to
sign up"**, and connect Forza! Coach (its set-up screen, or `node cli.mjs install <project-ref>`, which
only applies what is missing). On macOS and Linux, `scripts/deploy-backend.sh <project-ref>` runs the CLI
steps above and checks that sign-ups are closed.

## Your own copy of the app (optional)

The shared app works for everyone. To publish your own copy (your domain, your changes):

1. Fork `gabripo/forza`. In the fork: **Settings → Pages → Source: GitHub Actions**.
2. Optional **Settings → Secrets and variables → Actions → Variables**:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`: a default server, used until a phone scans a setup code
     (the publishable key is public by design);
   - `VITE_IOS_SHORTCUT_URL`: iCloud link of the shortcut ([guide](apple-shortcut.md));
   - `VITE_ANDROID_HELPER_URL`: your own helper APK (default: the latest release of `gabripo/forza`).
3. Push to `main`. The app is published at `https://<you>.github.io/<repo>/`.
4. In Forza! Coach → **Setup → App address**, enter that address: new sign-in codes open your copy.

## Food photo AI

The easiest way is Forza! Coach → **Setup → Food photo AI**: paste one key per provider and put the models
in the order to try. Underneath, these are Edge Function secrets (Supabase → Edge Functions → Secrets, or
`supabase secrets set`):

| Secret | Default | Meaning |
|---|---|---|
| `FOOD_AI_ORDER` | – | JSON list of `"provider:model"`, tried top to bottom, e.g. `["gemini:gemini-3.6-flash","openrouter:google/gemma-3-27b-it:free"]`. A model that is busy (429, 503, 402) or silent for 30 s hands the photo to the next one |
| `GEMINI_API_KEY` | – | Google AI Studio key (provider `gemini`) |
| `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `OPENAI_API_KEY` | – | keys for the providers `openrouter`, `groq`, `mistral`, `openai`; a model whose provider has no key is skipped |
| `FOOD_AI_BASE_URL`, `FOOD_AI_API_KEY` | – | provider `custom`: any other OpenAI-compatible API (Cloudflare Workers AI, a self-hosted Ollama, …) |
| `FOOD_AI_STEP_TIMEOUT_MS` | `30000` | how long one model may take before the next one is tried |
| `FOOD_AI_DAILY_LIMIT` | `25` | photos per person per day |

Without `FOOD_AI_ORDER` the function uses Gemini: `GEMINI_MODEL` (default `gemini-3.6-flash`), then
`GEMINI_FALLBACK_MODELS` (comma-separated, default `gemini-3.5-flash-lite`). The older single-provider
set-up (`FOOD_AI_PROVIDER=openai` with `FOOD_AI_BASE_URL`, `FOOD_AI_API_KEY`, `FOOD_AI_MODEL`) still works.

Test results and free alternatives: [food-ai.md](food-ai.md).

## Android helper (maintainers)

The *Android Health helper* workflow builds the APK when a `helper-v*` tag is pushed. Without signing
secrets it publishes a debug build. For updates that install over the previous version, create a keystore
once and add two repository secrets:

```bash
keytool -genkeypair -v -keystore forza.keystore -alias forza -keyalg RSA -keysize 4096 -validity 10000
base64 -i forza.keystore | gh secret set FORZA_KEYSTORE_B64
gh secret set FORZA_KEYSTORE_PASSWORD
git tag helper-v1.1 && git push --tags
```

Keep the keystore and its password safe (e.g. in your password manager): without them, a new helper
cannot update the installed one.

## Local development

Requirements: Node 20+, Docker, the Supabase CLI. Docker is only for this local copy of Supabase: using
Forza! (the hosted app, the cloud Supabase project, the phone helper, Forza! Coach) needs no Docker.
When you are done, `supabase stop` shuts the containers down.

```bash
supabase start                            # local Postgres/Auth/Storage
supabase db reset                         # schema + demo user "Maria" with 10 weeks of history
supabase functions serve --no-verify-jwt  # put GEMINI_API_KEY=… in supabase/functions/.env for photos
cd app && npm install && npm run dev      # http://localhost:5173  (demo@forza.local / forza-demo-2026)
cd coach && npm install && npm run local  # Forza! Coach against the local stack
```

`app/.env.local`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_KEY=<publishable key printed by `supabase status`>
```

To try the app on a real phone over USB: `adb reverse tcp:5173 tcp:5173 && adb reverse tcp:54321 tcp:54321`,
then open `http://localhost:5173` on the phone.

### Screenshots

The pictures in `docs/screenshots` are taken by [`scripts/screenshots/take.mjs`](../scripts/screenshots/take.mjs)
from the demo data. GitHub Actions retakes them after every change to the app, Coach or the database
(`.github/workflows/screenshots.yml`) and commits the ones that changed. To take them yourself, with the local
stack running:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f scripts/screenshots/prepare.sql   # demo data in English
cd app && npm run build && npx vite preview --port 4173 &                                          # the app
cd scripts/screenshots && npm install && npx playwright install chromium
APP_URL=http://127.0.0.1:4173/ SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_KEY=<publishable key> node take.mjs
```

Add `COACH_URL=<the link Coach prints with --local>` for the Coach pictures.

Checks (also run by CI): `cd app && npx tsc -b && npm run lint && npm run build`, `cd coach && npm test`,
`deno check supabase/functions/*/index.ts`.

After changing the built-in lessons, tips, references, foods or the target and score calculations
(`app/src/lib/calc.ts`, `energy.ts`), run `cd app && npm run export-knowledge` and commit `shared/knowledge.json`,
`shared/foods.json` and `shared/energy.mjs`: Forza! Coach reads them (it cannot read the app's TypeScript), and
CI fails if they are out of date.
