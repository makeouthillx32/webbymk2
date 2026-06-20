---
type: vault-config
date: 2026-06-02
tags: [claude, vault, config, unaxis]
ai-first: true
---

# _CLAUDE.md — UNAXIS Vault Operating Manual

## For future Claude
> This file overrides all skill defaults for this vault. Read it first every session. The Obsidian vault root is the entire webbymk2 repo — so the MCP can read both documentation notes (vault/) and source code (src/). Notes go in vault/, source stays in src/.

---

## Vault Architecture

The Obsidian vault root is `Z:\WEBSITES\webbymk2\` — the entire project repo. The MCP serves everything from here:

- **`vault/`** — documentation notes, dev logs, architecture decisions, session logs
- **`src/ink/`** — TUI source code (readable via MCP — use for cross-referencing fixes)
- **`src/`** — all Next.js app source

### MCP connection
- Plugin: **vault-as-mcp** (ebullient), port `8765`, `127.0.0.1`
- MCP root = `Z:\WEBSITES\webbymk2\` — paths are relative to this
- `vault/TUI/note.md` for docs, `src/ink/components/Box.tsx` for source

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
read_multiple_notes(["vault/_CODEX.md", "vault/CRITICAL_FACTS.md", "vault/Home.md"])
```

To read source alongside docs:
```
read_note("src/ink/components/AlternateScreen.tsx")
search_notes(text="flex-shrink", folder="vault/TUI")
```

---

## Writing Rules

1. Documentation notes go in `vault/` — never create notes in `src/`
2. Daily logs go in `vault/Logs/YYYY-MM-DD.md` — append-only
3. Source file references use plain paths: `src/ink/components/AlternateScreen.tsx`
4. Propagate every note write to `vault/Logs/YYYY-MM-DD.md` and `vault/Home.md`
5. Surgical edits: `append_to_note` with `heading=` before full `update_note`

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
Invoke **obsidian-second-brain** (UNAXIS Edition) — correct MCP tool names, vault/ prefix, 44 commands including `/obsidian-compact`. Also load and follow the **unaxis-operator** skill for all TUI, dev container, and diagnostic operations (using only `unaxis` commands directly).

## Agent Companions
- **Codex**: When the active agent is Codex, read `vault/_CODEX.md` first for Codex-specific rules and overlays.
- **Antigravity**: When the active agent is Antigravity, read `_ANTIGRAVITY.md` first for Antigravity-specific rules and overlays.
- `_CLAUDE.md` remains the shared vault contract.
