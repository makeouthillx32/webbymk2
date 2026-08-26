# Docs swarm durable-state schema

State lives in Obsidian under `vault/Swarm/`. The orchestrator is the sole writer. Research
prongs return proposals directly to it and never coordinate by editing shared Markdown.

```text
vault/Swarm/
|-- STATE.md
|-- BACKLOG.md
|-- CONTEXT.md
`-- Waves/
    `-- wave-NNN.md
```

The external hard-stop marker is `swarm-orchestration/PAUSE`. The state note also has a
`paused` flag. There is no Markdown deploy lock because only one process can deploy and the
launcher itself is a singleton.

## STATE.md

Required frontmatter:

```yaml
---
date: 2026-06-21
type: swarm-state
tags: [unaxis, docs, swarm, operations]
status: active
ai-first: true
paused: false
project_slug: unenter
tui_target: dev
docs_zone: docs
docs_src: src/zones/docs
docs_app: zones/docs/src/app
docs_url: https://docs.unenter.live
preview_fallback_authorized: false
wave: 0
prong_cap: 3
session_minutes: 270
updated: 2026-06-21T00:00:00-07:00
---
```

The body records the last terminal wave result and the next recommended action. Only the
orchestrator changes `wave`, `updated`, or status text. A human may change `paused`,
`prong_cap`, and `preview_fallback_authorized`.

## BACKLOG.md

One line per bounded unit:

```text
- id: docs-001 | priority: 1 | status: todo | wave: - | title: Landing and information architecture | scope: src/zones/docs + zones/docs/src/app
```

Allowed states: `todo`, `in-progress`, `review`, `done`, `blocked`. The orchestrator selects
and updates units serially. Every non-todo state includes a wave number; blocked units also
include evidence and a next action.

## CONTEXT.md

Contains stable doctrine only: audience, information architecture, writing voice, source of
truth, scope boundary, release behavior, and dated decisions. Volatile progress belongs in
STATE or wave notes.

## Waves/wave-NNN.md

One append-oriented audit note per wave, with mandatory frontmatter and these sections:

- `For future agents`
- `Selected units`
- `Research lanes`
- `Source changes`
- `Validation and release evidence`
- `Result and next wave`

The orchestrator creates and closes the note. Prongs never append to it.

