// A small Android Debug Bridge (ADB) client: finds or downloads Google's `adb`, reads the
// screen's layout (uiautomator) and pixels (screencap), and taps or swipes.
// Coordinates in the callers are written for a 1080×2400, 420 dpi phone (Pixel 7) and scaled
// here to the connected phone, so the same steps work on other screen sizes.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { PNG } from 'pngjs'
import { configDir } from './secrets.mjs'

const exec = promisify(execFile)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EXE = platform() === 'win32' ? 'adb.exe' : 'adb'

function candidates() {
  const home = homedir()
  const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT].filter(Boolean)
  if (platform() === 'darwin') sdk.push(join(home, 'Library', 'Android', 'sdk'))
  if (platform() === 'win32') sdk.push(join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Android', 'Sdk'))
  if (platform() === 'linux') sdk.push(join(home, 'Android', 'Sdk'))
  return [join(configDir(), 'platform-tools', EXE), ...sdk.map((d) => join(d, 'platform-tools', EXE))]
}

/** Path of an `adb` program: on the PATH, in an Android SDK, or downloaded earlier by Coach. */
export async function findAdb() {
  try {
    await exec(EXE, ['version'])
    return EXE
  } catch {
    return candidates().find((p) => existsSync(p)) ?? null
  }
}

/** Downloads Google's official platform-tools (about 15 MB) into Coach's folder. */
export async function downloadAdb(onLog = () => {}) {
  const os = platform() === 'win32' ? 'windows' : platform() === 'darwin' ? 'darwin' : 'linux'
  const url = `https://dl.google.com/android/repository/platform-tools-latest-${os}.zip`
  onLog(`Downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const zip = join(configDir(), 'platform-tools.zip')
  await mkdir(configDir(), { recursive: true })
  await writeFile(zip, Buffer.from(await res.arrayBuffer()))
  await rm(join(configDir(), 'platform-tools'), { recursive: true, force: true })
  // Every supported system ships a zip extractor: tar on macOS/Windows 10+, unzip on Linux.
  if (platform() === 'linux') await exec('unzip', ['-q', '-o', zip, '-d', configDir()])
  else await exec('tar', ['-xf', zip, '-C', configDir()])
  await rm(zip, { force: true })
  const adb = join(configDir(), 'platform-tools', EXE)
  if (platform() !== 'win32') await chmod(adb, 0o755)
  return adb
}

export class Device {
  constructor(adb, serial = null) {
    this.adb = adb
    this.serial = serial
    this.width = 1080
    this.height = 2400
    this.density = 420
  }

  async run(args, { timeout = 25000, binary = false } = {}) {
    try {
      const { stdout } = await exec(this.adb, [...(this.serial ? ['-s', this.serial] : []), ...args], {
        timeout,
        encoding: binary ? 'buffer' : 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      })
      return stdout
    } catch (e) {
      if (e.killed) return binary ? Buffer.alloc(0) : ''
      throw e
    }
  }

  shell = (...args) => this.run(['shell', ...args])

  /** Connected phones: [{ serial, state, model }]. state "unauthorized" = accept the prompt on the phone. */
  static async list(adb) {
    const { stdout } = await exec(adb, ['devices', '-l'])
    return stdout
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [serial, state] = l.split(/\s+/)
        return { serial, state, model: (l.match(/model:(\S+)/)?.[1] ?? '').replaceAll('_', ' ') }
      })
  }

  async init() {
    const size = (await this.shell('wm', 'size')).match(/(\d+)x(\d+)\s*$/m)
    if (size) [this.width, this.height] = [Number(size[1]), Number(size[2])]
    const dpi = (await this.shell('wm', 'density')).match(/(\d+)\s*$/m)
    if (dpi) this.density = Number(dpi[1])
    return this
  }

  // Reference layout (Pixel 7) → this phone. Layouts scale with density from the top, the bottom
  // and the left/right edges; full-width rows are centred.
  get k() {
    return this.density / 420
  }
  cx = () => Math.round(this.width / 2)
  left = (px) => Math.round(px * this.k)
  right = (px) => Math.round(this.width - (1080 - px) * this.k)
  top = (px) => Math.round(px * this.k)
  bottom = (px) => Math.round(this.height - (2400 - px) * this.k)

  async tap(x, y, wait = 1200) {
    await this.shell('input', 'tap', String(Math.round(x)), String(Math.round(y)))
    await sleep(wait)
  }

  async swipe(x1, y1, x2, y2, ms = 1400, wait = 1200) {
    await this.shell('input', 'swipe', ...[x1, y1, x2, y2, ms].map((v) => String(Math.round(v))))
    await sleep(wait)
  }

  /** Restarts an app (like swiping it away and opening it again), so it opens on its home screen. */
  async launch(pkg) {
    await this.shell('am', 'force-stop', pkg)
    await sleep(1000)
    await this.shell('monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1')
  }

  async back(wait = 1500) {
    await this.shell('input', 'keyevent', 'KEYCODE_BACK')
    await sleep(wait)
  }

  /** Visible texts with their position: [{ x, y, top, bottom, label, click }]. */
  async dump() {
    for (let i = 0; i < 6; i++) {
      await this.shell('rm', '-f', '/sdcard/forza-ui.xml')
      const r = await this.run(['shell', 'uiautomator', 'dump', '/sdcard/forza-ui.xml'], { timeout: 20000 })
      if (r.includes('dumped')) {
        const xml = await this.run(['exec-out', 'cat', '/sdcard/forza-ui.xml'])
        return parseNodes(xml)
      }
      await sleep(1000)
    }
    throw new Error('Cannot read the phone screen (is it locked?)')
  }

  /** Screenshot as { width, height, rgb(x, y) } with a 9×9 average around the point. */
  async screencap() {
    const png = PNG.sync.read(await this.run(['exec-out', 'screencap', '-p'], { binary: true }))
    return {
      width: png.width,
      height: png.height,
      rgb(x, y) {
        const sum = [0, 0, 0]
        let n = 0
        for (let dx = -4; dx <= 4; dx++)
          for (let dy = -4; dy <= 4; dy++) {
            const px = Math.min(png.width - 1, Math.max(0, x + dx))
            const py = Math.min(png.height - 1, Math.max(0, y + dy))
            const i = (py * png.width + px) * 4
            sum[0] += png.data[i]
            sum[1] += png.data[i + 1]
            sum[2] += png.data[i + 2]
            n++
          }
        return sum.map((s) => Math.round(s / n))
      },
    }
  }

  /** The phone's own serial number: the same over USB and over Wi-Fi debugging. */
  async hardwareSerial() {
    return (await this.shell('getprop', 'ro.serialno')).trim()
  }

  /**
   * Whether the phone can be used now without disturbing anyone: screen on, unlocked, and how long
   * since someone last touched it (Android's power manager keeps that time).
   */
  async readiness() {
    const { locked, focus } = await this.foreground()
    return { ...parsePower(await this.shell('dumpsys', 'power')), locked, focus }
  }

  /** Shows (or replaces) a notification on the phone, so whoever holds it knows what is happening. */
  async notify(text) {
    const quote = (v) => `'${String(v).replaceAll("'", "'\\''")}'`
    await this.run(['shell', 'cmd', 'notification', 'post', '-S', 'bigtext', '-t', quote('Forza!'), 'forza-sync', quote(text)]).catch(() => {})
  }

  /** Name of the app in front, and whether the phone is locked. */
  async foreground() {
    const w = await this.shell('dumpsys', 'window')
    return {
      locked: /isKeyguardShowing=true|mDreamingLockscreen=true/.test(w),
      focus: w.match(/mCurrentFocus=Window\{\S+ \S+ ([^/}\s]+)/)?.[1] ?? null,
    }
  }
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#10;': '\n' }

export function parseNodes(xml) {
  const nodes = []
  for (const m of xml.matchAll(/<node [^>]*>/g)) {
    const attr = (name) => m[0].match(new RegExp(` ${name}="([^"]*)"`))?.[1] ?? ''
    const decode = (s) => s.replace(/&(amp|lt|gt|quot|apos|#10);/g, (e) => ENTITIES[e] ?? e).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    const label = decode(attr('text')).trim() || decode(attr('content-desc')).trim()
    if (!label) continue
    const [x1, y1, x2, y2] = (attr('bounds').match(/\d+/g) ?? []).map(Number)
    nodes.push({ x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2), top: y1, bottom: y2, label, click: attr('clickable') === 'true' })
  }
  return nodes
}

/** Screen on? Milliseconds since the last touch? (from `dumpsys power`; times are in uptime ms) */
export function parsePower(text) {
  const wake = text.match(/mLastWakeTime=(\d+) \((\d+) ms ago\)/)
  const touch = text.match(/mLastUserActivityTime(?:\(excludingAttention\))?=(\d+)/)
  const now = wake ? Number(wake[1]) + Number(wake[2]) : null
  return { awake: /mWakefulness=Awake/.test(text), idleMs: now !== null && touch ? Math.max(0, now - Number(touch[1])) : 0 }
}
