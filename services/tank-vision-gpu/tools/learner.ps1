# Start, stop or check the AI-mode learner (tools/live_learner.py) ON THE HOST.
#
# THE LEARNER NORMALLY RUNS AS A CONTAINER: the compose service
# tank-vision-learner (unt_tank_learner), which restarts itself and comes back
# with Docker. Use this script only for development, and stop the container
# first -- both write services/tank-vision-gpu/out and would fight over it:
#
#   docker stop unt_tank_learner
#   docker compose -p unenter up -d --no-deps tank-vision-learner   # put it back
#
#   powershell -File tools\learner.ps1 start
#   powershell -File tools\learner.ps1 stop
#   powershell -File tools\learner.ps1 status
#
# It learns only while the Tank director is in AI (auto) mode, so it is safe to
# leave running. Started below normal priority: live Tank work and games win.
param([ValidateSet('start', 'stop', 'status')][string]$Action = 'status')

$dir = Split-Path -Parent $PSScriptRoot
$log = Join-Path $dir 'out\logs\live-learner.log'

function Get-Learner {
    Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*tools\live_learner.py*' -and $_.Name -ne 'cmd.exe' }
}

switch ($Action) {
    'start' {
        if (Get-Learner) { 'Learner is already running.'; break }
        New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
        # The venv python.exe is a launcher; the real worker is its child and does not
        # keep the priority it asks for itself, so the whole tree starts below normal.
        Start-Process -FilePath 'cmd.exe' -WorkingDirectory $dir -WindowStyle Hidden -ArgumentList '/c',
            "start `"tank-learner`" /b /belownormal `".venv\Scripts\python.exe`" -u tools\live_learner.py >> out\logs\live-learner.log 2>&1"
        Start-Sleep -Seconds 3
        if (Get-Learner) { "Learner started. Log: $log" } else { "Learner did not start; see $log" }
    }
    'stop' {
        $procs = Get-Learner
        if (-not $procs) { 'Learner is not running.'; break }
        $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        # Killing docker exec leaves its ffmpeg running inside MediaMTX; end those too.
        docker exec unt_mediamtx pkill -f 'user_agent tank-learner' 2>$null
        'Learner stopped.'
    }
    'status' {
        $procs = Get-Learner
        if ($procs) {
            $procs | ForEach-Object { "running: pid $($_.ProcessId) $($_.Name) priority $((Get-Process -Id $_.ProcessId).PriorityClass)" }
        } else { 'Learner is not running.' }
        $status = Join-Path $dir 'out\live\status.json'
        if (Test-Path $status) { Get-Content $status -Raw }
    }
}
