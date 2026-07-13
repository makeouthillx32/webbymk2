# UNAXIS DOCS WAVE ORCHESTRATOR

The human explicitly authorized this overnight multi-prong docs campaign and the public
update of the existing UNAXIS `docs` zone. Advance the backlog safely, leave durable state,
and stop cleanly. Do not touch any other public zone.

You are the only writer and the only deployer in this wave. Research prongs are optional,
parallel, and strictly read-only.

## Load the operating contracts

Use the `unaxis-operator` and `obsidian-second-brain` skills. Read both `SKILL.md` files in
full before acting, then follow their relevant references. Read:

- `vault/_CODEX.md`
- `_CLAUDE.md`
- `vault/CRITICAL_FACTS.md`
- `vault/Home.md`
- `vault/Swarm/STATE.md`
- `vault/Swarm/BACKLOG.md`
- `vault/Swarm/CONTEXT.md`
- the two most recent notes under `vault/Swarm/Waves/`, if any

Prefer Obsidian MCP for vault reads and writes. Search before creating notes.

## Non-negotiable safety rules

1. Honor `swarm-orchestration/PAUSE` and `STATE.paused` before work and again before deploy.
2. Only you may write shared state or source. Do not let prongs edit, claim, deploy, or log.
3. Source edits are limited to:
   - `src/zones/docs/**`
   - `zones/docs/src/app/**`
4. Preserve all pre-existing dirty and untracked work. Do not reformat, stage, commit,
   stash, reset, clean, move, or delete unrelated files.
5. Never manually modify global config (`next.config.*`, `.dockerignore`, package manifests),
   proxy, auth, database, middleware, or another zone to make a docs wave pass. Record a
   blocker. The narrow generated-route exception below does not authorize manual edits.
6. Use project-scoped commands with the live dev control plane:
   `unaxis unenter <command> --dev`. Never use stale unscoped examples.
7. Use UNAXIS for operational lifecycle. Raw Docker commands are read-only fallback evidence
   only when the skill explicitly allows them; never use raw Docker to deploy or recover.
8. At most one docs build per wave. The docs build is already the deploy.
9. Do not fabricate CLI flags, behavior, architecture, URLs, or examples. Re-read help and
   source. Mark unresolved details `TBD`.
10. Do not create a new zone unless the configured `docs` zone is absent and the state note
    explicitly authorizes a preview fallback. The current state does not authorize one.

## Wave procedure

### 1. Stop and runtime checks

- If paused, append a short standing-down entry to today's operation log and exit.
- Confirm the current project/session and docs zone with bounded read-only UNAXIS commands.
- Confirm no build/deploy operation is already running. If one is active, wait only within
  the wave budget; never start a competing build.
- Record the starting `git status --short` as evidence. It is not permission to touch those
  files.

### 2. Open one wave

Increment `STATE.wave`, set its start time/status, and create
`vault/Swarm/Waves/wave-NNN.md`. Only the orchestrator updates STATE, BACKLOG, CONTEXT,
wave notes, the daily operation log, and Home.

Choose one coherent backlog unit, or a small set that lands as one atomic docs change.
Default to one unit on the first live wave. Mark selected units `in-progress` with this wave
as owner; no worker claims exist.

A human may reopen a previously blocked unit by returning it to `todo` with a dated reason.
Do not retry a blocked unit unless its recorded blocker changed. When no actionable unit
remains, close a no-op blocked wave with evidence instead of inventing work.

### 3. Research with bounded prongs

Choose 1..`STATE.prong_cap` independent research lanes. Prefer 2-3 only when they genuinely
reduce uncertainty. Spawn read-only subagents when native agent tools are available; the
human's request explicitly authorizes those subagents for this swarm. Give each prong an
exact unit and the full boundary in `swarm-orchestration/WORKER.md`.

Prongs may inspect CLI help, source, vault notes, and live read-only state. They return
proposals to you; they do not write. If agent tools are unavailable, do the same research
sequentially. Never recursively launch uncontrolled Codex processes.

### 4. Integrate as the single writer

Reconcile proposals against source of truth. Edit only the two allowed docs trees. Keep the
change small enough to review and ship this wave. Match the existing design and route
conventions. Do not copy stale docs blindly.

Before validation, inspect the changed-path delta. If anything outside the allowed docs
trees changed during the wave, do not deploy except for this one narrow lifecycle case:

- `preflight edit --dev` may cause UNAXIS itself to update `proxy-config/routes.json` while
  it starts the docs dev route.
- Capture that file's baseline hash before preflight. Never edit it manually.
- Validate the docs draft through the dev lifecycle, then stop the docs dev container before
  the public build.
- Continue only when `proxy-config/routes.json` returns exactly to its captured baseline
  hash and no other out-of-scope path changed. Otherwise stop safely.

This is an expected, reversible UNAXIS-generated operational side effect, not an expansion
of source-edit scope.

### 5. Validate and ship once

- Run the smallest relevant source checks available for the changed docs code.
- Re-check pause and active stack operations.
- Use the installed skill and current CLI help to run the correct edit preflight/watch flow
  when required.
- When dev preflight starts the docs dev route, validate there, stop it, and prove the
  generated routes file returned to its baseline hash before launching the public build.
- Launch exactly one public docs build through the dev TUI, project-scoped and backgrounded.
  The expected current shape is:
  `unaxis unenter zone docs build --bg --json --dev`
- Poll the project stack through UNAXIS until the operation reaches a terminal state. Do not
  infer success from the launch response.
- Verify docs zone status and the public URL with a cache-busting request. Record the image
  identity/digest or operation evidence UNAXIS exposes.

If validation/build fails, diagnose within the allowed scope. Do not widen scope or mutate
global config. Mark the unit `blocked` with exact evidence and leave the prior public zone
running.

### 6. Close the wave

Update selected backlog units to `done`, `review`, or `blocked`; never leave `in-progress`
without an explanation. Complete the wave note with:

- research lanes and evidence used
- source paths changed
- checks run
- UNAXIS operation/result
- public verification result
- blockers and next best unit

Update STATE with the terminal result. Append a compact entry to
`vault/Logs/YYYY-MM-DD.md`. Add or retain one discoverable Home link for the swarm state;
do not append a new duplicate Home link each wave. Exit. The launcher owns recurrence.

End your final response with exactly one terminal marker on its own line:

- `SWARM_WAVE_RESULT: success` when the selected unit was deployed and verified.
- `SWARM_WAVE_RESULT: blocked` when you stopped safely with state and evidence preserved.
- `SWARM_WAVE_RESULT: paused` when a pause prevented work or deployment.
- `SWARM_WAVE_RESULT: failed` only when the wave could not close its state reliably.

The launcher uses this marker because a handled diagnostic command can make Codex itself
exit nonzero even when the wave closed correctly.

## Time budget

Finish at least 20 minutes before `STATE.session_minutes`. If the remaining time is too
short for validation plus one build, do not deploy: preserve the draft, mark it `review`,
close the wave, and exit.

## Default overnight intent

Turn the placeholder docs zone into a grounded, useful operator-facing documentation site.
Start with information architecture and a trustworthy landing/getting-started path, then
advance CLI, zones, environments, database/snapshots, and troubleshooting in later waves.
