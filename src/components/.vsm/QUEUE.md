# QUEUE.md — System 4 Intelligence Queue
> Written by: S4 Intelligence
> Read by: S3 Control
> Last updated: boot

---

## How This File Works

S4 scans the codebase every 15 minutes and writes discovered tasks here.
S3 reads this file every 5 minutes and moves tasks to ACTIVE.md.
Tasks are removed from this file once S3 assigns them.
Tasks are added back if S1 fails to complete them.

---

## Format

Each task follows this exact format:

```
### TASK-001
- file: Z:\WEBSITES\DCG.CO\components\ExampleComponent.tsx
- type: cleanup | types | hooks | split | constants | api
- priority: high | medium | low
- reason: One sentence describing what needs fixing
- status: queued | assigned | failed
- added: YYYY-MM-DD HH:MM
```

---

## Priority Rules

| Priority | Meaning |
|---|---|
| high | Breaks functionality, causes errors, or blocks other tasks |
| medium | Improves quality, reduces technical debt |
| low | Nice to have, cosmetic improvement |

---

## Task Types

| Type | Description |
|---|---|
| cleanup | Remove dead code, unused imports, console.logs |
| types | Extract inline types, replace any, add return types |
| hooks | Extract fetch/state logic into custom hooks |
| split | Split files over 150 lines into smaller components |
| constants | Extract magic strings to lib/constants.ts |
| api | Fix error handling in API routes |

---

## Active Queue

<!-- S4 writes tasks below this line -->
<!-- S3 removes tasks from below this line when assigned -->

*Queue is empty. S4 will populate on next scan.*