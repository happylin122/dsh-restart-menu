/**
 * Generate the awesome-dsh-plugin catalog entry for this package.
 *
 *   node market/prep-catalog-entry.mjs --owner happylin21 [--repo dsh-restart-menu] [--category ui]
 *
 * Writes `market/submission/<owner>__<repo>.yml` and keeps the `repository`,
 * `homepage` and `bugs` fields in package.json pointing at that repo, so the
 * npm package and the catalog entry cannot drift apart.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const pkgPath = join(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const repo = arg('repo', pkg.name)
const owner = arg('owner')
if (!owner) {
  console.error('usage: node market/prep-catalog-entry.mjs --owner <github-owner> [--repo <name>]')
  process.exit(1)
}
const category = arg('category', 'ui')
const url = `https://github.com/${owner}/${repo}`
const icon = `https://raw.githubusercontent.com/${owner}/${repo}/main/assets/icon-180.png`

// Keep the npm metadata and the catalog entry pointing at the same repository.
pkg.homepage = url
pkg.repository = { type: 'git', url: `git+${url}.git` }
pkg.bugs = { url: `${url}/issues` }
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

const en =
  'Adds a Restart button beside the 应用 / 编辑 caption menu in DeepSeek Harness Desktop: one click closes the whole app and brings it back, with no tray icon hunt and no console window flash.'
const zh = pkg.description

const yaml = [
  `url: ${url}`,
  `name: ${owner}/${repo}`,
  `category: ${category}`,
  'description:',
  `  en: '${en.replace(/'/g, "''")}'`,
  `  zh: ${zh}`,
  `icon: ${icon}`,
  ''
].join('\n')

const outDir = join(root, 'market', 'submission')
mkdirSync(outDir, { recursive: true })
const outFile = join(outDir, `${owner}__${repo}.yml`)
writeFileSync(outFile, yaml)
console.log(outFile)
