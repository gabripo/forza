// Italian versions of the main phone screenshots (Home, workout, food, progress), for posts and the Italian README.
// Same environment as take.mjs; writes to OUT (default docs/screenshots/it).
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(process.env.OUT ?? join(here, '../../docs/screenshots/it'))
const APP = process.env.APP_URL?.replace(/\/?$/, '/')
const API = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_KEY
if (!APP || !API || !KEY) throw new Error('Set APP_URL, SUPABASE_URL and SUPABASE_KEY')

const DEMO = { email: 'demo@forza.local', password: 'forza-demo-2026' }
const PHONE = { width: 412, deviceScaleFactor: 540 / 412 }
const NOW = new Date(`${new Date().toISOString().slice(0, 10)}T14:30:00Z`)
const px = (h) => Math.round(h / PHONE.deviceScaleFactor)

const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: KEY, 'content-type': 'application/json' },
  body: JSON.stringify(DEMO),
})
if (!res.ok) throw new Error(`demo sign-in failed: ${res.status}`)
const auth = JSON.stringify(await res.json())

const browser = await chromium.launch()
await mkdir(OUT, { recursive: true })

async function phone(height) {
  const context = await browser.newContext({ viewport: { width: PHONE.width, height }, deviceScaleFactor: PHONE.deviceScaleFactor, isMobile: true, hasTouch: true, locale: 'it-IT', timezoneId: 'UTC', colorScheme: 'light' })
  await context.clock.setFixedTime(NOW)
  await context.addInitScript((value) => {
    localStorage.setItem('forza.auth', value)
    localStorage.setItem('forza.locale', 'it')
  }, auth)
  const page = await context.newPage()
  return { page, close: () => context.close() }
}

async function open(page, path) {
  await page.goto(`${APP}#${path}`)
  await page.addStyleTag({ content: ':root { --font-sans: Roboto, system-ui, sans-serif }' })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(600)
}
const save = (page, name) => page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 82 })

let failed = 0
async function shot(name, fn) {
  try { await fn(); console.log(`✓ ${name}`) } catch (e) { failed++; console.error(`✗ ${name}: ${e.message.split('\n')[0]}`) }
}

await shot('dashboard', async () => {
  const { page, close } = await phone(px(842))
  await open(page, '/')
  await page.getByText('Buon pomeriggio').waitFor()
  await save(page, 'dashboard')
  await close()
})

await shot('workout', async () => {
  const { page, close } = await phone(px(1005))
  await open(page, '/train')
  await page.getByRole('button', { name: /^Inizia/ }).first().click()
  await page.waitForURL(/train\/active/)
  await page.waitForTimeout(800)
  await save(page, 'workout')
  await close()
})

await shot('progress', async () => {
  const { page, close } = await phone(px(842))
  await open(page, '/check')
  await save(page, 'progress')
  await close()
})

await shot('food', async () => {
  const { page, close } = await phone(px(1005))
  await open(page, '/food')
  await page.getByText(/Prossimo pasto:/).first().evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(300)
  await save(page, 'food')
  await close()
})

await browser.close()
console.log(`${failed} screenshot(s) failed`)
