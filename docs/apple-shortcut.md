# iPhone: sync steps and weight with an Apple Shortcut

A website cannot read Apple Health directly. A small **Shortcut** reads today's steps and
your recent weigh-ins and sends them to Forza!. You build it **once** (about 5 minutes) and
can then share it with the rest of the family as an iCloud link.

> 🇮🇹 Italian action names are shown in brackets, e.g. *Find Health Samples* [*Trova campioni Salute*].

## What you need

- In Forza! → **Settings → Connect Health & scale**:
  - your **sync key** (tap *Create sync key*, then *Copy*)
  - the **address** shown under the iPhone section (it ends with `/functions/v1/health-ingest`)

## Build the shortcut

Open the **Shortcuts** app [*Comandi*] → **+** → name it exactly **`Forza Sync`**. Add these actions in order:

1. **Text** [*Testo*] → paste your **sync key** (in Forza! tap **Copy**: the key is long, starts with `fz_`
   and must be pasted whole). Rename the variable to `Key` (tap the action's output → *Rename*).
2. **Find Health Samples** [*Trova campioni Salute*]
   - Type: **Steps** [*Passi*]
   - Filter: *Start Date* **is in the last 7 days**
   - **Group By: Day** [*Raggruppa per: Giorno*]
   - Sort by *Start Date*, order *Oldest First*
3. **Repeat with Each** [*Ripeti con ognuno*] item in *Health Samples*:
   - **Format Date** [*Formatta data*] → *Start Date* of *Repeat Item* → Date format **Custom**: `yyyy-MM-dd`, Time format **None**
   - **Text** → `Formatted Date` *space* `Value` (Value of *Repeat Item*)
4. **End Repeat** → then **Combine Text** [*Combina testo*] *Repeat Results* with **New Lines**. Rename to `Steps`.
5. **Find Health Samples** again:
   - Type: **Weight** [*Peso*], unit **kg**
   - Filter: *Start Date* **is in the last 30 days**, no grouping, sort *Oldest First*
6. **Repeat with Each** item:
   - **Format Date** → *Start Date* → Custom: `yyyy-MM-dd'T'HH:mm`
   - **Text** → `Formatted Date` *space* `Value`
7. **End Repeat** → **Combine Text** with **New Lines**. Rename to `Weights`.
8. **Get Contents of URL** [*Ottieni contenuti dell'URL*]
   - URL: the **address** from Forza!
   - Method: **POST**
   - Headers: `x-forza-token` = the **Key variable**: tap the value field, then pick **Key** from the
     variables shown above the keyboard (it appears as a blue bubble). Typing the letters K-e-y sends the
     word "Key" instead of your key, and Forza! refuses it.
   - Request Body: **JSON** with three text fields:
     - `source` = `apple_health`
     - `steps_text` = `Steps`
     - `weights_text` = `Weights`
9. **Get Dictionary Value** [*Ottieni valore dizionario*] → key `message` in *Contents of URL*.
10. **Show Notification** [*Mostra notifica*] → *Dictionary Value*. Forza! answers in your language, for example
    *Forza! ✓ 7 giorni di passi, 2 pesate*, or says exactly what to fix.

**Optional: walks and other workouts.** Before step 8, add **Find Health Samples** (or **Find Workouts**,
depending on your iOS version) for *Workouts* in the last 7 days, and build lines like
`start date, end date, type` (dates formatted `yyyy-MM-dd'T'HH:mm:ssZ`) joined with new lines.
Send them as a fourth JSON field, `activities_text`. They appear as activities on the Forza! weekly schedule.

Run it once with ▶︎ and allow access to **Steps** and **Weight** when asked.
In Forza! the *Last sync* time appears under your sync key.

> Decimal commas (`72,5`) and thousands separators (`8.432`) are handled by the server,
> so it works with Italian and English iPhone settings alike.

## If nothing arrives

Run the shortcut with ▶︎ and read the notification:

| Notification | What to do |
|---|---|
| *the shortcut sends no sync key* | In step 8, the value of `x-forza-token` is not the blue **Key** variable: delete it and pick **Key** from the variables. |
| *the sync key is cut short* | The key was copied partly. In Forza! tap **Copy** and paste it again in step 1. |
| *this sync key is no longer valid* | A new key was created in Forza! after the shortcut was built. Paste the current one in step 1. |
| *✓ 0 days of steps, 0 weigh-ins* | The key works, but Health gives the shortcut nothing: open **Health** → your picture (top right) → **Apps** → **Shortcuts** [*Comandi*] and turn on **Steps** and **Weight**. |
| no notification, or an error from Shortcuts | Check the address in step 8: it must end with `/functions/v1/health-ingest`. |

In Forza! (Settings → Connect Health & scale) and in Forza! Coach (the person's Overview, *Last health sync*)
you can see what arrived last time.

## Make it automatic

Shortcuts → **Automation** [*Automazione*] → **+** → **Personal Automation**:

- **When Alarm is Stopped** [*Quando la sveglia viene interrotta*] (recommended: the phone is unlocked, so Health data is readable), or
- **Time of Day** → 21:00, daily.

Choose **Run Immediately** [*Esegui immediatamente*] and turn off *Notify When Run*.
Then select the *Forza Sync* shortcut.

There is also a **Sync now** button in Forza! (Settings → Connect Health & scale) that runs the shortcut.

## Share it with the family

In the Shortcuts app, long-press *Forza Sync* → **Share** → **Copy iCloud Link**.
Before sharing, open the shortcut, tap ⓘ → **Setup** and add an **Import Question** on the
*Text* action of step 1 ("Paste your Forza! sync key"), so each person enters their own key.

Put the link in the GitHub repository variable `VITE_IOS_SHORTCUT_URL`: Forza! will then show a
one-tap **Get the shortcut** button instead of these instructions.

## Eufy scale

In the **EufyLife** app: **Me → Apple Health → turn on Weight**. Every weigh-in then goes to
Apple Health and is picked up by the shortcut.
