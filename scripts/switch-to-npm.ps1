# Switch the desktop profile from the workspace copy (`file:`) to the npm release.
#
#   powershell -ExecutionPolicy Bypass -File scripts/switch-to-npm.ps1 [-Version 0.1.1]
#
# It downloads the published tarball, unpacks it over node_modules/dsh-restart-menu
# (keeping the previous copy as *.local-backup) and rewrites the profile manifest so
# the dependency is a normal semver range instead of a local path.
#
# Note: Windows PowerShell 5.1 reads text as ANSI by default, which corrupts the
# Chinese description and breaks JSON parsing. Read/write through .NET with explicit
# UTF-8 (no BOM) instead of Get-Content/Set-Content.
param(
  [string]$Version = '0.1.1',
  [string]$Profile = (Join-Path $env:USERPROFILE '.dsh\profiles\desktop')
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Read-Utf8([string]$Path) {
  return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8([string]$Path, [string]$Text) {
  [System.IO.File]::WriteAllText($Path, $Text, $utf8)
}

$workspace = Split-Path -Parent $PSScriptRoot
$packageDir = Join-Path $Profile 'node_modules\dsh-restart-menu'
$manifestPath = Join-Path $Profile 'package.json'
$staging = Join-Path $workspace '.tmp-install'

if (-not (Test-Path $manifestPath)) { throw "profile manifest not found: $manifestPath" }

Write-Host "profile:  $Profile"
Write-Host "version:  $Version"

# 1. download the published tarball
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null
$env:npm_config_cache = Join-Path $workspace '.npm-cache'
Push-Location $staging
try {
  npm.cmd pack "dsh-restart-menu@$Version" --silent | Out-Null
} finally {
  Pop-Location
}
$tgz = Get-ChildItem $staging -Filter *.tgz | Select-Object -First 1
if (-not $tgz) { throw "npm pack produced no tarball" }
Write-Host "tarball:  $($tgz.Name) ($([math]::Round($tgz.Length / 1KB, 1)) kB)"

tar -xzf $tgz.FullName -C $staging
$unpacked = Join-Path $staging 'package'
$unpackedManifest = Join-Path $unpacked 'package.json'
if (-not (Test-Path $unpackedManifest)) { throw "tarball did not contain package/package.json" }

$packedVersion = (ConvertFrom-Json (Read-Utf8 $unpackedManifest)).version
if ($packedVersion -ne $Version) { throw "tarball version $packedVersion does not match $Version" }

# 2. swap the installed copy, keeping the previous one for rollback
if (Test-Path $packageDir) {
  $backup = "$packageDir.local-backup"
  if (Test-Path $backup) { Remove-Item $backup -Recurse -Force }
  Move-Item $packageDir $backup
  Write-Host "backup:   $backup"
}
Copy-Item $unpacked $packageDir -Recurse

# 3. rewrite the profile manifest: file:... -> semver range
$manifest = ConvertFrom-Json (Read-Utf8 $manifestPath)
$previous = $manifest.dependencies.'dsh-restart-menu'
$manifest.dependencies.'dsh-restart-menu' = "^$Version"
if ($manifest.dsh.profile.bundles -notcontains 'dsh-restart-menu') {
  $manifest.dsh.profile.bundles += 'dsh-restart-menu'
}
if (-not (Test-Path "$manifestPath.dsh-restart-menu.bak")) {
  Copy-Item $manifestPath "$manifestPath.dsh-restart-menu.bak"
}
Write-Utf8 $manifestPath (($manifest | ConvertTo-Json -Depth 20) + "`n")
Write-Host "manifest: $previous -> ^$Version"

# 4. verify
$installed = ConvertFrom-Json (Read-Utf8 (Join-Path $packageDir 'package.json'))
Write-Host "installed: $($installed.name)@$($installed.version)"
Write-Host 'done - restart the app once to load the npm build'
