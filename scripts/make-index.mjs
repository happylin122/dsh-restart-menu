/**
 * Build `market/index.json`: a plugin-market index (format 1) that contains only
 * this package. Publishing the package to npm also publishes the index, so the
 * file can be served straight from the registry and added as a market source:
 *
 *   https://registry.npmmirror.com/dsh-restart-menu/<version>/files/market/index.json
 *
 * The icon is inlined as a data URL (format 1 allows up to 32 KiB decoded), so
 * the index does not depend on any other host.
 *
 *   node scripts/make-index.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const icon = readFileSync(join(root, 'assets', 'icon-180.png')).toString('base64')

const index = {
  format: 1,
  title: { en: pkg.name, zh: '重启按钮' },
  description: {
    en: 'One-click restart for DeepSeek Harness Desktop.',
    zh: '给 DeepSeek Harness 桌面版加一枚重启按钮。'
  },
  metadata: {
    categories: { ui: { title: { en: 'UI', zh: '界面' } } },
    labels: {},
    sortKeys: {}
  },
  plugins: [
    {
      name: pkg.name,
      title: { en: 'Restart button', zh: '重启按钮' },
      description: {
        en: 'Adds a Restart button beside the 应用 / 编辑 caption menu: one click closes the whole app and brings it back, with no console window flash.',
        zh: pkg.description
      },
      icon: `data:image/png;base64,${icon}`,
      author: pkg.author,
      homepage: `https://www.npmjs.com/package/${pkg.name}`,
      metadata: {
        category: 'ui',
        keywords: pkg.keywords ?? [],
        labels: [],
        sortKeys: {}
      },
      versions: [
        {
          version: pkg.version,
          publishTimestamp: Math.floor(Date.now() / 1000),
          source: { type: 'npm' },
          engines: { dsh: '>=0.2.1-rc.3' }
        }
      ]
    }
  ]
}

// Fail loudly instead of publishing an index the market will reject.
const decoded = Buffer.from(icon, 'base64').length
if (decoded > 32 * 1024) throw new Error(`icon is ${decoded} bytes, index allows 32768`)

mkdirSync(join(root, 'market'), { recursive: true })
const out = join(root, 'market', 'index.json')
writeFileSync(out, `${JSON.stringify(index, null, 2)}\n`)
console.log(`${out} (${JSON.stringify(index).length} bytes, icon ${decoded} bytes)`)
