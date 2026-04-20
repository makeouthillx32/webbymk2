#!/usr/bin/env pwsh
# src/ink/run.ps1 - launch the unt.ink TUI
#
# Modes:
#   .\src\ink\run.ps1        - build dist/cli.mjs, run with node (stable)
#   .\src\ink\run.ps1 -Dev   - run from source with --watch (instant reload on save)
#
# Dev mode is the fastest way to iterate: save a file, TUI restarts in ~1s.
# Build mode produces dist/cli.mjs. To compile a standalone exe:
#   bun build --compile src\ink\App.tsx --outfile src\ink\dist\unt.exe

param(
    [switch]$Dev
)

$TUI_DIR     = $PSScriptRoot
# src/ink is two levels deep — go up twice to reach project root
$PROJECT_DIR = Split-Path (Split-Path $TUI_DIR -Parent) -Parent

# --- Check local config -------------------------------------------------------
# Sensitive infra credentials live in %APPDATA%\unenter\config.json — never in git.
# Run setup.ps1 once to create it interactively.

$untConfigFile = Join-Path $env:APPDATA "unenter\config.json"
if (-not (Test-Path $untConfigFile)) {
    Write-Host ""
    Write-Host "  ✗  Local config not found:" -ForegroundColor Red
    Write-Host "     $untConfigFile" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Run the setup script once to create it:" -ForegroundColor Yellow
    Write-Host "     .\src\ink\setup.ps1" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

# --- Check Bun ----------------------------------------------------------------

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Host "  Bun is not installed.  https://bun.sh/docs/installation" -ForegroundColor Red
    exit 1
}

# --- Load .env into this PowerShell session -----------------------------------
# Child processes (bun, node) inherit environment variables from the parent
# session, so loading here covers both dev and build/run modes.
# Handles: KEY=value, KEY="value", KEY='value', and ignores comments/blanks.

$envFile = Join-Path $PROJECT_DIR ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
            $key = $Matches[1]
            $val = $Matches[2].Trim().Trim('"').Trim("'")
            [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
        }
    }
    # docker-compose maps ANON_KEY -> SUPABASE_ANON_KEY inside the container.
    # Replicate that mapping so the TUI sees the same vars it expects.
    $anonKey = [System.Environment]::GetEnvironmentVariable("ANON_KEY", "Process")
    if ($anonKey -and -not [System.Environment]::GetEnvironmentVariable("SUPABASE_ANON_KEY", "Process")) {
        [System.Environment]::SetEnvironmentVariable("SUPABASE_ANON_KEY", $anonKey, "Process")
    }
    $svcKey = [System.Environment]::GetEnvironmentVariable("SERVICE_ROLE_KEY", "Process")
    if ($svcKey -and -not [System.Environment]::GetEnvironmentVariable("SUPABASE_SERVICE_KEY", "Process")) {
        [System.Environment]::SetEnvironmentVariable("SUPABASE_SERVICE_KEY", $svcKey, "Process")
    }
    if (-not [System.Environment]::GetEnvironmentVariable("SUPABASE_URL", "Process")) {
        [System.Environment]::SetEnvironmentVariable("SUPABASE_URL", "http://localhost:8000", "Process")
    }
    # Write-Host "Loaded .env" -ForegroundColor Gray  # silenced — avoids ghost lines above TUI
} else {
    Write-Host "Warning: no .env found at project root" -ForegroundColor Yellow
}

# --- Install / sync tui dependencies -----------------------------------------
# Always run - ensures tui/node_modules has React 18 + ink 4 even if the
# directory exists but is empty (left over from the old Docker named volume).

Push-Location $TUI_DIR
Write-Host "Syncing TUI dependencies..." -ForegroundColor Gray

bun install --frozen-lockfile 2>$null
if ($LASTEXITCODE -ne 0) { bun install }

if ($LASTEXITCODE -ne 0) {
    Write-Host "bun install failed." -ForegroundColor Red
    Pop-Location; exit 1
}

# --- Dev mode -----------------------------------------------------------------

if ($Dev) {
    Pop-Location  # leave src/ink/ — install is done

    Write-Host ""
    Write-Host "  DEV MODE - watching for changes" -ForegroundColor Cyan
    Write-Host "  Save any .ts/.tsx file to restart instantly." -ForegroundColor Gray
    Write-Host "  Ctrl-C to quit." -ForegroundColor Gray
    Write-Host ""

    # Run from project root so Bun's "project directory" covers src/config/
    # (otherwise imports outside src/ink/ are silently not watched).
    # --tsconfig-override keeps the React 18 + ink 4 isolation in src/ink/tsconfig.json.
    #
    # Use absolute paths — relative paths trigger a bun file-watcher bug on Windows
    # where tsconfig.json is registered as a watched directory instead of a file,
    # producing "Internal error: directory mismatch" and a resolver crash.
    Push-Location $PROJECT_DIR
    bun --tsconfig-override "$TUI_DIR\tsconfig.json" --watch "$TUI_DIR\App.tsx"
    Pop-Location
    exit $LASTEXITCODE
}

# --- Check Node ---------------------------------------------------------------

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  Node.js is not installed.  https://nodejs.org" -ForegroundColor Red
    Pop-Location; exit 1
}

# --- Build --------------------------------------------------------------------

Write-Host "Building dist/cli.mjs..." -ForegroundColor Gray
bun build.ts 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    # Re-run without silencing so the error is visible
    bun build.ts
    Write-Host "Build failed." -ForegroundColor Red
    Pop-Location; exit 1
}

Pop-Location

# --- Run ----------------------------------------------------------------------
# Clear the terminal before launching so no shell output bleeds through as
# "ghost" duplicate frames inside the Ink TUI on Windows Terminal / PowerShell.

[Console]::Clear()

Push-Location $PROJECT_DIR
node .\src\ink\dist\cli.mjs
Pop-Location
