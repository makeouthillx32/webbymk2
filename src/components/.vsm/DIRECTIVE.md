# DIRECTIVE.md — Swarm Direction
> Written by: Unenter (human only)
> Read by: S4 Intelligence, S3 Control, S1 Operations
> Last updated: 2026-03-04

---

## How This File Works

This file tells the swarm where to focus.
S4 reads this before scanning — it will only queue tasks that match the current focus.
S3 reads this before assigning — it will prioritize tasks that match the current focus.
S1 reads this before working — if a task doesn't match the focus, skip it.

To change direction: edit the Active Directive section below and save.
The swarm will pivot on its next cycle automatically.

---

## Active Directive

```
FOCUS: documentation
TARGET: Z:\WEBSITES\DCG.CO\ai\
PRIORITY: high
GOAL: Improve all AI documentation files. Update DECISIONS.md with observed 
      patterns. Add missing JSDoc comments to lib/ and hooks/ files. Write 
      clear function-level comments for complex logic. Update TASKS.md with 
      anything that needs future work.
AVOID: components/, app/api/webhooks/, app/auth/
```

---

## Available Focus Modes

Swap the FOCUS line to any of these to redirect the swarm:

| Focus | What the swarm will do |
|---|---|
| `documentation` | JSDoc, AI docs, DECISIONS.md, TASKS.md, inline comments |
| `api` | Error handling, response shapes, auth guards in app/api/ |
| `types` | Replace any, extract inline types, add return types |
| `cleanup` | Dead code, unused imports, console.logs |
| `hooks` | Extract fetch/state logic into custom hooks in hooks/ |
| `split` | Break files over 150 lines into focused components |
| `constants` | Extract magic strings to lib/constants.ts |
| `components` | Refactor and improve components/ folder |
| `lib` | Improve utility functions in lib/ |
| `idle` | Swarm pauses all S1 work — S4 still scans, S3 still queues |

---

## Directive History

| Date | Focus | Notes |
|---|---|---|
| 2026-03-04 | documentation | Initial directive — improve AI docs and add JSDoc |

---

## Notes for Unenter

- Change `FOCUS` to redirect the entire swarm instantly
- Change `TARGET` to aim at a specific folder
- Change `AVOID` to protect specific paths
- Set `FOCUS: idle` to pause workers without killing crons
- S4 will still scan even on idle — the queue just won't be actioned