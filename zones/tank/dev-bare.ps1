# zones/tank/dev-bare.ps1
# -----------------------------------------------------------------------------
# Runs the Tank zone's dev server as a plain host process instead of inside
# the dev-tank Docker container - same env vars, same real db.unenter.live
# backend (loaded from the repo-root .env, the same file the Docker dev
# container uses as its env_file), just no Docker/WSL2 virtualization
# boundary in the way. Added 2026-08-30 after the containerized dev loop
# repeatedly took 40s+ to compile a single route under real Docker-VM
# resource contention (~25 containers running concurrently) - a config tweak
# (removing the SSG-only CPU cap that was also throttling dev) helped but
# didn't fix it; native execution sidesteps the bottleneck entirely instead
# of chasing it.
#
# Deliberately NOT wired into unaxis's zone lifecycle (no start/stop
# tracking, no proxy registration) - this is the "open a terminal, run it,
# close it when done" loop, not a managed service. Reachable directly at
# http://localhost:3012 (or http://192.168.50.204:3012 from elsewhere on
# the LAN) - no proxy hop needed for local iteration.
#
# Usage:  powershell -File zones/tank/dev-bare.ps1
# Stop:   Ctrl+C in this terminal, then just close the window.
# -----------------------------------------------------------------------------

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envFile = Join-Path $repoRoot ".env"

if (-not (Test-Path $envFile)) {
    Write-Error "Root .env not found at $envFile - cannot load Supabase/runtime secrets."
    exit 1
}

Write-Host "Loading env vars from $envFile ..." -ForegroundColor Cyan
$loaded = 0
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $key = $line.Substring(0, $eq).Trim()
    $val = $line.Substring($eq + 1).Trim()
    # Strip a single layer of surrounding quotes, if present.
    $dq = [char]34
    $sq = [char]39
    $wrappedInDouble = $val.Length -ge 2 -and $val.StartsWith($dq) -and $val.EndsWith($dq)
    $wrappedInSingle = $val.Length -ge 2 -and $val.StartsWith($sq) -and $val.EndsWith($sq)
    if ($wrappedInDouble -or $wrappedInSingle) {
        $val = $val.Substring(1, $val.Length - 2)
    }
    [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
    $loaded++
}
Write-Host "Loaded $loaded vars." -ForegroundColor Cyan

$env:NEXT_PUBLIC_ZONE = "tank"
$env:NEXT_TELEMETRY_DISABLED = "1"

# Root .env's NEXT_PUBLIC_SUPABASE_URL is the SERVER-side value
# (http://kong:8000) - a Docker-internal hostname that only resolves from
# inside the unenter network. A bare-metal process is outside that network
# entirely, same as a real browser, so it needs the same externally-
# reachable URL a browser uses for both. Without this override every
# server-side Supabase call hung until its own timeout before falling
# through - measured live 2026-08-30: a single page load took 48+ seconds.
if ($env:NEXT_PUBLIC_SUPABASE_URL_BROWSER) {
    $env:NEXT_PUBLIC_SUPABASE_URL = $env:NEXT_PUBLIC_SUPABASE_URL_BROWSER
    Write-Host "Overrode NEXT_PUBLIC_SUPABASE_URL to the external URL (bare-metal has no Docker-network kong hostname)." -ForegroundColor Yellow
}

# receiverManager.ts's default (http://host.docker.internal:5050) is a
# Docker-only DNS name that resolves from INSIDE a container back to the
# host - meaningless from a process already running ON the host. The SRT
# receiver manager itself already runs natively (not in Docker) on this
# same machine, per receiverManager.ts's own comment, so from here it's
# just localhost. Without this, every camera/director data fetch on the
# page serialized through a real 1s-timeout-per-call fetch failure first.
if (-not $env:SRT_MANAGER_INTERNAL_URL) {
    $env:SRT_MANAGER_INTERNAL_URL = "http://localhost:5050"
    Write-Host "Set SRT_MANAGER_INTERNAL_URL to http://localhost:5050 (bare-metal has no host.docker.internal)." -ForegroundColor Yellow
}

Write-Host "Starting Tank zone dev server on http://localhost:3012 ..." -ForegroundColor Green
Set-Location $PSScriptRoot
bun run dev
