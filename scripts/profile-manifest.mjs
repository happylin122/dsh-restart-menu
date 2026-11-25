/**
 * Add or remove dsh-restart-menu from a DSH profile manifest.
 *
 *   node profile-manifest.mjs add    <profile/package.json> <name> <spec>
 *   node profile-manifest.mjs remove <profile/package.json> <name>
 *
 * Keeps `dependencies` and `dsh.profile.bundles` in sync without touching any
 * other entry. Exits non-zero on malformed JSON.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [action, manifestPath, name, spec] = process.argv.slice(2)

if (!['add', 'remove'].includes(action) || manifestPath === undefined || name === undefined) {
  console.error('usage: profile-manifest.mjs <add|remove> <package.json> <name> [spec]')
  process.exit(2)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.dependencies ??= {}
manifest.dsh ??= {}
manifest.dsh.profile ??= {}
manifest.dsh.profile.bundles ??= []

const before = JSON.stringify({ dependencies: manifest.dependencies[name], bundles: [...manifest.dsh.profile.bundles] })

if (action === 'add') {
  if (spec === undefined) {
    console.error('add needs a dependency spec')
    process.exit(2)
  }
  manifest.dependencies[name] = spec
  if (!manifest.dsh.profile.bundles.includes(name)) manifest.dsh.profile.bundles.push(name)
} else {
  delete manifest.dependencies[name]
  manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter((entry) => entry !== name)
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`${action}: ${before} -> ${JSON.stringify({ dependencies: manifest.dependencies[name], bundles: [...manifest.dsh.profile.bundles] })}`)
