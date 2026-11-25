# Remove dsh-restart-menu from a DSH profile (restores the pre-install manifest).
#
#   powershell -ExecutionPolicy Bypass -File scripts/uninstall-local.ps1
param(
  [string]$Profile = 'desktop'
)

$ErrorActionPreference = 'Stop'

$home_ = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$profileDir = Join-Path $home_ "profiles\$Profile"
$manifest = Join-Path $profileDir 'package.json'
if (-not (Test-Path $manifest)) { throw "profile manifest not found: $manifest" }

node (Join-Path $PSScriptRoot 'profile-manifest.mjs') remove $manifest 'dsh-restart-menu'

$target = Join-Path $profileDir 'node_modules\dsh-restart-menu'
if (Test-Path $target) { Remove-Item -Recurse -Force $target }

$backup = "$manifest.dsh-restart-menu.bak"
Write-Output "removed. pre-install manifest backup kept at: $backup"
Write-Output 'restart DeepSeek Harness for the titlebar button to disappear.'
