[CmdletBinding()]
param(
  [string]$ContainerName = "unaxis_agent",
  [string]$Image = "ghcr.io/makeouthillx32/unaxis-agent:v0",
  [int]$Port = 8888
)

$ErrorActionPreference = "Stop"
$guardianRoot = Join-Path $env:ProgramData "UNAXIS"
$logPath = Join-Path $guardianRoot "agent-guardian.log"
$rollbackName = "${ContainerName}_rollback"

New-Item -ItemType Directory -Path $guardianRoot -Force | Out-Null

function Write-GuardianLog {
  param([string]$Message)
  $line = "{0:o} {1}" -f (Get-Date), $Message
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

function Invoke-Docker {
  param([string[]]$Arguments)
  $output = & docker @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "docker $($Arguments -join ' ') failed: $($output -join ' ')"
  }
  return $output
}

$mutex = [Threading.Mutex]::new($false, "Global\UNAXISAgentGuardian")
if (-not $mutex.WaitOne(0)) {
  exit 0
}

try {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-GuardianLog "docker CLI is unavailable; leaving state unchanged"
    exit 1
  }

  & docker info --format '{{.ServerVersion}}' *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-GuardianLog "Docker engine is not ready; guardian will retry on its next scheduled run"
    exit 0
  }

  $containerId = ([string](& docker ps -aq --filter "name=^/${ContainerName}$" 2>$null | Select-Object -First 1)).Trim()
  if (-not $containerId) {
    $rollbackId = ([string](& docker ps -aq --filter "name=^/${rollbackName}$" 2>$null | Select-Object -First 1)).Trim()
    if ($rollbackId) {
      Write-GuardianLog "main agent is missing; restoring preserved rollback container"
      Invoke-Docker @("rename", $rollbackName, $ContainerName) | Out-Null
      Invoke-Docker @("start", $ContainerName) | Out-Null
      exit 0
    }

    Write-GuardianLog "agent container is missing; recreating ${ContainerName} from ${Image}"
    Invoke-Docker @("pull", $Image) | Out-Null
    Invoke-Docker @(
      "run", "-d",
      "--name", $ContainerName,
      "--restart", "unless-stopped",
      "-p", "${Port}:8888",
      "-v", "//./pipe/docker_engine://./pipe/docker_engine",
      "-v", "unaxis_agent_data:/data",
      $Image
    ) | Out-Null
    exit 0
  }

  $running = ([string](& docker inspect --format '{{.State.Running}}' $ContainerName 2>$null)).Trim()
  if ($running -ne "true") {
    Write-GuardianLog "agent container exists but is stopped; starting it"
    Invoke-Docker @("start", $ContainerName) | Out-Null
  }
} catch {
  Write-GuardianLog "ERROR: $($_.Exception.Message)"
  exit 1
} finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
