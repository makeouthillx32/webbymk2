# scripts/cron-control.ps1
# Batch stop/status helper script for Antigravity cron loops

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("Stop", "Status")]
    [string]$Action
)

$registryPath = Join-Path $PSScriptRoot "../.tmp/active-crons.json"
if (-not (Test-Path $registryPath)) {
    Write-Error "Active crons registry not found at $registryPath. Are the crons running?"
    exit 1
}

$registry = Get-Content $registryPath | ConvertFrom-Json

if ($Action -eq "Status") {
    Write-Host "=== Active Antigravity Schedulers ===" -ForegroundColor Cyan
    Write-Host "Morning Agent: $($registry.active_crons.morning)"
    Write-Host "Nightly Agent: $($registry.active_crons.nightly)"
    Write-Host "Weekly Agent:  $($registry.active_crons.weekly)"
    Write-Host "Health Agent:  $($registry.active_crons.health)"
    Write-Host "Last Updated:  $($registry.last_updated)"
}
elseif ($Action -eq "Stop") {
    Write-Host "=== Stopping Active Antigravity Schedulers ===" -ForegroundColor Yellow
    Write-Host "To stop all active crons, simply ask me in the chat:" -ForegroundColor White
    Write-Host "  `"Antigravity, please batch stop our active crons.`"" -ForegroundColor Cyan
    Write-Host "And I will immediately execute the batch cancellation." -ForegroundColor White
    Write-Host ""
    Write-Host "Alternatively, here are the direct CLI task IDs to stop:" -ForegroundColor White
    Write-Host "  manage_task -Action kill -TaskId $($registry.active_crons.morning)" -ForegroundColor Green
    Write-Host "  manage_task -Action kill -TaskId $($registry.active_crons.nightly)" -ForegroundColor Green
    Write-Host "  manage_task -Action kill -TaskId $($registry.active_crons.weekly)" -ForegroundColor Green
    Write-Host "  manage_task -Action kill -TaskId $($registry.active_crons.health)" -ForegroundColor Green
}
