# UNAXIS Agent Guardian for Windows

The standalone remote agent normally uses Docker's `restart: unless-stopped` policy. That handles process crashes and ordinary Docker restarts, but it cannot recover an agent container that was explicitly stopped, removed, or left in the rollback slot by an interrupted self-update.

The guardian closes that bootstrap gap from outside Docker:

- runs as `SYSTEM` at Windows startup and once per minute;
- waits harmlessly while Docker Desktop is unavailable;
- starts a stopped `unaxis_agent` container;
- restores `unaxis_agent_rollback` when an update preserved the old agent but did not install the replacement;
- recreates a missing agent with its persistent `unaxis_agent_data` volume;
- never restarts Docker, WSL, NPM, or application containers.

Run once from an elevated PowerShell prompt on the remote Windows host:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
./install-agent-guardian.ps1
```

After installation, verify the task and agent:

```powershell
Get-ScheduledTask -TaskName "UNAXIS Agent Guardian"
Get-Content "$env:ProgramData\UNAXIS\agent-guardian.log" -Tail 30
```

Once the agent is reachable again, use UNAXIS for all application-container and zone lifecycle operations.
