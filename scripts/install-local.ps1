# Install dsh-restart-menu into a DSH profile from this working copy.
#
#   powershell -ExecutionPolicy Bypass -File scripts/install-local.ps1
#
# Idempotent: re-copies the package and re-asserts the profile manifest entries.
# A timestamped backup of the profile package.json is written next to it.
param(
  [string]$Profile = 'desktop',
  [string]$Source = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$home_ = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$profileDir = Join-Path $home_ "profiles\$Profile"
if (-not (Test-Path (Join-Path $profileDir 'package.json'))) {
  throw "profile not found: $profileDir"
}

$target = Join-Path $profileDir 'node_modules\dsh-restart-menu'
Write-Output "source : $Source"
Write-Output "profile: $profileDir"
Write-Output "target : $target"

# 1. Copy the package (a real directory, so Node resolves it like any other plugin).
if (Test-Path $target) { Remove-Item -Recurse -Force $target }
New-Item -ItemType Directory -Force $target | Out-Null
foreach ($item in 'package.json', 'cordis.patch.yml', 'README.md', 'LICENSE', 'lib', 'assets') {
  $from = Join-Path $Source $item
  if (-not (Test-Path $from)) { throw "missing package file: $from" }
  Copy-Item -Recurse -Force $from (Join-Path $target $item)
}

# 2. Register the bundle + dependency in the profile manifest (timestamped backup first).
$manifest = Join-Path $profileDir 'package.json'
$backup = "$manifest.dsh-restart-menu.bak"
if (-not (Test-Path $backup)) { Copy-Item -Force $manifest $backup }

$spec = 'file:' + ($Source -replace '\\', '/')
$editor = Join-Path $PSScriptRoot 'profile-manifest.mjs'
node $editor add $manifest 'dsh-restart-menu' $spec

Write-Output '--- profile manifest ---'
Get-Content $manifest
