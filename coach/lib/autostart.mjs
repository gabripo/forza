// "Start Forza! Coach when I log in": keeps Coach running in the background (no window, no browser)
// so automatic syncs can happen. Uses each system's own mechanism:
//   macOS    a LaunchAgent in ~/Library/LaunchAgents
//   Windows  a hidden starter in the Startup folder
//   Linux    an XDG autostart entry in ~/.config/autostart
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { configDir } from './secrets.mjs'

const run = promisify(execFile)
const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', 'server.mjs')
const LABEL = 'app.forza.coach'

function target() {
  const home = homedir()
  if (platform() === 'darwin') return join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`)
  if (platform() === 'win32') return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Forza Coach.vbs')
  return join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'autostart', 'forza-coach.desktop')
}

const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function autostartEnabled() {
  return existsSync(target())
}

export async function setAutostart(enabled) {
  const file = target()
  const node = process.execPath
  if (!enabled) {
    if (platform() === 'darwin') await run('launchctl', ['bootout', `gui/${process.getuid()}/${LABEL}`]).catch(() => {})
    await rm(file, { force: true })
    return false
  }
  await mkdir(dirname(file), { recursive: true })
  if (platform() === 'darwin') {
    const log = join(configDir(), 'coach.log')
    await mkdir(configDir(), { recursive: true })
    await writeFile(
      file,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${xml(node)}</string><string>${xml(SERVER)}</string><string>--background</string></array>
  <key>WorkingDirectory</key><string>${xml(dirname(SERVER))}</string>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict>
</plist>
`,
    )
  } else if (platform() === 'win32') {
    // A .vbs starter runs node without a console window.
    const q = (s) => `""${s}""`
    await writeFile(file, `CreateObject("WScript.Shell").Run "${q(node)} ${q(SERVER)} --background", 0, False\r\n`)
  } else {
    await writeFile(
      file,
      `[Desktop Entry]\nType=Application\nName=Forza! Coach\nComment=Keeps Forza! Coach running for automatic syncs\nExec="${node}" "${SERVER}" --background\nX-GNOME-Autostart-enabled=true\nNoDisplay=true\n`,
    )
  }
  return true
}
