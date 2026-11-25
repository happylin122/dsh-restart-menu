# Sacrificial relaunch self-test for dsh-restart-menu.
#
# Proves the generated VBScript helper really stops a running image and starts
# it again — including that the replacement window is visible — without touching
# DeepSeek Harness itself. The target is a private copy of cmd.exe renamed to
# dshtest.exe, so no user process can be hit.
$ErrorActionPreference = 'Stop'

$root = 'D:\deepseek-WorkSpace\dsh-restart'
$dir = Join-Path $root '.tmp'
New-Item -ItemType Directory -Force $dir | Out-Null

# Simulate the desktop host environment: Electron runs it in Node mode, so the
# helper inherits ELECTRON_RUN_AS_NODE. The launcher must not leak it to the app.
$env:ELECTRON_RUN_AS_NODE = '1'
$env:DSH_DESKTOP_NODE_EXECUTABLE = 'C:\fake\node.exe'

$exe = Join-Path $dir 'dshtest.exe'
Copy-Item (Join-Path $env:WINDIR 'System32\cmd.exe') $exe -Force

# Regenerate the helper with the sacrificial executable baked in.
node --input-type=module -e "import { pathToFileURL } from 'node:url'; const m = await import(pathToFileURL('D:/deepseek-WorkSpace/dsh-restart/lib/index.js').href); m.__internals.writeHelper(process.argv[1], 1000)" $exe

$old = Start-Process -FilePath $exe -WindowStyle Minimized -PassThru
Start-Sleep -Milliseconds 900
if ($old.HasExited) { throw "sacrificial process exited immediately (pid $($old.Id))" }
Write-Output "old pid: $($old.Id)"

$helper = Join-Path $env:TEMP 'dsh-restart-menu-helper.vbs'
Write-Output "helper: $helper"

# Run the helper the way the host does: wscript //B, no console, detached env
# with the Electron node-mode variables removed.
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = Join-Path $env:WINDIR 'System32\wscript.exe'
$psi.Arguments = '//B //Nologo "' + $helper + '" run 200'
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
$psi.EnvironmentVariables.Remove('DSH_DESKTOP_NODE_EXECUTABLE')
[System.Diagnostics.Process]::Start($psi) | Out-Null

# helper waits 200ms, kills, polls, launches, then verifies for up to 15s
Start-Sleep -Seconds 9

$oldAlive = [bool](Get-Process -Id $old.Id -ErrorAction SilentlyContinue)
$new = @(Get-Process -Name 'dshtest' -ErrorAction SilentlyContinue)
Write-Output "old still alive: $oldAlive"
Write-Output "live dshtest pids: $($new.Id -join ',')"

Write-Output '--- helper log (tail) ---'
Get-Content (Join-Path $env:TEMP 'dsh-restart-menu.log') -Tail 12

# A window that is actually shown owns a main window handle.
$visible = @($new | Where-Object { $_.MainWindowHandle -ne 0 })
Write-Output "new processes with a visible window: $($visible.Count)"

$new | Stop-Process -Force -ErrorAction SilentlyContinue

$log = Get-Content (Join-Path $env:TEMP 'dsh-restart-menu.log') -Raw
if ($oldAlive) { throw 'helper did NOT stop the sacrificial process' }
if ($new.Count -eq 0) { throw 'helper did NOT start a replacement process' }
if ($log -notmatch 'image stopped') { throw 'helper did not confirm the image stopped' }
if ($log -notmatch 'launched') { throw 'helper did not confirm the relaunch' }
if ($visible.Count -eq 0) { throw 'relaunched process has no visible window' }
Write-Output 'SELF-TEST PASSED'
