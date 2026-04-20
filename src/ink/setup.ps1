#!/usr/bin/env pwsh
# src/ink/setup.ps1 — First-run local config bootstrap
# ─────────────────────────────────────────────────────────────────────────────
# Creates %APPDATA%\unenter\config.json with your infrastructure credentials.
# This file is never committed — it lives only on your machine.
#
# Run once:  .\src\ink\setup.ps1
# Re-run at any time to update values.
# ─────────────────────────────────────────────────────────────────────────────

$configDir  = Join-Path $env:APPDATA "unenter"
$configFile = Join-Path $configDir "config.json"

# ── Already exists? ────────────────────────────────────────────────────────────

if (Test-Path $configFile) {
    Write-Host ""
    Write-Host "  Config already exists:" -ForegroundColor Yellow
    Write-Host "  $configFile" -ForegroundColor Gray
    Write-Host ""
    $answer = Read-Host "  Overwrite? [y/N]"
    if ($answer -notmatch '^[Yy]$') {
        Write-Host "  Keeping existing config." -ForegroundColor Gray
        exit 0
    }
}

# ── Collect values ─────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  unt.ink local config setup" -ForegroundColor Cyan
Write-Host "  ─────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Values are stored in $configFile" -ForegroundColor Gray
Write-Host "  (never committed to git)" -ForegroundColor Gray
Write-Host ""

# Root domain
$domain = Read-Host "  Root domain          [e.g. example.com]"
if (-not $domain) { $domain = "" }

Write-Host ""

# NPM host (L0VE)
$npmIp   = Read-Host "  NPM (L0VE) IP        [e.g. 192.168.1.10]"
if (-not $npmIp) { $npmIp = "" }

$npmPort = Read-Host "  NPM port             [81]"
if (-not $npmPort) { $npmPort = "81" }

$npmEmail = Read-Host "  NPM admin email"
if (-not $npmEmail) { $npmEmail = "" }

$npmPass  = Read-Host "  NPM admin password" -AsSecureString
$npmPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($npmPass)
)

$npmLeEmail = Read-Host "  Let's Encrypt email  [same as NPM email]"
if (-not $npmLeEmail) { $npmLeEmail = $npmEmail }

Write-Host ""

# Stack host (P0W3R)
$stackIp   = Read-Host "  Stack (P0W3R) IP     [e.g. 192.168.1.20]"
if (-not $stackIp) { $stackIp = "" }

$stackPort = Read-Host "  Proxy port           [3080]"
if (-not $stackPort) { $stackPort = "3080" }

Write-Host ""

# DDNS
$ddnsHost = Read-Host "  ASUS DDNS hostname   [e.g. yourhome.asuscomm.com]"
if (-not $ddnsHost) { $ddnsHost = "" }

# ── Write config ───────────────────────────────────────────────────────────────

New-Item -ItemType Directory -Force -Path $configDir | Out-Null

$config = [ordered]@{
    "_comment" = "Local infrastructure config — never commit. Lives in %APPDATA%\unenter\config.json"
    "domain" = $domain
    "npm" = [ordered]@{
        "ip"       = $npmIp
        "port"     = [int]$npmPort
        "email"    = $npmEmail
        "password" = $npmPassPlain
        "leEmail"  = $npmLeEmail
    }
    "stack" = [ordered]@{
        "ip"        = $stackIp
        "proxyPort" = [int]$stackPort
    }
    "ddns" = [ordered]@{
        "hostname" = $ddnsHost
    }
}

$config | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $configFile

Write-Host ""
Write-Host "  ✓  Config written to:" -ForegroundColor Green
Write-Host "     $configFile" -ForegroundColor Gray
Write-Host ""
Write-Host "  Run the TUI:" -ForegroundColor Gray
Write-Host "     bun run tui:dev" -ForegroundColor Cyan
Write-Host ""
