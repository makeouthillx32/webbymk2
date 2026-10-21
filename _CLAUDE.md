---
type: vault-config
date: 2026-06-02
tags: [claude, vault, config, unaxis]
ai-first: true
---

# _CLAUDE.md — UNAXIS Vault Operating Manual

## For future Claude
> This file overrides all skill defaults for this vault. Read it first every session. Since 2026-10-21 the vault is worked through **OpenKnowledge** (MCP tools `mcp__open-knowledge__*`, skill **ok-second-brain**), not the Obsidian MCP plugin. Notes go in vault/, source stays in src/.

---

## Vault Architecture

OpenKnowledge project root: `Z:\WEBSITES\webbymk2\` (`.ok/config.yml`), content folder **`vault/`**. The Obsidian app can still open the same folder, but agents don't use its plugin anymore.

- **`vault/`** — documentation notes, dev logs, architecture decisions, session logs
- **`src/`** — all Next.js app source (not vault content — read with normal file tools)
- UNAXIS (TUI/CLI) source is **not** here since 2026-10-19: its own repo at `Z:\UNAXIS\unaxis` (file tools)

### How to read and write vault notes (OpenKnowledge MCP)
- **Never** read or write vault markdown with native file tools (Read/Write/Edit/Bash/sed/printf). They bypass OpenKnowledge's live sync and history; it records them as "external writes" to reconcile.
- `exec` (read-only bash: cat/ls/grep/find/head/tail…): pass `cwd: "Z:\WEBSITES\webbymk2\vault"`, paths relative to it — `cat Logs/2026-10-21.md`.
- `search`: ranked full-text (+ semantic) across the vault; `intent: "omnibar"` for titles/paths. Ranking favours established pages — for a specific note, also try omnibar or `exec grep`.
- `write` / `edit` / `links`: pass `cwd: "Z:\WEBSITES\webbymk2"` and doc paths relative to `vault/` with no extension and no `vault/` prefix — `Logs/2026-10-21`. Append with `write` `position: "append"`; surgical changes with `edit` find/replace; metadata with `edit` frontmatter. Give each write/edit a one-line `summary`.
- `links` kinds `backlinks`/`forward`/`orphans`/`hubs`/`dead` for graph work.

---

## Vault Folders

```
vault/
├── _CODEX.md           Codex-specific operating manual
├── CRITICAL_FACTS.md    Active IPs, ports, timezone, stack version
├── SOUL.md              System identity (Antigravity persona)
├── Home.md              Dashboard and index
├── TUI/                 Ink engine docs, bug fixes, session logs
├── Architecture/        System design decisions
├── Project/             Release notes, roadmap, workflow
├── Core/                Supabase, auth, middleware fixes
├── Database/            DB instances, Kong, snapshot system
├── Docker/              Compose, zones, containers
├── Environments/        POWER and L0V3 node details
├── Logs/                Per-day operation logs (YYYY-MM-DD.md)
├── Brain/               Synthesized knowledge
└── boards/              Kanban boards
```

---

## Session Orientation

```
exec({ command: "cat CRITICAL_FACTS.md Home.md", cwd: "Z:\\WEBSITES\\webbymk2\\vault" })
search({ query: "flex-shrink", cwd: "Z:\\WEBSITES\\webbymk2" })
```
Site source (`src/…`) and TUI source (`Z:\UNAXIS\unaxis\src\ink\…`) are code, not vault content — use normal file tools.

---

## Writing Rules

1. Documentation notes go in `vault/` — never create notes in `src/`
2. Daily logs go in `vault/Logs/YYYY-MM-DD.md` — append-only
3. Source file references use plain paths: `src/app/layout.tsx`; for UNAXIS name the repo: `UNAXIS src/ink/components/AlternateScreen.tsx`
4. Propagate every note write to `vault/Logs/YYYY-MM-DD.md` and `vault/Home.md`
5. Surgical edits: `edit` find/replace or `write` append — never a whole-body `replace` when a paragraph changed

## Frontmatter required
```yaml
---
date: YYYY-MM-DD
type: dev-log | bug-fix | feature | decision | reference | session-log | log
tags: [relevant, tags]
status: active | resolved | complete | archived
ai-first: true
---
```

## Git
`vault/` is in `.gitignore` — logs and notes stay local, never commit.

## Skill
Invoke **ok-second-brain** for vault work (capturing sessions, ADRs, dossiers, ingest → research → canonical, audits) together with the project's **open-knowledge** skill (`.claude/skills/open-knowledge/`, the tool contract). The old **obsidian-second-brain** skill is retired for this vault. Also load and follow the **unaxis-operator** skill for all TUI, dev container, and diagnostic operations (using only `unaxis` commands directly).

Scheduled vault routines (morning / nightly / weekly review / health check / mail cert check) are local scheduled tasks that already use the OpenKnowledge tools and end with `RESULT: OK|SKIPPED|FAILED`.

## Agent Companions
- **Codex**: When the active agent is Codex, read `vault/_CODEX.md` first for Codex-specific rules and overlays.
- **Antigravity**: When the active agent is Antigravity, read `_ANTIGRAVITY.md` first for Antigravity-specific rules and overlays.
- `_CLAUDE.md` remains the shared vault contract.
