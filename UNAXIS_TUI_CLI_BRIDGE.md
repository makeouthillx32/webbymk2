# UNAXIS TUI-Attached CLI Bridge

## Decision

UNAXIS does not need a separate daemon or headless control service right now.

The TUI is the control plane. Running `unaxis` opens the TUI. Running
`unaxis <command>` sends a command to the already-running TUI through local IPC.
If the TUI is not running, operational CLI commands fail fast and tell the
caller to start `unaxis`.

This keeps one source of truth for state, stack output, zone actions, dev mode,
proxy awareness, and user-visible feedback.

## Mental Model

```text
human / agent / script
        |
        |  unaxis <args>
        v
local CLI shim
        |
        |  localhost IPC
        v
running UNAXIS TUI
        |
        |  existing TUI action registry / stack ops / queues
        v
Docker, zones, proxy, NPM, DB, infra
```

The CLI is not bypassing the TUI. It is another input lane into the same TUI
runtime.

## Current First Pass

The current implementation starts a TCP IPC server from `src/ink/App.tsx` on
`127.0.0.1:50505`.

Current commands:

```bash
unaxis status
unaxis session
unaxis list
unaxis zones
unaxis stack
unaxis zone <name> status
unaxis zone <name> dev start
unaxis zone <name> dev stop
unaxis zone <name> dev restart
unaxis dev <zone>
unaxis restart <zone>
```

Current behavior:

- `unaxis` without arguments opens the TUI.
- `unaxis <known-command>` forwards the command to the running TUI.
- If the TUI is not running, the CLI exits non-zero.
- Output is plain TUI-style lines.

## Product Rule

For agents, avoid hidden state and toggle behavior.

Human shortcuts are fine:

```bash
unaxis dev blog
```

Agent-safe commands should be explicit:

```bash
unaxis zone blog dev start
unaxis zone blog dev stop
unaxis zone blog dev restart
```

## Intended Session Flow

Agents should begin with a session check:

```bash
unaxis status
```

If that succeeds, the agent can ask for a fuller snapshot:

```bash
unaxis session
```

Example output:

```text
✓ UNAXIS TUI is running
cwd: Z:\WEBSITES\webbymk2
mode: dev
view: zones
stack: 2 running, 4 done
zones: 9
```

If the TUI is not running:

```text
✗ UNAXIS TUI is not running
  start it with: unaxis
```

## Next Command Shape

Keep the short aliases, but add the safer long form.

Session:

```bash
unaxis status
unaxis session
unaxis stack
unaxis jobs
```

Zones:

```bash
unaxis zones
unaxis zone <name> status
unaxis zone <name> logs
unaxis zone <name> dev start
unaxis zone <name> dev stop
unaxis zone <name> dev restart
```

Proxy:

```bash
unaxis proxy status
unaxis proxy restart
unaxis proxy sync
```

Navigation, optional but useful:

```bash
unaxis open zones
unaxis open zone <name>
unaxis open stack
unaxis open db
unaxis open infra
```

Navigation commands should only change the visible TUI state. Operational
commands should create stack operations.

## Stack Integration

Every operational CLI command should create or reuse a visible TUI stack item.

Example:

```bash
unaxis zone blog dev restart
```

Should create a TUI stack entry like:

```text
CLI  Dev Restart  Blog
```

And the CLI should stream the same lines that are appended to that stack op:

```text
• queued CLI dev restart for Blog
• stopping dev-blog
• starting dev-blog
• streaming dev logs
✓ ready
```

This matters because agent actions should remain visible to the human already
watching the TUI.

## Exit Codes

Recommended contract:

```text
0  success
1  command failed
2  invalid command or arguments
3  TUI is not running
4  timeout
```

The current first pass only returns success/failure. Expanding this will make
agent behavior more reliable.

## Output Contract

Default output should stay human/TUI-style:

```text
✓ Blog dev container running
```

Add `--json` later for agents that need structured output:

```bash
unaxis zone blog status --json
```

Example:

```json
{
  "ok": true,
  "zone": "blog",
  "dev": {
    "running": true,
    "container": "dev-blog"
  }
}
```

Do not make JSON the default. The default should still feel like UNAXIS.

## Implementation Direction

The first pass currently keeps IPC handlers inline in `App.tsx`. That is fine
for proving the bridge, but the next pass should extract the command handling
into a small TUI-owned command layer:

```text
src/ink/ipc-server.ts        socket server
src/ink/ipc-client.ts        CLI-side sender
src/ink/ipc-commands.ts      command parser + routing
src/ink/tui-actions.ts       typed actions bound to App hooks/state
```

The important part is that commands still bind to TUI-owned capabilities:

- `runDevModeOp`
- `runOp`
- `runOpQueued`
- `runCreateZone`
- `openLogs`
- navigation setters
- current zone/view/stack state

The CLI should not import and execute infrastructure functions directly when
there is already a TUI action for that behavior.

## Near-Term Implementation Plan

1. Add a command envelope to IPC.

   Instead of sending only a raw string, send metadata:

   ```json
   {
     "id": "cli_20260517_001",
     "argv": ["zone", "blog", "dev", "restart"],
     "actor": "cli"
   }
   ```

   Keep support for the raw line protocol during migration.

2. Add `session`, `zones`, and `zone <name> status`.

   These are read-only and low risk.

3. Replace agent-facing toggles with explicit dev commands.

   Keep `unaxis dev <zone>` as a human alias.

4. Route mutating commands through stack ops.

   CLI commands should be visible in the TUI stack and should stream the same
   operation lines back to the caller.

5. Add better failure codes.

   Especially distinguish "TUI is not running" from "the TUI ran the command
   and the command failed."

6. Add `--json` only after the plain line protocol is stable.

## Agent Use Cases

The CLI bridge becomes most useful when it gives agents safe rituals before
large edits. Agents should be able to ask UNAXIS for context, create a rollback
point, work in dev mode, inspect logs, and report exactly what changed.

### Agent Start Ritual

Before touching code, an agent should be able to run:

```bash
unaxis session
unaxis stack
unaxis zones
```

That gives the agent:

- whether the TUI is alive
- what view the human is currently in
- whether operations are already running
- what zones exist
- whether dev containers are already live

### Safe Big Edit Ritual

For a risky app/database edit, the ideal agent flow is:

```bash
unaxis session
unaxis db backup --reason "before auth role refactor"
unaxis zone shop dev start
unaxis zone shop logs --tail 120
```

Then the agent edits files, runs tests/builds, restarts dev mode if needed, and
ends with:

```bash
unaxis zone shop status
unaxis stack
```

The DB backup should create a visible stack item in the TUI, using the existing
`backupDatabase()` path. The CLI should stream the same lines back to the agent.

### Dev Container Workbench

Agents should be able to use UNAXIS as the project workbench:

```bash
unaxis zone blog dev start
unaxis zone blog logs --tail 80
unaxis zone blog dev restart
unaxis zone blog dev stop
```

Recommended behavior:

- `dev start` should be idempotent. If it is already running, return success.
- `dev restart` should hard stop, start fresh, then stream readiness lines.
- `dev stop` should clean up dev route/NPM host/container, like TUI dismiss.
- `logs --tail N` should not start an infinite stream by default.
- `logs --follow --timeout 30s` can be added later for bounded streaming.

### Preflight Command

Agents have one high-level preflight command that composes the existing TUI
session, watch, DB backup, and zone dev commands:

```bash
unaxis preflight edit --zone shop --db-backup --dev --watch --label "codex auth refactor"
```

Implemented shape:

```bash
unaxis preflight edit --zone <zone> [--db-backup] [--dev] [--watch] [--label <text>]
```

It does:

1. Confirm TUI is running.
2. Confirm stack is not already busy with conflicting lifecycle work.
3. Start a watch session if `--watch` is passed and no watch is active.
4. Capture a session/stack/zone snapshot.
5. Create a DB backup if requested.
6. Start the requested dev container if it is not already running.
7. Print the zone URL/log hints.

If a watch session is active or created, preflight records timeline events for
the preflight lifecycle, snapshot, DB backup, and dev-start attempt.

Example output:

```text
UNAXIS preflight edit
  zone  : shop (Shop)
  domain: shop.unenter.live
✓ TUI session attached
✓ watch started: 20260517_143000_codex-auth-refactor
✓ stack clear
✓ snapshot recorded: preflight-edit-...
• DB backup requested
✓ dev container already running for Shop
✓ preflight ready
  edit zone : shop
  live URL  : https://shop.unenter.live
  dev logs  : docker logs -f dev-shop
```

### Recovery Command

Agents should also have an obvious recovery path:

```bash
unaxis recover last
unaxis db backups
unaxis db restore <backup-id>
```

Restore should not be implemented casually. It should require either an
interactive confirmation in the TUI or an explicit flag:

```bash
unaxis db restore <backup-id> --confirm
```

### Logs For Agents

Agents need short log snapshots more often than live log streams.

Useful commands:

```bash
unaxis logs proxy --tail 120
unaxis logs db --tail 120
unaxis zone blog logs --tail 120
unaxis zone blog dev logs --tail 120
```

The default should return and exit. Live follow mode should be explicit:

```bash
unaxis zone blog logs --follow --timeout 30s
```

### Agent Session Naming

For multi-agent work, support a label:

```bash
unaxis agent begin "codex auth refactor"
unaxis agent note "about to update RLS policies"
unaxis agent end
```

This could show in the TUI stack/header as:

```text
agent: codex auth refactor
```

The goal is not authentication. The goal is human visibility: when the TUI is
open, the human can see what external agent is currently doing.

### Preferred Agent Workflow

If I were using this as an agent, the ideal loop would be:

```bash
unaxis session
unaxis preflight edit --zone shop --db-backup --dev
# edit files
# run local tests/builds
unaxis zone shop dev restart
unaxis zone shop dev logs --tail 120
unaxis stack
```

Then I would report:

- what backup was created
- what zone/dev container was used
- what tests/builds passed
- what logs looked suspicious
- what cleanup is still running in the TUI stack

## Watchdog And Session Recording

The next major upgrade should be a text-first watchdog layer around agent runs.
This is different from normal logs: normal logs show what happened, while the
watchdog builds a compact, replayable session record that explains what the
agent saw before, during, and after its work.

### Why

Agents often need context after the fact:

- what was running before the command
- whether the TUI already had errors
- what stack item changed
- what Docker logs looked like near the failure
- what files/zone/db were involved
- whether a DB backup exists before risky edits

Instead of making every agent manually collect that context, UNAXIS can record
it as a session bundle.

### Command Shape

```bash
unaxis watch begin --label "codex auth refactor" --zone shop --db-backup
unaxis watch status
unaxis watch note "about to update auth middleware"
unaxis watch snapshot --reason "before migration"
unaxis watch end
```

Shortcut for common agent work:

```bash
unaxis preflight edit --zone shop --db-backup --watch
```

That would:

1. Start a watchdog session.
2. Capture `unaxis session`.
3. Capture `unaxis stack`.
4. Capture zone status.
5. Capture recent TUI/error logs.
6. Create a DB backup if requested.
7. Start dev mode if requested.
8. Record every later command result under the same session id.

### Session Bundle

Store everything as plain text/NDJSON under a predictable folder:

```text
logs/agent-sessions/
  2026-05-17_1430_codex-auth-refactor/
    manifest.json
    timeline.ndjson
    preflight.txt
    tui-tail.txt
    stack-before.txt
    stack-after.txt
    docker/
      proxy-tail.txt
      db-tail.txt
      shop-tail.txt
      dev-shop-tail.txt
    backups.txt
    summary.md
```

The bundle should be optimized for agents:

- plain text
- append-only timeline
- small bounded log tails by default
- no binary screenshots unless explicitly requested
- secrets redacted before writing
- paths and command ids included

### Timeline Format

Use newline-delimited JSON so it is easy to append, stream, grep, and compress:

```json
{"ts":"2026-05-17T21:30:00.000Z","type":"session.start","label":"codex auth refactor","zone":"shop"}
{"ts":"2026-05-17T21:30:02.000Z","type":"command","argv":["zone","shop","dev","start"],"exitCode":0}
{"ts":"2026-05-17T21:30:14.000Z","type":"stack","state":"live","title":"Dev  Shop"}
{"ts":"2026-05-17T21:32:01.000Z","type":"error","source":"dev-shop","line":"TypeError: ..."}
```

This gives agents a compact memory trail without forcing the TUI to invent a
database for logs.

### Watchdog Modes

Support a few modes instead of one giant behavior:

```bash
unaxis watch begin --mode light
unaxis watch begin --mode dev
unaxis watch begin --mode risky
```

Suggested behavior:

```text
light  session + stack + TUI log tail
dev    light + zone logs + dev container logs
risky  dev + DB backup + proxy logs + before/after snapshots
```

Agents can pick the mode, but `preflight edit --db-backup --watch` should map
to `risky`.

### Error Watchdog

The watchdog should be able to watch for high-signal error patterns while an
agent works:

```bash
unaxis watch errors --zone shop --timeout 60s
```

Patterns:

- `error`
- `exception`
- `failed`
- `traceback`
- `unhandled`
- `EADDRINUSE`
- `ECONNREFUSED`
- `502`
- `500`
- Next.js compile/runtime errors

Output should be compact:

```text
✗ 3 error lines captured
  dev-shop: TypeError: Cannot read properties of undefined
  proxy: upstream dev-shop:3000 refused connection
  tui: start failed (exit 1)
```

### Auto Snapshot Triggers

For risky commands, UNAXIS can automatically snapshot before doing damage:

```bash
unaxis zone shop delete --snapshot-before
unaxis db migrate --backup-before
unaxis proxy sync --snapshot-before
```

For now, automatic DB backup should only trigger when explicitly requested by
the command or preflight mode. Do not silently back up on every command; that
will create noise and slow down normal work.

### Compression And Summaries

At the end of a watchdog run:

```bash
unaxis watch end --summarize
```

Should create `summary.md`:

```text
# Agent Session Summary

Label: codex auth refactor
Zone: shop
Started: ...
Ended: ...

Backups:
- dump_...

Commands:
- zone shop dev start: ok
- zone shop dev restart: ok

Errors:
- dev-shop TypeError ...

Final State:
- stack: 1 live, 2 done
- dev-shop: running
```

Keep raw logs in the bundle, but make the summary small enough to paste into a
future agent session.

### TUI Visibility

When a watchdog is active, the TUI should show a small status line:

```text
watch  ● codex auth refactor  ·  recording  ·  risky
```

Every CLI-triggered operation should include the active watch id in the stack
item metadata. The human should be able to see that an outside agent is working
and recording context.

## Non-Goals For Now

- No background daemon.
- No separate `unaxis serve`.
- No standalone headless control plane.
- No agent-only backend that bypasses TUI state.
- No network-exposed API.

The bridge should remain localhost-only and TUI-attached.
