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

param(
    [switch]$Windows,
    [switch]$Prod
)

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

# Supervise: the TUI is the platform's watchdog, so it must never stay down.
# It has died without anyone noticing -- on 2026-10-08 Docker Desktop recycled
# the WSL VM two minutes after logon, killing the TUI with it, and this script
# used to launch it exactly once. Nothing ran for four days, so nothing caught
# the port-forward outage that followed. Now every exit is logged and the TUI
# is relaunched (backoff grows on rapid crashes, resets after a long run).
# Close this window, or Ctrl+C twice, to stop it for real.
$LogFile = Join-Path $PROJECT_DIR "logs\tui-supervisor.log"
function Write-SupLog([string]$msg) {
    $line = '{0} {1}' -f (Get-Date -Format s), $msg
    Write-Host ('UNAXIS supervisor: {0}' -f $msg) -ForegroundColor Yellow
    try { Add-Content -Path $LogFile -Value $line -Encoding utf8 } catch { }
}

$wslCmd = Get-Command wsl.exe -ErrorAction SilentlyContinue
$useWsl = $wslCmd -and -not $Windows
$backoff = 5
while ($true) {
    $started = Get-Date
    if ($useWsl) {
        Write-Host "UNAXIS autostart: launching in WSL (Ubuntu)..." -ForegroundColor Cyan
        $wslProjectDir = "/mnt/z/WEBSITES/webbymk2"
        $wslTargetCmd  = if ($Prod) { "unaxis" } else { "bun run tui:dev" }
        & wsl.exe -d Ubuntu -u skill --cd $wslProjectDir bash -lic $wslTargetCmd
    } else {
        $portBusy = Test-NetConnection -ComputerName 127.0.0.1 -Port 50505 -InformationLevel Quiet -WarningAction SilentlyContinue
        if ($portBusy) {
            Write-Host "UNAXIS prod TUI already running on :50505. Not starting another." -ForegroundColor Yellow
            Start-Sleep -Seconds 60
            continue
        }
        Set-Location $PROJECT_DIR
        & (Join-Path $TUI_DIR "run.ps1")
    }
    $code = $LASTEXITCODE
    $ranFor = [int]((Get-Date) - $started).TotalSeconds
    if ($ranFor -ge 600) { $backoff = 5 } else { $backoff = [Math]::Min($backoff * 2, 300) }
    Write-SupLog ('TUI exited (code {0}) after {1}s; relaunching in {2}s' -f $code, $ranFor, $backoff)
    Start-Sleep -Seconds $backoff
}
