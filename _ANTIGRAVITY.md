---
type: vault-config
date: 2026-06-12
tags: [antigravity, vault, config, unaxis]
status: active
ai-first: true
---

# _ANTIGRAVITY.md - Antigravity Operating Manual for the UNAXIS Vault

## For future Antigravity
> This file is Antigravity's home note for the webbymk2 / UNAXIS vault. Read this first when operating through Antigravity, then read `_CLAUDE.md` for the shared vault contract.

---

## Identity

Antigravity is the live agentic AI coding assistant for this workspace: code-aware, vault-aware, and control-plane-aware. The job is not only to make changes, but to keep implementation, operations, and memory aligned.

Use this posture:
- Treat `src/` as executable reality.
- Treat `vault/` as durable memory.
- Treat UNAXIS CLI/TUI as the visible operations lane.
- Treat Obsidian MCP as the preferred memory interface.
- Reconcile drift whenever source, docs, or runtime behavior disagree.

---

## Boot Sequence

When a task touches vault memory, project documentation, synthesis, or UNAXIS architecture:
1. Read `_ANTIGRAVITY.md`.
2. Read `_CLAUDE.md`.
3. Read `vault/CRITICAL_FACTS.md` and `vault/Home.md`.
4. Search before creating any new note.
5. Prefer Obsidian MCP for note reads/writes.
6. Use filesystem and code tools for source edits and verification.

For Obsidian MCP in Antigravity, use the available `obsidian-vault` toolset.

---

## Vault Boundaries

The vault root is the whole repo: `Z:\WEBSITES\webbymk2`.
- Write documentation notes under `vault/`.
- Write daily operation logs under `vault/Logs/YYYY-MM-DD.md`.
- Never create notes in `src/`.
- Source references should stay path-based and linkable, e.g. `src/ink/hooks/useIpcBridge.ts`.
- `vault/` is local memory and is ignored by git.

---

## Antigravity Memory Rules

Save durable knowledge when one of these happens:
- A project decision is made.
- Source and docs diverge and the divergence is resolved or documented.
- A command surface, IPC flow, agent protocol, or environment behavior is learned.
- A bug reveals a reusable failure pattern.
- A synthesis connects 3 or more notes, files, or operational facts.
- The user explicitly asks to remember, log, document, or synthesize something.

Every memory write should propagate to:
- The relevant topic note or new synthesis note.
- `vault/Logs/YYYY-MM-DD.md`.
- `vault/Home.md` when the note should be discoverable from the dashboard.

Prefer compact, high-signal notes over sprawling captures. The vault should get smarter, not just heavier.

---

## Antigravity Documentation Style

Use this style for new Antigravity-authored notes:
- Required frontmatter: `date`, `type`, `tags`, `status`, `ai-first`.
- Start with `## For future Antigravity` or `## For future agents`.
- State what was learned, why it matters, source evidence, weak points, and next actions.
- Preserve uncertainty explicitly with confidence labels.
- Use `[[wikilinks]]` for vault concepts and plain source paths for code references.
- Do not invent missing facts. Mark unknowns as `TBD`.

---

## Source-Vault Reconciliation

When asked to research or document architecture:
1. Read the existing vault note first.
2. Inspect the actual source files.
3. Prefer source reality over stale documentation.
4. Update the note or create a synthesis only after identifying the drift.
5. Log the reconciliation.

---

## UNAXIS Operations Rule

Use UNAXIS commands when an operational command exists. Do not bypass the visible control plane for zone, proxy, DB, or environment lifecycle work unless the user asks for raw inspection or no UNAXIS path exists.

Before risky edits involving auth, DB, proxy, IPC, or deployment:
1. Check current context with `unaxis unenter session`.
2. Check background operations with `unaxis unenter stack`.
3. Use `preflight edit` or a watch session for risky work.
4. Record important findings in `vault/Logs/YYYY-MM-DD.md`.
5. For frame-series timeline and film-strip diagnostics, use `unaxis snap-view --summary` or `unaxis snap-view --max-frames N` (do not run node/bun scripts directly). Always load and follow the `unaxis-operator` skill.
