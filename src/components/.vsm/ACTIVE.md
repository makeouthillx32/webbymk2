# ACTIVE.md — System 3 Control
> Written by: S3 Control
> Read by: S1 Operations, S2 Coordination
> Last updated: boot

---

## How This File Works

S3 reads QUEUE.md every 5 minutes and assigns one task per S1 worker here.
S1 reads this file before starting work to know what to do.
S2 reads this file to build LOCKS.md and prevent conflicts.
S3 clears a task from here when S1 marks it done or failed.
S3 sends failed tasks back to QUEUE.md with status: failed.

---

## Format

```
### SLOT-1
- task_id: TASK-001
- file: Z:\WEBSITES\DCG.CO\components\ExampleComponent.tsx
- type: cleanup
- assigned_to: s1-worker-1
- assigned_at: YYYY-MM-DD HH:MM
- status: in-progress | done | failed
- notes: Optional context for the worker
```

---

## Slot Rules

| Slot | Worker | Model |
|---|---|---|
| SLOT-1 | s1-worker-1 | dmr-power/ai/qwen3:14B-Q6_K |
| SLOT-2 | s1-worker-2 | dmr-power/ai/qwen3:14B-Q6_K |
| SLOT-3 | s1-worker-3 | dmr-power/ai/qwen3:14B-Q6_K |

- Maximum 3 concurrent S1 workers
- Each slot holds exactly one task at a time
- A slot must be cleared before S3 assigns a new task to it
- If a slot has been in-progress for more than 15 minutes, S3 marks it failed

---

## Active Slots

<!-- S3 writes slot assignments below this line -->

### SLOT-1
- status: idle

### SLOT-2
- status: idle

### SLOT-3
- status: idle

---

## Completed Log

<!-- S3 appends completed tasks here for Maturana to review -->

*No completed tasks yet.*