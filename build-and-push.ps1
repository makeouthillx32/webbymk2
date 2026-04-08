#!/usr/bin/env pwsh
# build-and-push.ps1
# Run from: Z:\WEBSITES\webbymk2\
# Usage: .\build-and-push.ps1

$IMAGE = "ghcr.io/makeouthillx32/unenter"
$TAG = "latest"
$ENV_FILE = ".env"

# Enable BuildKit for parallel builds
$env:DOCKER_BUILDKIT = "1"

# Load env vars from .env
$buildArgs = @()
if (Test-Path $ENV_FILE) {
    Get-Content $ENV_FILE | ForEach-Object {
        if ($_ -match "^(NEXT_PUBLIC_[^=]+)=(.*)$") {
            $buildArgs += "--build-arg"
            $buildArgs += "$($Matches[1])=$($Matches[2])"
        }
    }
}

Write-Host "Building unenter.live..." -ForegroundColor Cyan
Write-Host "   BuildKit: ON | Cache: FROM last push | Args: $($buildArgs.Count / 2) NEXT_PUBLIC vars" -ForegroundColor Gray

$buildCmd = @(
    "build",
    "--progress=plain",
    "--cache-from", "${IMAGE}:${TAG}",
    "--build-arg", "BUILDKIT_INLINE_CACHE=1"
) + $buildArgs + @("-t", "${IMAGE}:${TAG}", ".")

& docker @buildCmd

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed" -ForegroundColor Red
    exit 1
}

Write-Host "Build complete" -ForegroundColor Green
Write-Host "Pushing to GHCR..." -ForegroundColor Cyan

docker push "${IMAGE}:${TAG}"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Push failed -- run: docker login ghcr.io -u makeouthillx32" -ForegroundColor Red
    exit 1
}

Write-Host "Pushed ${IMAGE}:${TAG}" -ForegroundColor Green
Write-Host "Restarting app container..." -ForegroundColor Cyan

Set-Location "Z:\WEBSITES\webbymk2"
docker compose pull app
docker compose up -d app

Write-Host "Done -- unenter.live redeployed" -ForegroundColor Green