[CmdletBinding()]
param(
  [string]$TaskName = "UNAXIS Agent Guardian",
  [string]$ContainerName = "unaxis_agent",
  [string]$Image = "ghcr.io/makeouthillx32/unaxis-agent:v0",
  [int]$Port = 8888
)

$ErrorActionPreference = "Stop"

$source = Join-Path $PSScriptRoot "ensure-unaxis-agent.ps1"
if (-not (Test-Path -LiteralPath $source)) {
  throw "Guardian script not found: $source"
}

$installRoot = Join-Path $env:ProgramData "UNAXIS"
$installedScript = Join-Path $installRoot "ensure-unaxis-agent.ps1"
New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
Copy-Item -LiteralPath $source -Destination $installedScript -Force

$quotedScript = '"{0}"' -f $installedScript
$quotedContainer = '"{0}"' -f $ContainerName
$quotedImage = '"{0}"' -f $Image
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File $quotedScript -ContainerName $quotedContainer -Image $quotedImage -Port $Port"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments

$startupTrigger = New-ScheduledTaskTrigger -AtStartup
$repeatTrigger = New-ScheduledTaskTrigger `
  -Once `
  -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 1) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$task = New-ScheduledTask -Action $action -Trigger @($startupTrigger, $repeatTrigger) -Settings $settings -Principal $principal
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "Installed '$TaskName'. It runs at startup and every minute."
Write-Host "Guardian: $installedScript"
Write-Host "Log:      $(Join-Path $installRoot 'agent-guardian.log')"
