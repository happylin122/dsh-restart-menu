/**
 * Structural check for `market/index.json` against plugin-market index format 1.
 * The real validator lives inside the DeepSeek Harness asar; this mirrors the
 * rules that actually reject an entry, so a broken index fails here instead of
 * failing when the user adds the source.
 *
 *   node scripts/check-index.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const index = JSON.parse(readFileSync(join(root, 'market', 'index.json'), 'utf8'))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:\d*[a-zA-Z-][0-9a-zA-Z-]*|\d+)(?:\.(?:\d*[a-zA-Z-][0-9a-zA-Z-]*|\d+))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/
const DATA_ICON = /^data:image\/(?:svg\+xml|png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/

function localized(value, path) {
  if (typeof value === 'string') {
    assert.ok(value.trim() !== '', `${path} must not be blank`)
    return value
  }
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${path} must be an object`)
  assert.ok(typeof value.en === 'string' && value.en.trim() !== '', `${path}.en is required`)
  for (const key of Object.keys(value)) assert.match(key, /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/u, `${path}.${key} language id`)
  return value
}

assert.equal(index.format, 1, '$.format must be 1')
localized(index.title, '$.title')
if (index.description !== undefined) localized(index.description, '$.description')

const categories = index.metadata?.categories ?? {}
for (const [id, entry] of Object.entries(categories)) {
  assert.ok(id !== '', 'category id must not be empty')
  localized(entry.title, `$.metadata.categories.${id}.title`)
}

assert.ok(Array.isArray(index.plugins) && index.plugins.length > 0, '$.plugins must be a non-empty array')
const names = new Set()
for (const [i, plugin] of index.plugins.entries()) {
  const at = `$.plugins[${i}]`
  assert.match(plugin.name, PACKAGE, `${at}.name must be an npm package name`)
  assert.ok(!names.has(plugin.name), `${at}.name duplicates ${plugin.name}`)
  names.add(plugin.name)
  if (plugin.title !== undefined) localized(plugin.title, `${at}.title`)
  if (plugin.description !== undefined) localized(plugin.description, `${at}.description`)
  if (plugin.homepage !== undefined) {
    const url = new URL(plugin.homepage)
    assert.ok(url.protocol === 'https:' || url.protocol === 'http:', `${at}.homepage protocol`)
  }
  if (plugin.icon !== undefined) {
    const match = DATA_ICON.exec(plugin.icon)
    assert.ok(match, `${at}.icon must be a base64 png/jpeg/webp/svg data URL`)
    const bytes = Buffer.from(match[1], 'base64').length
    assert.ok(bytes > 0 && bytes <= 32768, `${at}.icon is ${bytes} bytes, limit 32768`)
  }
  const category = plugin.metadata?.category
  if (category !== undefined) assert.ok(category in categories, `${at}.metadata.category references undeclared ${category}`)
  for (const label of plugin.metadata?.labels ?? []) {
    assert.ok(label in (index.metadata?.labels ?? {}), `${at}.metadata.labels references undeclared ${label}`)
  }
  assert.ok(Array.isArray(plugin.versions) && plugin.versions.length > 0, `${at}.versions must be non-empty`)
  const seen = new Set()
  for (const [j, version] of plugin.versions.entries()) {
    const vat = `${at}.versions[${j}]`
    assert.match(version.version, SEMVER, `${vat}.version must be exact SemVer`)
    assert.ok(!seen.has(version.version), `${vat}.version duplicates ${version.version}`)
    seen.add(version.version)
    assert.ok(Number.isInteger(version.publishTimestamp), `${vat}.publishTimestamp must be an integer`)
    assert.ok(version.source?.type === 'npm' || version.source?.type === 'git', `${vat}.source.type`)
    if (version.engines?.dsh !== undefined) {
      assert.doesNotMatch(version.engines.dsh, /^workspace:/, `${vat}.engines.dsh`)
    }
  }
}

// The index must describe the package it ships inside of.
const self = index.plugins.find((plugin) => plugin.name === pkg.name)
assert.ok(self, 'the index must contain this package')
assert.equal(self.versions[0].version, pkg.version, 'index version must match package.json')

console.log(`index ok: ${index.plugins.length} plugin(s), ${self.name}@${self.version ?? pkg.version}`)
