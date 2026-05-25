#!/usr/bin/env pwsh
# smoke-test.ps1 — UNAXIS zero-keystroke smoke test
#
# Runs all health checks against the live TUI without touching the keyboard.
# Saves a timestamped log to logs/smoke-tests/.
#
# Usage (from project root):
#   .\smoke-test.ps1
#   .\smoke-test.ps1 -Verbose        # extra output
#   .\smoke-test.ps1 -SkipEnvPing    # skip agent /health pings
#
# The TUI MUST be running before you start this.
# After the script completes, navigate to the Environments tab in the TUI
# and press [p] on each environment for a visual confirmation.
# ─────────────────────────────────────────────────────────────────────────────

param(
    [switch]$Verbose,
    [switch]$SkipEnvPing
)

# ── Setup ─────────────────────────────────────────────────────────────────────

$PROJECT_DIR = $PSScriptRoot
$ts          = Get-Date -Format "yyyyMMdd_HHmmss"
$logDir      = Join-Path $PROJECT_DIR "logs\smoke-tests"
$logFile     = Join-Path $logDir "smoke-$ts.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$passed = 0
$failed = 0

function Log {
    param([string]$msg, [string]$color = "White")
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $msg"
    Write-Host $line -ForegroundColor $color
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

function LogSection {
    param([string]$title)
    Log ""
    Log ("─── $title " + ("─" * [Math]::Max(0, 60 - $title.Length - 5))) "Cyan"
}

function RunCheck {
    param([string]$label, [scriptblock]$cmd)
    Log "  ▶ $label" "DarkGray"
    try {
        $out = & $cmd 2>&1
        foreach ($line in $out) {
            Log "    $line"
            if ($Verbose) { Write-Host "    $line" -ForegroundColor DarkGray }
        }
        if ($LASTEXITCODE -ne 0) {
            Log "  ✗ $label  (exit $LASTEXITCODE)" "Red"
            $script:failed++
            return $false
        }
        $script:passed++
        return $true
    } catch {
        Log "  ✗ $label  ($_)" "Red"
        $script:failed++
        return $false
    }
}

# ── Header ────────────────────────────────────────────────────────────────────

Log "═══════════════════════════════════════════════════════════════" "Cyan"
Log "  UNAXIS smoke test   $ts" "Cyan"
Log "  log: $logFile" "DarkGray"
Log "═══════════════════════════════════════════════════════════════" "Cyan"

# ── Phase 0: Confirm TUI is running ──────────────────────────────────────────

LogSection "Phase 0 · TUI presence"

$tuiUp = RunCheck "unaxis status" { unaxis status }
if (-not $tuiUp) {
    Log ""
    Log "  ✗ TUI is not running — start it first:  .\unaxis.ps1" "Red"
    Log "    Aborting smoke test." "Red"
    Log ""
    Log "═══════════════════════════════════════════════════════════════" "Red"
    Log "  RESULT:  ABORTED  (TUI not running)" "Red"
    Log "═══════════════════════════════════════════════════════════════" "Red"
    exit 3
}

# ── Phase 1: Session snapshot ─────────────────────────────────────────────────

LogSection "Phase 1 · Session"
RunCheck "session snapshot" { unaxis session } | Out-Null

# ── Phase 2: Stack (no conflicts?) ───────────────────────────────────────────

LogSection "Phase 2 · Stack"
RunCheck "stack ops" { unaxis stack } | Out-Null

# ── Phase 3: Zones ────────────────────────────────────────────────────────────

LogSection "Phase 3 · Zones"
RunCheck "zone list" { unaxis zones } | Out-Null

# ── Phase 4: Proxy ────────────────────────────────────────────────────────────

LogSection "Phase 4 · Proxy"
RunCheck "proxy status"  { unaxis proxy status          } | Out-Null
RunCheck "proxy logs 30" { unaxis logs proxy --tail 30  } | Out-Null

# ── Phase 5: DB ───────────────────────────────────────────────────────────────

LogSection "Phase 5 · DB"
RunCheck "db logs 20" { unaxis db logs --tail 20 } | Out-Null

# ── Phase 6: Environments list ────────────────────────────────────────────────

LogSection "Phase 6 · Environments"
RunCheck "env list" { unaxis envs } | Out-Null

# ── Phase 7: Agent health pings ───────────────────────────────────────────────

if (-not $SkipEnvPing) {
    LogSection "Phase 7 · Agent pings (unaxis ping-envs)"
    Log "  Hitting /health on every configured agent URL…" "DarkGray"
    RunCheck "ping-envs" { unaxis ping-envs } | Out-Null
} else {
    LogSection "Phase 7 · Agent pings  [skipped]"
    Log "  Use -SkipEnvPing:$false to enable." "DarkGray"
}

# ── Summary ───────────────────────────────────────────────────────────────────

$total  = $passed + $failed
$status = if ($failed -eq 0) { "PASS" } else { "FAIL" }
$color  = if ($failed -eq 0) { "Green" } else { "Red" }

Log ""
Log "═══════════════════════════════════════════════════════════════" $color
Log "  RESULT:  $status   ($passed/$total checks passed,  $failed failed)" $color
Log "  log:     $logFile" "DarkGray"
Log "═══════════════════════════════════════════════════════════════" $color
Log ""

if ($failed -eq 0) {
    Log "  Next step — visual confirm in TUI:" "DarkGray"
    Log "    1. Open the TUI (if not already visible)" "DarkGray"
    Log "    2. Navigate to the Environments tab" "DarkGray"
    Log "    3. Press [p] on each environment — verify version matches smoke log" "DarkGray"
    Log ""
}

exit $(if ($failed -eq 0) { 0 } else { 1 })
