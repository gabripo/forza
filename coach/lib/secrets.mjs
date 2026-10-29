// Where Forza! Coach keeps its keys: the operating system's password store, never a plain file
// when it can be avoided.
//   macOS    Keychain, through Apple's own `security` tool (no "allow access?" prompts)
//   Windows  Credential Manager      } through @napi-rs/keyring
//   Linux    Secret Service (GNOME Keyring, KWallet)
// If no password store is available (e.g. a Linux server without a desktop), the keys go to a
// file only this user can read, and the dashboard shows a warning.
//
// Settings that are not secret (project address, app address) live in config.json next to it.
import { execFile } from 'node:child_process'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const SERVICE = 'forza-admin'

/** Per-user folder for Forza! Coach's settings, in the usual place for each system. */
export function configDir() {
  if (process.env.FORZA_COACH_HOME) return process.env.FORZA_COACH_HOME
  const home = homedir()
  if (platform() === 'darwin') return join(home, 'Library', 'Application Support', 'Forza Coach')
  if (platform() === 'win32') return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Forza Coach')
  return join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'forza-coach')
}

const fallbackFile = () => join(configDir(), 'secrets.json')

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return {}
  }
}

async function writePrivate(file, data) {
  await mkdir(configDir(), { recursive: true, mode: 0o700 })
  await writeFile(file, JSON.stringify(data, null, 2), { mode: 0o600 })
  await chmod(file, 0o600).catch(() => {})
}

let keyring = null
async function entry(account) {
  keyring ??= await import('@napi-rs/keyring')
  return new keyring.AsyncEntry(SERVICE, account)
}

/** 'keychain' | 'credential-manager' | 'secret-service' | 'file' */
export let store = platform() === 'darwin' ? 'keychain' : platform() === 'win32' ? 'credential-manager' : 'secret-service'

export async function getSecret(account) {
  if (store === 'keychain') {
    try {
      const { stdout } = await run('security', ['find-generic-password', '-s', SERVICE, '-a', account, '-w'])
      return stdout.trim() || null
    } catch {
      return null
    }
  }
  if (store !== 'file') {
    try {
      return (await (await entry(account)).getPassword()) ?? (await readJson(fallbackFile()))[account] ?? null
    } catch {
      store = 'file'
    }
  }
  return (await readJson(fallbackFile()))[account] ?? null
}

export async function setSecret(account, value) {
  if (store === 'keychain') {
    await run('security', ['add-generic-password', '-U', '-s', SERVICE, '-a', account, '-w', value])
    return
  }
  if (store !== 'file') {
    try {
      await (await entry(account)).setPassword(value)
      return
    } catch {
      store = 'file'
    }
  }
  const all = await readJson(fallbackFile())
  all[account] = value
  await writePrivate(fallbackFile(), all)
}

export async function deleteSecret(account) {
  if (store === 'keychain') {
    await run('security', ['delete-generic-password', '-s', SERVICE, '-a', account]).catch(() => {})
    return
  }
  if (store !== 'file') await (await entry(account)).deletePassword().catch(() => {})
  const all = await readJson(fallbackFile())
  if (account in all) {
    delete all[account]
    await writePrivate(fallbackFile(), all)
  }
}

const configFile = () => join(configDir(), 'config.json')

export async function getConfig() {
  return readJson(configFile())
}

export async function setConfig(patch) {
  const next = { ...(await getConfig()), ...patch }
  await writePrivate(configFile(), next)
  return next
}
