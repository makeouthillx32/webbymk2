#!/usr/bin/env pwsh
# build-and-push.ps1
# Run from: Z:\WEBSITES\webbymk2\
# Usage: .\build-and-push.ps1

$IMAGE      = "ghcr.io/makeouthillx32/unenter"
$BLOG_IMAGE = "ghcr.io/makeouthillx32/unenter-blog"
$SHOP_IMAGE = "ghcr.io/makeouthillx32/unenter-shop"
$AUTH_IMAGE = "ghcr.io/makeouthillx32/unenter-auth"
$TAG        = "latest"
$ENV_FILE   = ".env"

# Enable BuildKit
$env:DOCKER_BUILDKIT = "1"

# Load NEXT_PUBLIC_* vars from .env as build args
$buildArgs = @()
if (Test-Path $ENV_FILE) {
    Get-Content $ENV_FILE | ForEach-Object {
        if ($_ -match "^(NEXT_PUBLIC_[^=]+)=(.*)$") {
            $buildArgs += "--build-arg"
            $buildArgs += "$($Matches[1])=$($Matches[2])"
        }
    }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host " BUILD PHASE" -ForegroundColor White
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

# ── Build main app ────────────────────────────────────────────────────────────
Write-Host "[1/4] Building unenter.live (main app)..." -ForegroundColor Cyan

$mainBuildCmd = @(
    "build",
    "--progress=plain",
    "--cache-from", "${IMAGE}:${TAG}",
    "--build-arg", "BUILDKIT_INLINE_CACHE=1"
) + $buildArgs + @("-t", "${IMAGE}:${TAG}", ".")

& docker @mainBuildCmd
if ($LASTEXITCODE -ne 0) { Write-Host "Main app build failed" -ForegroundColor Red; exit 1 }
Write-Host "[1/4] Main app build complete" -ForegroundColor Green

# ── Build blog zone ───────────────────────────────────────────────────────────
Write-Host "[2/4] Building blog.unenter.live (blog zone)..." -ForegroundColor Cyan

$blogBuildCmd = @(
    "build",
    "--progress=plain",
    "--cache-from", "${BLOG_IMAGE}:${TAG}",
    "--build-arg", "BUILDKIT_INLINE_CACHE=1",
    "-f", "zones/blog/Dockerfile"
) + $buildArgs + @("-t", "${BLOG_IMAGE}:${TAG}", ".")

& docker @blogBuildCmd
if ($LASTEXITCODE -ne 0) { Write-Host "Blog zone build failed" -ForegroundColor Red; exit 1 }
Write-Host "[2/4] Blog zone build complete" -ForegroundColor Green

# ── Build shop zone ───────────────────────────────────────────────────────────
Write-Host "[3/4] Building shop.unenter.live (shop zone)..." -ForegroundColor Cyan

$shopBuildCmd = @(
    "build",
    "--progress=plain",
    "--cache-from", "${SHOP_IMAGE}:${TAG}",
    "--build-arg", "BUILDKIT_INLINE_CACHE=1",
    "-f", "zones/shop/Dockerfile"
) + $buildArgs + @("-t", "${SHOP_IMAGE}:${TAG}", ".")

& docker @shopBuildCmd
if ($LASTEXITCODE -ne 0) { Write-Host "Shop zone build failed" -ForegroundColor Red; exit 1 }
Write-Host "[3/4] Shop zone build complete" -ForegroundColor Green

# ── Build auth zone ───────────────────────────────────────────────────────────
Write-Host "[4/4] Building auth.unenter.live (auth zone)..." -ForegroundColor Cyan

$authBuildCmd = @(
    "build",
    "--progress=plain",
    "--cache-from", "${AUTH_IMAGE}:${TAG}",
    "--build-arg", "BUILDKIT_INLINE_CACHE=1",
    "-f", "zones/auth/Dockerfile"
) + $buildArgs + @("-t", "${AUTH_IMAGE}:${TAG}", ".")

& docker @authBuildCmd
if ($LASTEXITCODE -ne 0) { Write-Host "Auth zone build failed" -ForegroundColor Red; exit 1 }
Write-Host "[4/4] Auth zone build complete" -ForegroundColor Green

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host " PUSH PHASE" -ForegroundColor White
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

# ── Push all four ─────────────────────────────────────────────────────────────
Write-Host "[1/4] Pushing main app to GHCR..." -ForegroundColor Cyan
docker push "${IMAGE}:${TAG}"
if ($LASTEXITCODE -ne 0) { Write-Host "Push failed -- run: docker login ghcr.io -u makeouthillx32" -ForegroundColor Red; exit 1 }
Write-Host "[1/4] Main app pushed" -ForegroundColor Green

Write-Host "[2/4] Pushing blog zone to GHCR..." -ForegroundColor Cyan
docker push "${BLOG_IMAGE}:${TAG}"
if ($LASTEXITCODE -ne 0) { Write-Host "Blog push failed -- run: docker login ghcr.io -u makeouthillx32" -ForegroundColor Red; exit 1 }
Write-Host "[2/4] Blog zone pushed" -ForegroundColor Green

Write-Host "[3/4] Pushing shop zone to GHCR..." -ForegroundColor Cyan
docker push "${SHOP_IMAGE}:${TAG}"
if ($LASTEXITCODE -ne 0) { Write-Host "Shop push failed -- run: docker login ghcr.io -u makeouthillx32" -ForegroundColor Red; exit 1 }
Write-Host "[3/4] Shop zone pushed" -ForegroundColor Green

Write-Host "[4/4] Pushing auth zone to GHCR..." -ForegroundColor Cyan
docker push "${AUTH_IMAGE}:${TAG}"
if ($LASTEXITCODE -ne 0) { Write-Host "Auth push failed -- run: docker login ghcr.io -u makeouthillx32" -ForegroundColor Red; exit 1 }
Write-Host "[4/4] Auth zone pushed" -ForegroundColor Green

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host " DEPLOY PHASE" -ForegroundColor White
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

Set-Location "Z:\WEBSITES\webbymk2"

Write-Host "Pulling latest images..." -ForegroundColor Cyan
docker compose pull app blog shop auth

Write-Host "Deploying from docker-compose.yml..." -ForegroundColor Cyan
docker compose up -d --build --remove-orphans

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host " Done -- all zones live" -ForegroundColor Green
Write-Host "   unenter.live" -ForegroundColor White
Write-Host "   blog.unenter.live" -ForegroundColor White
Write-Host "   shop.unenter.live" -ForegroundColor White
Write-Host "   auth.unenter.live" -ForegroundColor White
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
