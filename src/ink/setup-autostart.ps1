#!/usr/bin/env pwsh
# src/ink/setup-autostart.ps1 -- register the UNAXIS prod TUI to launch at logon.
#
# Problem this solves: the TUI only runs in whatever terminal you happened to
# launch it from. Reboot the PC and the process is just gone, and nobody is
# around to notice the stack came back up half-broken until you go looking
# for it. Docker containers self-heal on TUI boot now (see the "Core stack
# self-heal on startup" effect in src/ink/hooks/useIpcBridge.ts -- it runs
# the same logic as `unaxis up` automatically once per process launch). This
# script is the other half: make sure a TUI process actually exists after
# every reboot to run that self-heal in the first place.
#
# Runs PROD, not dev: an unattended boot-time instance should be the stable
# compiled build (port 50505), not a --watch process meant for active source
# editing. Start `bun run tui:dev` (port 50507) by hand whenever you actually
# want hot-reload for a TUI editing session -- it can run alongside the prod
# instance without a port conflict.
#
# Mechanism: a shortcut in your per-user Startup folder (shell:startup)
# pointing at src/ink/autostart-launch.ps1. Deliberately NOT a Scheduled
# Task -- Register-ScheduledTask needs elevated rights on this machine
# (PermissionDenied / HRESULT 0x80070005 even for a task that only ever runs
# as the current user), while the Startup folder needs none: it's a plain
# per-user autorun mechanism Windows has had since 3.1.
#
# NOTE: this file is plain ASCII on purpose (no em dashes, no smart quotes,
# no checkmark glyphs). Windows PowerShell 5.1 (powershell.exe, as opposed to
# pwsh.exe / PS7) reads .ps1 files without a UTF-8 BOM using the system
# codepage by default, and non-ASCII characters near quotes/operators have
# caused real parse errors here (an earlier version of this script broke on
# an em dash a few lines before an `&` and threw "AmpersandNotAllowed" plus
# unrelated-looking "missing closing brace" errors elsewhere in the file --
# classic symptom of a tokenizer derailed by a mis-decoded byte upstream).
# Also avoids backtick-escaped quotes-inside-strings entirely, in favor of
# single-quoted strings + -f formatting, for the same reason.
#
# What it deliberately does NOT do:
#   - Touch Docker Desktop's own "start on login" setting. That's a one-time
#     toggle in Docker Desktop -> Settings -> General -> "Start Docker
#     Desktop when you sign in". Turn it on once; this script can't safely
#     automate a GUI-only setting whose storage format changes across Docker
#     Desktop versions.
#
# Usage (ordinary, non-admin PowerShell):
#   .\src\ink\setup-autostart.ps1
# To remove it later:
#   .\src\ink\setup-autostart.ps1 -Uninstall

param(
    [switch]$Uninstall
)

$TUI_DIR      = $PSScriptRoot
$LaunchScript = Join-Path $TUI_DIR "autostart-launch.ps1"
$StartupDir   = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupDir "UNAXIS Autostart.lnk"
# Old name from an earlier version of this script that launched dev mode --
# clean it up so a reboot doesn't fire two autostart instances.
$OldShortcutPath = Join-Path $StartupDir "UNAXIS Dev Autostart.lnk"

if ($Uninstall) {
    $removed = $false
    foreach ($path in @($ShortcutPath, $OldShortcutPath)) {
        if (Test-Path $path) {
            Remove-Item $path -Force
            Write-Host ('  Removed: {0}' -f $path) -ForegroundColor Yellow
            $removed = $true
        }
    }
    if (-not $removed) {
        Write-Host ('  Nothing to remove -- no shortcut found at: {0}' -f $ShortcutPath) -ForegroundColor Gray
    }
    exit 0
}

if (Test-Path $OldShortcutPath) {
    Remove-Item $OldShortcutPath -Force
    Write-Host ('  Removed old dev-mode shortcut: {0}' -f $OldShortcutPath) -ForegroundColor Gray
}

if (-not (Test-Path $LaunchScript)) {
    Write-Host ('  ERROR: expected launch script not found: {0}' -f $LaunchScript) -ForegroundColor Red
    exit 1
}

$powershellCmd = Get-Command powershell.exe -ErrorAction SilentlyContinue
if ($powershellCmd) {
    $powershellPath = $powershellCmd.Source
} else {
    $powershellPath = "powershell.exe"
}

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($ShortcutPath)
$shortcut.TargetPath       = $powershellPath
$shortcut.Arguments        = '-NoExit -ExecutionPolicy Bypass -File "{0}"' -f $LaunchScript
$shortcut.WorkingDirectory = $TUI_DIR
$shortcut.WindowStyle      = 1
$shortcut.Description      = "Launches the UNAXIS prod TUI at logon. Installed by setup-autostart.ps1."
$shortcut.Save()

Write-Host ""
Write-Host ('  Installed: {0}' -f $ShortcutPath) -ForegroundColor Green
Write-Host "  Runs at every logon. No admin rights needed, no Scheduled Task." -ForegroundColor Gray
Write-Host "  Test it right now without logging out:" -ForegroundColor Gray
Write-Host ('    Start-Process "{0}"' -f $ShortcutPath) -ForegroundColor Cyan
Write-Host ""
Write-Host "  Remaining manual step: Docker Desktop -> Settings -> General ->" -ForegroundColor Yellow
Write-Host "    'Start Docker Desktop when you sign in' -- turn it on once." -ForegroundColor Yellow
Write-Host ""
