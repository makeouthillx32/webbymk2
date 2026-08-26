# UNAXIS docs overnight runner

This kit advances the existing `docs` zone (`docs.unenter.live`) in bounded overnight
waves. One Codex orchestrator is the only writer. It may use parallel read-only research
prongs, but it alone edits source, updates Obsidian state, and runs one UNAXIS build/deploy
per wave.

That single-writer rule is deliberate: Markdown claims are not atomic, parallel builds can
exhaust Docker, and this repository already contains unrelated dirty work that must be
preserved.

## Canonical files

| File | Purpose |
| --- | --- |
| `ORCHESTRATOR.md` | Live wave prompt and safety contract |
| `WORKER.md` | Read-only research-prong contract |
| `vault-state-schema.md` | Durable state format under `vault/Swarm/` |
| `launch-swarm.ps1` | PowerShell 5.1-safe launcher, timeout, logs, and morning stop |
| `stop-swarm.ps1` | Creates the pause marker and stops future waves |

The executable kit in this directory is canonical. Durable progress and decisions live in
Obsidian under `vault/Swarm/`.

## Current target

- Project slug: `unenter`
- UNAXIS control plane: development TUI (`--dev`)
- Zone: `docs`
- Public URL: `https://docs.unenter.live`
- Main source: `src/zones/docs/`
- App wrapper/routes: `zones/docs/src/app/`

`unaxis unenter zone docs build --bg --dev` is a full public ship: build, push,
force-recreate, and proxy reload. There is no second deploy command in the normal loop.

## Run safely

Dry-run one wave (read-only):

```powershell
.\launch-swarm.ps1 -Once -DryRun
```

Run live until the next 08:00 local time:

```powershell
.\launch-swarm.ps1
```

Run exactly one live wave:

```powershell
.\launch-swarm.ps1 -Once
```

Run continuously until paused, with a ten-minute recovery gap between completed waves:

```powershell
.\launch-swarm.ps1 -Continuous
```

Pause future waves:

```powershell
.\stop-swarm.ps1
```

Logs and status are written to `swarm-orchestration/logs/`. The launcher is a singleton;
a second copy exits instead of creating overlapping waves.

The headless Codex process runs with `danger-full-access` because the installed UNAXIS CLI
lives outside the repository and the dev TUI uses a localhost IPC listener that Codex's
Windows workspace sandbox hides. The orchestrator's docs-only source boundary, single
writer, single deployment, and hard stop are therefore the primary mutation controls.

## Guardrails

- Workers return proposals only. They do not write files, vault notes, or runtime state.
- The orchestrator edits only `src/zones/docs/**` and `zones/docs/src/app/**`.
- One background docs build is allowed per wave; no raw Docker lifecycle commands.
- The launcher stops at the next 08:00 local time, after three consecutive runner failures,
  or when `PAUSE`/`STATE.paused` is set. In `-Continuous` mode there is no clock stop; pause
  and the consecutive-failure cutoff remain active.
- Unknown facts remain explicit gaps. CLI facts are re-read from the installed CLI.
- No commits, pushes, production database changes, proxy edits, or global config changes.
