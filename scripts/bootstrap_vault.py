import os
import shutil
import sys
import re
import argparse
from datetime import datetime

def bootstrap(vault_path, name, preset):
    print(f"[*] Starting vault bootstrap in: {vault_path}")
    print(f"[*] Preset: {preset}, Operator: {name}")

    # Standard directories
    dirs = [
        "wiki/entities",
        "wiki/concepts",
        "wiki/projects",
        "wiki/daily",
        "wiki/logs",
        "wiki/reviews",
        "wiki/tasks",
        "wiki/decisions",
        "raw/articles",
        "raw/transcripts",
        "raw/pdfs",
        "raw/videos",
        "boards",
        "templates",
        "Logs"
    ]

    for d in dirs:
        full_path = os.path.join(vault_path, d)
        os.makedirs(full_path, exist_ok=True)
        print(f"[+] Created directory: {full_path}")

    # 1. Create Templates
    create_templates(vault_path)

    # 2. Create Kanban Board
    create_kanban(vault_path)

    # 3. Reorganize and migrate existing files
    migrate_files(vault_path)

    print("[*] Bootstrap phase complete!")

def create_templates(vault_path):
    templates = {
        "templates/concept-template.md": """---
date: {{date}}
tags:
  - concept
status: active
related_projects: []
ai-first: true
---
# {{title}}

## For future Antigravity agents
> Brief 2-3 sentence summary of this concept for high-speed indexing and retrieval.

## Overview
Detailed description of the concept, framework, or architecture.

## Details
Additional design specifications, patterns, or requirements.

## References
- [[index]]
""",
        "templates/project-template.md": """---
date: {{date}}
tags:
  - project
status: planning
job: Personal
timeline:
  - fact: "status: planning"
    from: {{date}}
    until: present
    learned: {{date}}
ai-first: true
---
# Project: {{title}}

## For future Antigravity agents
> Summary of this project's goals, scope, and status.

## Current Backlog
- [ ] Implement initial prototype

## Architecture & Integration
Describe any core dependencies or integrations.

## History & Activity Log
- **{{date}}** - Project note initialized.
""",
        "templates/daily-template.md": """---
date: {{date}}
tags:
  - daily
mood: 5
energy: 5
ai-first: true
---
# Daily Note: {{date}}

## For future Antigravity agents
> Summary of today's key focuses, decisions, and system events.

## Focus Areas
- [ ] Focus 1

## Activity Log
- **08:00** - Session started.

## Decisions Made
- None yet.
""",
        "templates/decision-template.md": """---
date: {{date}}
tags:
  - decision-record
status: accepted
ai-first: true
---
# ADR: {{title}}

## For future Antigravity agents
> Context, proposed decision, and architectural consequences.

## Context
Provide technical context for the decision.

## Decision
What is the chosen design or architecture path?

## Consequences
What are the trade-offs, restrictions, or capabilities unlocked?
"""
    }

    for path, content in templates.items():
        full_path = os.path.join(vault_path, path)
        if not os.path.exists(full_path):
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(content.replace("{{date}}", datetime.now().strftime("%Y-%m-%d")))
            print(f"[+] Wrote template: {full_path}")

def create_kanban(vault_path):
    kanban_content = """---
kanban-plugin: board
tags:
  - board
---

## 📥 Backlog

- [ ] 🟢 **Bootstrap Alive Vault** · @{2026-06-01}
	Initialize Operating Manual, index, SOUL, and crons. [[bootstrap_vault.py]]
- [ ] 🔴 **Document Core Next & Multi-Zones** · @{2026-06-01}
	Complete core mothership and zones compiler specification notes. [[unaxis-orchestration]]


## 📋 This Week



## 🔨 In Progress

- [ ] 🟡 **Build Antigravity Powerhouse** · @{2026-06-01}
	Transition to Antigravity-native Second Brain workspace.


## ⏳ Waiting On



## ✅ Done



%% kanban:settings
{"kanban-plugin":"board"}
%%
"""
    board_path = os.path.join(vault_path, "boards/builder-board.md")
    if not os.path.exists(board_path):
        with open(board_path, "w", encoding="utf-8") as f:
            f.write(kanban_content)
        print(f"[+] Wrote Kanban Board: {board_path}")

def migrate_files(vault_path):
    print("[*] Starting notes migration and frontmatter injection...")
    
    # Folders to scan and migrate files from
    source_folders = ["docs", "TUI", "Project", "Database", "CLI", "Commands", "Docker"]
    
    for folder in source_folders:
        folder_path = os.path.join(vault_path, folder)
        if not os.path.exists(folder_path):
            continue
            
        for root, _, files in os.walk(folder_path):
            for file in files:
                if not file.endswith(".md") or file.lower() == "readme.md":
                    continue
                    
                src_file_path = os.path.join(root, file)
                
                # Determine target folder
                target_folder = "wiki/concepts"
                note_type = "concept"
                
                if folder == "Project":
                    target_folder = "wiki/projects"
                    note_type = "project"
                elif folder == "Decisions":
                    target_folder = "wiki/decisions"
                    note_type = "decision-record"
                
                # Dest file path
                dest_file_path = os.path.join(vault_path, target_folder, file)
                
                # Read content
                with open(src_file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                
                # Prepend frontmatter if missing
                has_frontmatter = content.strip().startswith("---")
                if not has_frontmatter:
                    title = os.path.splitext(file)[0].replace("-", " ").title()
                    frontmatter = f"""---
title: {title}
type: {note_type}
tags:
  - unaxis
  - webbymk2
  - {folder.lower()}
status: active
last_reviewed: {datetime.now().strftime("%Y-%m-%d")}
ai-first: true
---
"""
                    content = frontmatter + content
                    print(f"[~] Prepended frontmatter to: {file}")
                
                # Convert plain references or formatting if needed
                # (e.g. standardizing wiki-links)
                
                # Write to new path
                with open(dest_file_path, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"[+] Migrated {src_file_path} -> {dest_file_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bootstrap Obsidian Vault")
    parser.add_argument("--path", default="vault", help="Path to the vault directory")
    parser.add_argument("--name", default="Antigravity", help="AI Operator Name")
    parser.add_argument("--preset", default="builder", help="Preset style (builder, executive, etc.)")
    
    args = parser.parse_args()
    bootstrap(args.path, args.name, args.preset)
