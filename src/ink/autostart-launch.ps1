#!/usr/bin/env pwsh
# src/ink/autostart-launch.ps1
# -----------------------------------------------------------------------------
# Invoked by the Startup-folder shortcut created by setup-autostart.ps1 -- this
# is the script that actually runs at every logon. Kept separate from
# setup-autostart.ps1 (which only installs/removes the shortcut once) so the
# shortcut's target never needs a multi-line quoted -Command string.
#
# Runs PROD (no -Dev): this is the unattended, boot-time instance -- it should
# be the stable compiled build, not a --watch process meant for active source
# editing. run.ps1 (no -Dev) rebuilds dist/cli.js fresh from current source
# every launch, then runs it, so it's never stale. Dev mode (bun run tui:dev,
# port 50507) is for when someone -- Claude or you -- is actively editing TUI
# source and wants hot reload; start that by hand when needed. It listens on
# a different port (50507 vs prod's 50505) so the two can coexist without a
# conflict if you do start a dev session on top of the running prod instance.
#
# NOTE: plain ASCII on purpose -- see the comment in setup-autostart.ps1 for
# why (Windows PowerShell 5.1 + non-ASCII chars near quotes/operators has
# caused real parse errors in this project).
#
# Order of operations:
#   1. Wait (bounded) for the project directory to be reachable -- mapped
#      network drives (Z:\) aren't always remounted the instant a logon
#      session starts.
#   2. Skip entirely if a prod TUI is already listening on :50505 (e.g. you
#      started one by hand before this fired) -- never spawn a duplicate.
#   3. Launch run.ps1 (no -Dev), which builds dist/cli.js then runs it. The
#      core-stack self-heal wired into the TUI's boot sequence takes it from
#      there -- no docker commands needed either way.
# -----------------------------------------------------------------------------

$TUI_DIR     = $PSScriptRoot
$PROJECT_DIR = Split-Path (Split-Path $TUI_DIR -Parent) -Parent

Write-Host ('UNAXIS autostart: waiting for project directory ({0})...' -f $PROJECT_DIR) -ForegroundColor Gray
$deadline = (Get-Date).AddSeconds(60)
while (-not (Test-Path $PROJECT_DIR)) {
    if ((Get-Date) -ge $deadline) {
        Write-Host "UNAXIS autostart: project directory never became available after 60s. Giving up." -ForegroundColor Red
        Write-Host "  (Is the Z: drive mapping set to reconnect at sign-in?)" -ForegroundColor Gray
        Start-Sleep -Seconds 15
        exit 1
    }
    Start-Sleep -Seconds 2
}

$portBusy = Test-NetConnection -ComputerName 127.0.0.1 -Port 50505 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($portBusy) {
    Write-Host "UNAXIS prod TUI already running on :50505. Skipping autostart." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    exit 0
}

Set-Location $PROJECT_DIR
& (Join-Path $TUI_DIR "run.ps1")
