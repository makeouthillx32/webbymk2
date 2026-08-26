$ErrorActionPreference = 'Stop'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PausePath = Join-Path $ScriptRoot 'PAUSE'
$PidPath = Join-Path $ScriptRoot 'logs\launcher.pid'

if (-not (Test-Path -LiteralPath $PausePath)) {
  New-Item -ItemType File -Path $PausePath | Out-Null
}

Write-Host ('Pause marker created: {0}' -f $PausePath)
if (Test-Path -LiteralPath $PidPath) {
  $launcherPid = (Get-Content -LiteralPath $PidPath -Raw).Trim()
  Write-Host ('Launcher PID {0} will stop before the next wave. The active wave must close safely.' -f $launcherPid)
} else {
  Write-Host 'No launcher PID file is present.'
}
