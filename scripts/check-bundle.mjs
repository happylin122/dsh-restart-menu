/**
 * Offline smoke test for dsh-restart-menu.
 *
 * Checks, without a DSH install:
 *   1. the host half imports and exposes a valid cordis plugin shape;
 *   2. the host route answers GET and rejects unconfirmed / foreign POSTs;
 *   3. the client bundle registers itself with `__ModuleLoader__` under the
 *      package id DSH expects;
 *   4. the client `apply()` appends exactly one "重启" button to the caption
 *      menubar and calls the right endpoint when clicked.
 *
 * Run with `node scripts/check-bundle.mjs`.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const failures = []
let passed = 0

async function check(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failures.push({ name, error })
    console.log(`  FAIL ${name}\n       ${error instanceof Error ? error.stack : String(error)}`)
  }
}

/* -------------------------------------------------------------------------- */
/* Host half                                                                  */
/* -------------------------------------------------------------------------- */

console.log('host half')
const host = await import(pathToFileURL(join(root, 'lib', 'index.js')).href)

await check('exports name/inject/apply', () => {
  assert.equal(host.name, 'dsh-restart-menu')
  assert.ok(Array.isArray(host.inject))
  assert.equal(typeof host.apply, 'function')
})

await check('route GET reports the environment', () => {
  const { createHandler } = host.__internals
  const reply = callHandler(createHandler(), { method: 'GET', url: '/plugins/dsh-restart-menu/restart' })
  assert.equal(reply.status, 200)
  const body = JSON.parse(reply.body)
  assert.equal(body.plugin, 'dsh-restart-menu')
  assert.equal(typeof body.desktop, 'boolean')
  assert.equal(typeof body.log, 'string')
})

await check('route POST needs the confirmation header', () => {
  const { createHandler } = host.__internals
  const reply = callHandler(createHandler(), {
    method: 'POST',
    url: '/plugins/dsh-restart-menu/restart',
    headers: {}
  })
  assert.equal(reply.status, 403)
  assert.match(JSON.parse(reply.body).error, /x-dsh-restart-menu/)
})

await check('route POST refuses non-loopback callers', () => {
  const { createHandler } = host.__internals
  const reply = callHandler(createHandler(), {
    method: 'POST',
    url: '/plugins/dsh-restart-menu/restart',
    headers: { 'x-dsh-restart-menu': '1' },
    remoteAddress: '10.0.0.7'
  })
  assert.equal(reply.status, 403)
})

await check('route POST outside the desktop app answers 409', () => {
  const { createHandler } = host.__internals
  const reply = callHandler(createHandler(), {
    method: 'POST',
    url: '/plugins/dsh-restart-menu/restart',
    headers: { 'x-dsh-restart-menu': '1' }
  })
  assert.equal(reply.status, 409)
  assert.match(JSON.parse(reply.body).error, /desktop app/)
})

await check('helper script contains the kill / relaunch sequence', () => {
  const { writeHelper, HELPER_FILE, LEGACY_HELPER_FILE } = host.__internals
  const helperPath = writeHelper('C:\\Program Files\\DeepSeek Harness\\DeepSeek Harness.exe', 1500)
  assert.equal(helperPath, HELPER_FILE)
  assert.ok(HELPER_FILE.endsWith('.vbs'))
  const source = readFileSync(helperPath, 'utf8')
  assert.match(source, /taskkill \/F \/IM/)
  assert.match(source, /tasklist \/FI/)
  assert.match(source, /explorer\.exe/)
  assert.match(source, /waitMs = 1500/)
  assert.match(source, /mode = "probe"/)
  assert.match(source, /LogLine "launched"/)
  assert.doesNotMatch(source, /taskkill \/F \/T/)
  // The VBS helper is run by wscript (no console), so it must never be launched
  // as a console program itself; only its hidden sub-commands may call cmd.exe.
  assert.doesNotMatch(source, /^start "" \/D/m)
  const fallback = readFileSync(LEGACY_HELPER_FILE, 'utf8')
  assert.match(fallback, /taskkill \/F \/IM "%IMAGE%"/)
  assert.doesNotMatch(fallback, /taskkill \/F \/T/)
})

/* -------------------------------------------------------------------------- */
/* Client half                                                                */
/* -------------------------------------------------------------------------- */

console.log('client half')
const clientSource = await readFile(join(root, 'lib', 'client.js'), 'utf8')

await check('client bundle registers through __ModuleLoader__', () => {
  const env = makeClientEnv()
  vm.runInNewContext(clientSource, env.sandbox, { filename: 'client.js' })
  assert.equal(env.registered.length, 1)
  assert.equal(env.registered[0].id, 'dsh-restart-menu')
  assert.equal(typeof env.registered[0].factory, 'function')
})

await check('client plugin mounts one restart button in the menubar', () => {
  const env = makeClientEnv()
  vm.runInNewContext(clientSource, env.sandbox, { filename: 'client.js' })
  const plugin = env.registered[0].factory(() => {
    throw new Error('client bundle must not require platform modules')
  })
  assert.equal(plugin.name, 'restart-menu')
  assert.equal(typeof plugin.apply, 'function')
  plugin.apply({ effect: (fn) => fn() })
  assert.equal(env.bar.children.length, 1)
  const button = env.bar.children[0]
  assert.equal(button.textContent, '重启')
  assert.ok(button.title.includes('重启'))
  assert.equal(env.fetches.length, 0)
})

await check('clicking the button POSTs the restart route', async () => {
  const env = makeClientEnv()
  vm.runInNewContext(clientSource, env.sandbox, { filename: 'client.js' })
  const plugin = env.registered[0].factory(() => null)
  plugin.apply({ effect: (fn) => fn() })
  const button = env.bar.children[0]
  env.emitClick(button)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(env.fetches.length, 1)
  assert.equal(env.fetches[0].url, '/plugins/dsh-restart-menu/restart')
  assert.equal(env.fetches[0].init.method, 'POST')
  assert.equal(env.fetches[0].init.headers['x-dsh-restart-menu'], '1')
})

await check('a failed request restores the label', async () => {
  const env = makeClientEnv({ ok: false })
  vm.runInNewContext(clientSource, env.sandbox, { filename: 'client.js' })
  const plugin = env.registered[0].factory(() => null)
  plugin.apply({ effect: (fn) => fn() })
  const button = env.bar.children[0]
  env.emitClick(button)
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(button.textContent, '重启失败')
  assert.equal(button.dataset.busy, '0')
})

/* -------------------------------------------------------------------------- */

function callHandler(handler, { method, url, headers = {}, remoteAddress = '127.0.0.1' }) {
  const state = { status: 0, headers: {}, body: '' }
  const res = {
    writeHead(status, extra) {
      state.status = status
      state.headers = extra ?? {}
    },
    end(body) {
      state.body = body ?? ''
    }
  }
  const req = {
    method,
    url,
    headers,
    socket: { remoteAddress },
    connection: { remoteAddress }
  }
  handler(req, res)
  return state
}

/** Minimal DOM good enough for the client half. */
function makeClientEnv({ ok = true } = {}) {
  const listeners = new Map()

  function element(tag) {
    return {
      tagName: String(tag).toUpperCase(),
      children: [],
      attributes: {},
      dataset: {},
      style: {},
      textContent: '',
      title: '',
      type: '',
      setAttribute(name, value) {
        this.attributes[name] = String(value)
      },
      getAttribute(name) {
        return this.attributes[name] ?? null
      },
      removeAttribute(name) {
        delete this.attributes[name]
      },
      addEventListener(type, fn) {
        const own = listeners.get(this) ?? {}
        own[type] = own[type] ?? []
        own[type].push(fn)
        listeners.set(this, own)
      },
      append(child) {
        this.children.push(child)
      },
      querySelector(selector) {
        if (selector === '[data-dsh-restart-menu]') {
          return this.children.find((child) => child.attributes['data-dsh-restart-menu'] !== undefined) ?? null
        }
        return null
      }
    }
  }

  const bar = element('div')
  bar.setAttribute('role', 'menubar')

  const shadowRoot = {
    querySelector(selector) {
      return selector === '[role="menubar"]' ? bar : null
    }
  }

  const menuHost = element('div')
  menuHost.setAttribute('data-windows-menu', '')
  menuHost.shadowRoot = shadowRoot

  const documentElement = element('html')
  documentElement.setAttribute('lang', 'zh-CN')

  const document = {
    documentElement,
    body: element('body'),
    querySelector(selector) {
      return selector === '[data-windows-menu]' ? menuHost : null
    },
    createElement: element,
    addEventListener() {}
  }

  const fetches = []
  const registered = []
  const intervals = new Set()

  const window = {
    __ModuleLoader__: {
      load(entry) {
        registered.push(entry)
      }
    },
    setInterval(fn, ms) {
      const id = { fn, ms }
      intervals.add(id)
      return id
    },
    clearInterval(id) {
      intervals.delete(id)
    },
    setTimeout(fn, ms) {
      return setTimeout(fn, ms)
    },
    clearTimeout(id) {
      clearTimeout(id)
    }
  }

  const sandbox = {
    window,
    document,
    location: { protocol: 'dsh-app:', href: 'dsh-app://app/' },
    navigator: { language: 'zh-CN' },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: async (url, init) => {
      fetches.push({ url, init })
      return {
        ok,
        status: ok ? 202 : 500,
        async text() {
          return ok ? '{"ok":true}' : '{"error":"boom"}'
        }
      }
    }
  }
  sandbox.globalThis = sandbox

  function emitClick(node) {
    const entries = listeners.get(node) ?? {}
    for (const fn of entries.click ?? []) fn({ preventDefault() {} })
  }

  return { sandbox, registered, fetches, bar, emitClick }
}

/* -------------------------------------------------------------------------- */

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed, ${passed} passed`)
  for (const failure of failures) console.error(`- ${failure.name}`)
  process.exitCode = 1
} else {
  console.log(`\nall ${passed} checks passed`)
}
