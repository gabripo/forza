// Takes the screenshots used in the README and the docs, from the demo family member "Maria" on a local
// Supabase stack (`supabase start` applies supabase/seed.sql). Run by .github/workflows/screenshots.yml
// after every change to the app, so the pictures always show the current version.
//
//   APP_URL     the built app, e.g. http://127.0.0.1:4173/            (required)
//   SUPABASE_URL, SUPABASE_KEY   the local stack and its publishable key (required)
//   COACH_URL   Forza! Coach link with its token, e.g. http://127.0.0.1:4545/#token=…   (optional)
//   OUT         where to write the pictures (default: docs/screenshots)
//   CHANNEL     a browser channel such as "chrome" to use an installed browser instead of Playwright's
//
// A screenshot that fails (for example the barcode one, which needs Open Food Facts) keeps its old file.

import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(process.env.OUT ?? join(here, '../../docs/screenshots'))
const APP = process.env.APP_URL?.replace(/\/?$/, '/')
const API = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_KEY
if (!APP || !API || !KEY) throw new Error('Set APP_URL, SUPABASE_URL and SUPABASE_KEY')

// The demo account from supabase/seed.sql (local stack only).
const DEMO = { email: 'demo@forza.local', password: 'forza-demo-2026' }
// Phone pictures: a Pixel-sized screen, saved 540 pixels wide like the ones already in the docs.
const PHONE = { width: 412, deviceScaleFactor: 540 / 412 }
// A fixed time of day keeps the greeting and the meal suggestions the same from one run to the next.
const NOW = new Date(`${new Date().toISOString().slice(0, 10)}T14:30:00Z`)

const failures = []
async function shot(name, fn) {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (e) {
    failures.push(name)
    console.error(`✗ ${name}: ${e.message.split('\n')[0]}`)
  }
}

async function session() {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify(DEMO),
  })
  if (!res.ok) throw new Error(`demo sign-in failed: ${res.status}`)
  return res.json()
}

const browser = await chromium.launch(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {})
await mkdir(OUT, { recursive: true })

async function phone(height, { signedIn = true } = {}) {
  const context = await browser.newContext({ viewport: { width: PHONE.width, height }, deviceScaleFactor: PHONE.deviceScaleFactor, isMobile: true, hasTouch: true, locale: 'en-GB', timezoneId: 'UTC', colorScheme: 'light' })
  await context.clock.setFixedTime(NOW)
  if (signedIn) {
    const s = await session()
    await context.addInitScript((value) => localStorage.setItem('forza.auth', value), JSON.stringify(s))
  }
  const page = await context.newPage()
  return { page, close: () => context.close() }
}

async function open(page, path) {
  await page.goto(`${APP}#${path}`)
  // Android's own font, so the pictures look like the phone (the workflow installs Roboto).
  await page.addStyleTag({ content: ':root { --font-sans: Roboto, system-ui, sans-serif }' })
  await page.waitForLoadState('networkidle')
  // Charts and photos fade in.
  await page.waitForTimeout(600)
}

const save = (page, name, options = {}) => page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 82, ...options })
const px = (h) => Math.round(h / PHONE.deviceScaleFactor)

// ---------------------------------------------------------------------------------------------- the app

await shot('welcome', async () => {
  const { page, close } = await phone(px(922), { signedIn: false })
  await open(page, `/welcome?u=${encodeURIComponent(API)}&k=${encodeURIComponent(KEY)}&t=screenshot&n=Maria`)
  await save(page, 'welcome')
  await close()
})

await shot('dashboard', async () => {
  const { page, close } = await phone(px(842))
  await open(page, '/')
  await page.getByText('Good afternoon').waitFor()
  await save(page, 'dashboard')
  await close()
})

await shot('workout', async () => {
  const { page, close } = await phone(px(1005))
  await open(page, '/train')
  await page.getByRole('button', { name: /^Start/ }).first().click()
  await page.waitForURL(/train\/active/)
  await page.waitForTimeout(800)
  await save(page, 'workout')
  await close()
})

await shot('strength', async () => {
  const { page, close } = await phone(px(842))
  await open(page, '/exercise/leg_press')
  await save(page, 'strength')
  await close()
})

await shot('progress', async () => {
  const { page, close } = await phone(px(842))
  await open(page, '/check')
  await save(page, 'progress')
  await close()
})

await shot('calories', async () => {
  const { page, close } = await phone(px(1005))
  await open(page, '/food')
  await page.getByRole('button', { name: 'How is this calculated?' }).click()
  await page.waitForTimeout(600)
  await save(page, 'calories')
  await close()
})

await shot('food', async () => {
  const { page, close } = await phone(px(1005))
  await open(page, '/food')
  // The idea for the next meal, under today's numbers.
  await page.getByText(/Next meal:/).first().evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(300)
  await save(page, 'food')
  await close()
})

await shot('voice', async () => {
  const { page, close } = await phone(px(1005))
  await open(page, '/food/voice')
  await page.locator('textarea').fill('Two eggs, a slice of wholegrain bread with avocado and a cappuccino')
  await page.getByRole('button', { name: 'Work it out' }).click()
  await page.getByRole('button', { name: 'Adjust quantities' }).waitFor()
  // From the words to the advice and the foods found.
  await page.getByText('What you ate', { exact: true }).evaluate((el) => {
    el.scrollIntoView({ block: 'start' })
    window.scrollBy(0, -90)
  })
  await page.waitForTimeout(300)
  await save(page, 'voice')
  await close()
})

await shot('barcode', async () => {
  const { page, close } = await phone(px(1169))
  await open(page, '/food/add?scan=1')
  // No camera here: type the code of a well-known pasta packet instead.
  const typed = page.getByPlaceholder('8001234567890')
  const typeInstead = page.getByRole('button', { name: 'Type the numbers instead' })
  // Without a camera the scanner may open straight on the typing field.
  await typed.or(typeInstead).first().waitFor()
  if (await typeInstead.isVisible()) await typeInstead.click()
  await typed.fill('8076809513753')
  await page.keyboard.press('Enter')
  await page.getByText('Open Food Facts').first().waitFor({ timeout: 20_000 })
  await page.waitForLoadState('networkidle')
  await save(page, 'barcode')
  await close()
})

await shot('lesson', async () => {
  const { page, close } = await phone(px(842))
  await open(page, '/learn/why_strength')
  await save(page, 'lesson')
  await close()
})

await shot('sources', async () => {
  const { page, close } = await phone(px(1005))
  await open(page, '/train')
  // The "Why it works" card at the top of the screen, under the page title.
  await page.getByText('Why it works').evaluate((el) => {
    el.scrollIntoView({ block: 'start' })
    window.scrollBy(0, -110)
  })
  await page.waitForTimeout(300)
  await save(page, 'sources')
  await close()
})

// ----------------------------------------------------------------------------------------- Forza! Coach

if (process.env.COACH_URL) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 808 }, deviceScaleFactor: 1, locale: 'en-GB', timezoneId: 'UTC' })
  await context.clock.setFixedTime(NOW)
  const page = await context.newPage()
  await page.goto(process.env.COACH_URL)
  await page.getByRole('button', { name: /Maria/ }).first().click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(600)
  await shot('coach', () => save(page, 'coach'))
  await shot('coach-signin', async () => {
    await page.getByRole('button', { name: 'Sign in a phone' }).click()
    await page.getByRole('button', { name: /sign-in code/ }).click()
    await page.locator('img[src^="data:image"], svg').first().waitFor()
    await page.waitForTimeout(400)
    await save(page, 'coach-signin')
  })
  await shot('coach-import', async () => {
    await page.getByRole('button', { name: 'Import', exact: true }).click()
    await page.waitForTimeout(400)
    await save(page, 'coach-import')
  })
  await context.close()
}

await browser.close()
if (failures.length) console.log(`\nKept the previous picture for: ${failures.join(', ')}`)
