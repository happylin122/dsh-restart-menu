/**
 * Dev utility: restart the running DSH desktop app through the same helper the
 * plugin uses, without going through the HTTP route (useful before the plugin
 * is loaded for the first time).
 *
 *   node scripts/restart-now.mjs [--delay-ms 20000] [--probe]
 *
 * --probe  only runs the helper's diagnostics branch (lists the process, never kills).
 *
 * The helper is spawned detached from this Node process so it survives the
 * taskkill that ends the app.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { __internals } from '../lib/index.js'

const args = process.argv.slice(2)
const probe = args.includes('--probe')
const delayIndex = args.indexOf('--delay-ms')
const delayMs = delayIndex === -1 ? 20000 : Number(args[delayIndex + 1])

const exe = 'D:\\Users\\HappyLin\\AppData\\Local\\Programs\\DeepSeek Harness\\DeepSeek Harness.exe'
if (!existsSync(exe)) throw new Error(`app executable not found: ${exe}`)

__internals.writeHelper(exe, Number.isFinite(delayMs) ? delayMs : 20000)

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.DSH_DESKTOP_NODE_EXECUTABLE

// Mirror the plugin: wscript runs the VBS helper, so no console window appears.
const wscript = `${env.SystemRoot ?? 'C:\\Windows'}\\System32\\wscript.exe`
const child = spawn(
  wscript,
  ['//B', '//Nologo', __internals.HELPER_FILE, probe ? 'probe' : 'run', String(Number.isFinite(delayMs) ? delayMs : 20000)],
  {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env,
  },
)
child.unref()

console.log(JSON.stringify({
  spawned: child.pid,
  mode: probe ? 'probe' : 'run',
  delayMs,
  executable: exe,
  helper: __internals.HELPER_FILE,
  log: __internals.LOG_FILE,
}, null, 2))
