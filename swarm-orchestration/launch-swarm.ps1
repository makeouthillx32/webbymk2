param(
  [switch]$Once,
  [switch]$DryRun,
  [switch]$Continuous,
  [datetime]$StopAt,
  [int]$CycleMinutes = 330,
  [int]$ContinuousDelayMinutes = 10,
  [int]$WaveTimeoutMinutes = 285
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptRoot
$PromptPath = Join-Path $ScriptRoot 'ORCHESTRATOR.md'
$PausePath = Join-Path $ScriptRoot 'PAUSE'
$LogDir = Join-Path $ScriptRoot 'logs'
$StatePath = Join-Path $RepoRoot 'vault\Swarm\STATE.md'
$StatusPath = Join-Path $LogDir 'status.json'
$PidPath = Join-Path $LogDir 'launcher.pid'
$LauncherLog = Join-Path $LogDir 'launcher.log'
$ConsecutiveFailureLimit = 3

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-LauncherLog([string]$Message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Write-Host $line
  Add-Content -LiteralPath $LauncherLog -Value $line -Encoding UTF8
}

function Write-Status([string]$Phase, [int]$WaveNumber, [int]$ExitCode, [string]$Detail) {
  $status = [ordered]@{
    pid = $PID
    phase = $Phase
    wave = $WaveNumber
    exit_code = $ExitCode
    detail = $Detail
    updated = (Get-Date).ToString('o')
    stop_at = $StopAt.ToString('o')
    dry_run = [bool]$DryRun
    continuous = [bool]$Continuous
  }
  $status | ConvertTo-Json | Set-Content -LiteralPath $StatusPath -Encoding UTF8
}

function Test-Paused {
  if (Test-Path -LiteralPath $PausePath) { return $true }
  if (Test-Path -LiteralPath $StatePath) {
    $state = [IO.File]::ReadAllText($StatePath, [Text.Encoding]::UTF8)
    if ($state -match '(?im)^paused:\s*true\s*$') { return $true }
  }
  return $false
}

function Get-CodexInvocation {
  $command = Get-Command codex.cmd -CommandType Application -ErrorAction SilentlyContinue
  if (-not $command) {
    $command = Get-Command codex -CommandType Application -ErrorAction Stop | Select-Object -First 1
  }
  return [ordered]@{
    FilePath = $command.Source
    Prefix = ''
  }
}

function Invoke-Wave([int]$WaveNumber) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $promptFile = Join-Path $LogDir ('prompt-{0}.md' -f $stamp)
  $stdoutFile = Join-Path $LogDir ('wave-{0}.out.log' -f $stamp)
  $stderrFile = Join-Path $LogDir ('wave-{0}.err.log' -f $stamp)
  $prompt = [IO.File]::ReadAllText($PromptPath, [Text.Encoding]::UTF8)

  if ($DryRun) {
    $prompt += @'


## DRY RUN OVERRIDE

This invocation is a read-only wiring check. Do not edit source, vault notes, or runtime
state. Do not spawn subagents and do not build or deploy. Validate the configured paths,
skill availability, Obsidian reads, installed CLI version/help, project session, docs zone,
pause controls, and report whether a live wave can proceed. Then exit.
End with `SWARM_WAVE_RESULT: success` if a live wave can proceed, otherwise end with
`SWARM_WAVE_RESULT: blocked`.
'@
  }

  [IO.File]::WriteAllText($promptFile, $prompt, (New-Object Text.UTF8Encoding($false)))
  $codex = Get-CodexInvocation
  # UNAXIS is installed outside the repo and controls the local dev TUI over IPC.
  # Codex's Windows workspace sandbox hides both, so the host runner is required.
  # The orchestrator prompt remains the mutation boundary.
  $sandbox = 'danger-full-access'
  $args = '{0} exec --sandbox {1} -c approval_policy=never -c shell_environment_policy.inherit=all --ephemeral -C "{2}" -' -f $codex.Prefix, $sandbox, $RepoRoot
  $args = $args.Trim()

  Write-LauncherLog ('starting wave {0}; output={1}' -f $WaveNumber, $stdoutFile)
  Write-Status 'running' $WaveNumber 0 $stdoutFile

  $process = Start-Process -FilePath $codex.FilePath -ArgumentList $args `
    -WorkingDirectory $RepoRoot -RedirectStandardInput $promptFile `
    -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile `
    -WindowStyle Hidden -PassThru

  $finished = $process.WaitForExit($WaveTimeoutMinutes * 60 * 1000)
  if (-not $finished) {
    Write-LauncherLog ('wave {0} timed out after {1} minutes; terminating process tree' -f $WaveNumber, $WaveTimeoutMinutes)
    & taskkill.exe /PID $process.Id /T /F | Out-Null
    Write-Status 'timeout' $WaveNumber 124 $stdoutFile
    return 124
  }

  $process.WaitForExit()
  $process.Refresh()
  $code = $process.ExitCode
  if ($null -eq $code) {
    $stderrLength = if (Test-Path -LiteralPath $stderrFile) { (Get-Item -LiteralPath $stderrFile).Length } else { 0 }
    $code = if ($stderrLength -gt 0) { 1 } else { 0 }
  }
  $code = [int]$code
  $finalOutput = if (Test-Path -LiteralPath $stdoutFile) { [IO.File]::ReadAllText($stdoutFile, [Text.Encoding]::UTF8) } else { '' }
  if ($finalOutput -match '(?im)^SWARM_WAVE_RESULT:\s*(success|blocked|paused)\s*$') {
    $code = 0
  } elseif ($finalOutput -match '(?im)^SWARM_WAVE_RESULT:\s*failed\s*$') {
    $code = 1
  }
  if ($code -eq 0) {
    Write-LauncherLog ('wave {0} completed successfully' -f $WaveNumber)
    Write-Status 'completed' $WaveNumber $code $stdoutFile
  } else {
    Write-LauncherLog ('wave {0} failed with exit code {1}; stderr={2}' -f $WaveNumber, $code, $stderrFile)
    Write-Status 'failed' $WaveNumber $code $stderrFile
  }
  return $code
}

$now = Get-Date
if ($Continuous) {
  $StopAt = [datetime]::MaxValue
} elseif (-not $PSBoundParameters.ContainsKey('StopAt')) {
  $StopAt = $now.Date.AddHours(8)
  if ($StopAt -le $now.AddMinutes(15)) { $StopAt = $StopAt.AddDays(1) }
}

$mutex = New-Object Threading.Mutex($false, 'Local\UNAXISDocsSwarmLauncher')
$ownsMutex = $false
try {
  $ownsMutex = $mutex.WaitOne(0)
  if (-not $ownsMutex) {
    Write-LauncherLog 'another launcher instance is active; exiting'
    exit 10
  }

  Set-Content -LiteralPath $PidPath -Value $PID -Encoding ASCII
  Write-LauncherLog ('launcher started; pid={0}; stop_at={1}; cycle={2}m; continuous={3}; continuous_delay={4}m; dry_run={5}' -f $PID, $StopAt.ToString('o'), $CycleMinutes, [bool]$Continuous, $ContinuousDelayMinutes, [bool]$DryRun)

  $waveNumber = 0
  $consecutiveFailures = 0
  $lastExitCode = 0
  while ((Get-Date) -lt $StopAt) {
    if (Test-Paused) {
      Write-LauncherLog 'pause is active; launcher standing down'
      Write-Status 'paused' $waveNumber 0 $PausePath
      break
    }

    $waveNumber++
    $started = Get-Date
    $exitCode = Invoke-Wave $waveNumber
    $lastExitCode = $exitCode
    if ($exitCode -eq 0) { $consecutiveFailures = 0 } else { $consecutiveFailures++ }

    if ($Once -or $DryRun) { break }
    if ($consecutiveFailures -ge $ConsecutiveFailureLimit) {
      Write-LauncherLog ('stopping after {0} consecutive failures' -f $consecutiveFailures)
      break
    }

    $nextStart = if ($Continuous) {
      (Get-Date).AddMinutes($ContinuousDelayMinutes)
    } else {
      $started.AddMinutes($CycleMinutes)
    }
    if ($nextStart -ge $StopAt) {
      Write-LauncherLog 'next wave would start after stop_at; overnight run complete'
      break
    }

    Write-LauncherLog ('waiting until {0}' -f $nextStart.ToString('o'))
    while ((Get-Date) -lt $nextStart) {
      if (Test-Paused) {
        Write-LauncherLog 'pause detected while waiting; launcher standing down'
        Write-Status 'paused' $waveNumber 0 $PausePath
        return
      }
      if ((Get-Date) -ge $StopAt) { break }
      Start-Sleep -Seconds 30
    }
  }

  Write-LauncherLog 'launcher finished'
  Write-Status 'stopped' $waveNumber $lastExitCode ('normal stop; last_wave_exit={0}' -f $lastExitCode)
  if ($Once -or $DryRun) { exit $lastExitCode }
}
finally {
  Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
  if ($ownsMutex) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
