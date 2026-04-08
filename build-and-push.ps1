#!/usr/bin/env pwsh
# build-and-push.ps1
# Run from your project root (where docker-compose.yml lives)
# Usage: .\build-and-push.ps1
# First time: docker login ghcr.io -u makeouthillx32

$IMAGE = "ghcr.io/makeouthillx32/unenter"
$TAG = "latest"
$ENV_FILE = ".env"

# Enable BuildKit for parallel layer caching
$env:DOCKER_BUILDKIT = "1"

# ─── Load NEXT_PUBLIC_* build args from .env ──────────────────────────────────
$buildArgs = @()
if (Test-Path $ENV_FILE) {
    Get-Content $ENV_FILE | ForEach-Object {
        if ($_ -match "^(NEXT_PUBLIC_[^=]+)=(.*)$") {
            $buildArgs += "--build-arg"
            $buildArgs += "$($Matches[1])=$($Matches[2])"
        }
    }
} else {
    Write-Host "⚠  No .env file found — build args will be empty" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   unenter.live — Build & Push            ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "   Image  : $IMAGE`:$TAG" -ForegroundColor Gray
Write-Host "   BuildKit: ON  |  Cache: FROM last push" -ForegroundColor Gray
Write-Host "   Build args: $($buildArgs.Count / 2) NEXT_PUBLIC vars loaded" -ForegroundColor Gray
Write-Host ""

# ─── Build ────────────────────────────────────────────────────────────────────
$buildCmd = @(
    "build",
    "--progress=plain",
    "--cache-from", "${IMAGE}:${TAG}",
    "--build-arg", "BUILDKIT_INLINE_CACHE=1"
) + $buildArgs + @(
    "-t", "${IMAGE}:${TAG}",
    "."
)

Write-Host "▸ Building image..." -ForegroundColor Cyan
& docker @buildCmd

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Build complete" -ForegroundColor Green

# ─── Push ─────────────────────────────────────────────────────────────────────
Write-Host "▸ Pushing to GHCR..." -ForegroundColor Cyan
docker push "${IMAGE}:${TAG}"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Push failed" -ForegroundColor Red
    Write-Host "   Run: docker login ghcr.io -u makeouthillx32" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Pushed ${IMAGE}:${TAG}" -ForegroundColor Green

# ─── Redeploy ─────────────────────────────────────────────────────────────────
Write-Host "▸ Restarting unt_app container..." -ForegroundColor Cyan

# Pull the fresh image then restart just the app — leaves DB/Kong/MinIO running
docker compose pull app
docker compose up -d app

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Redeploy failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ✅ unenter.live redeployed               ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  App    → http://localhost:3000           ║" -ForegroundColor Green
Write-Host "║  Studio → http://localhost:3002           ║" -ForegroundColor Green
Write-Host "║  Kong   → http://localhost:8001           ║" -ForegroundColor Green
Write-Host "║  MinIO  → http://localhost:9003           ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""