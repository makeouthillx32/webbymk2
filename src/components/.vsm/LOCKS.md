# LOCKS.md — System 2 Coordination
> Written by: S2 Coordination
> Read by: ALL agents before touching any file
> Last updated: boot

---

## How This File Works

S2 reads ACTIVE.md every 3 minutes and writes a lock entry for every file
currently being worked on by an S1 worker.
Every agent in the system MUST read this file before opening any source file.
If a file appears in the Active Locks section, it is off limits — do not touch it.
S2 removes a lock when S1 marks the task done or failed in ACTIVE.md.
If a lock is older than 20 minutes it is considered stale and S2 removes it.

---

## Format

```
### LOCK-001
- file: Z:\WEBSITES\DCG.CO\components\ExampleComponent.tsx
- locked_by: s1-worker-1
- locked_at: YYYY-MM-DD HH:MM
- task_id: TASK-001
- expires_at: YYYY-MM-DD HH:MM (20 min after locked_at)
```

---

## Rules

| Rule | Detail |
|---|---|
| Hard lock | No other agent may open a locked file for any reason |
| Stale lock | Any lock older than 20 minutes is removed by S2 automatically |
| Conflict | If S2 detects two slots assigned to the same file, it clears the lower priority slot |
| Emergency | If LOCKS.md cannot be read, all S1 workers must stop immediately |

---

## Lock Precedence

If two tasks target the same file:
1. Higher priority task (from QUEUE.md) wins
2. Earlier assigned_at timestamp wins
3. Lower slot number wins (SLOT-1 > SLOT-2 > SLOT-3)

---

## Active Locks

<!-- S2 writes locks below this line -->
<!-- ALL agents must check here before touching any file -->

*No active locks. System is idle.*

---

## Conflict Log

<!-- S2 appends conflicts here for Maturana to review -->

*No conflicts recorded.*