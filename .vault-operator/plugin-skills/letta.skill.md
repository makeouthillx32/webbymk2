---
id: letta
name: Letta
source: vault-native
plugin-type: community
status: enabled
class: FULL
description: "Chat with a stateful AI agent powered by Letta that knows your vault contents and remembers your conversations. Features persistent memory, automatic vault sync, memory block management, and project-aware agent switching."
has-settings: false
needs-setup: true
commands:
  - id: "letta:open-letta-chat"
    name: "Letta: Open Chat"
  - id: "letta:open-letta-memory"
    name: "Letta: Open Memory Blocks"
  - id: "letta:open-block-folder"
    name: "Letta: Open Memory Blocks Folder"
  - id: "letta:connect-to-letta"
    name: "Letta: Connect"
  - id: "letta:disconnect-from-letta"
    name: "Letta: Disconnect"
---

# Letta

**Description:** Chat with a stateful AI agent powered by Letta that knows your vault contents and remembers your conversations. Features persistent memory, automatic vault sync, memory block management, and project-aware agent switching.
**Status:** Enabled
**Plugin ID:** letta

## Setup Required

No settings file found (data.json). Plugin may need initial setup via Obsidian Settings.
Guide the user to configure this plugin via Obsidian Settings if needed.

## Available Commands

Available command IDs (use execute_command for Obsidian-native commands):
- `letta:open-letta-chat` -- Letta: Open Chat
- `letta:open-letta-memory` -- Letta: Open Memory Blocks
- `letta:open-block-folder` -- Letta: Open Memory Blocks Folder
- `letta:connect-to-letta` -- Letta: Connect
- `letta:disconnect-from-letta` -- Letta: Disconnect

## Configuration File

Settings path: `.obsidian/plugins/letta/data.json`

To configure this plugin programmatically:
1. Read the config: read_file(".obsidian/plugins/letta/data.json")
2. Understand the settings structure and modify values as needed
3. Write changes: write_file(".obsidian/plugins/letta/data.json", updatedJSON)

Do NOT ask the user to open Settings UI. Modify data.json directly.

## Documentation

For detailed plugin documentation (commands, options, dependencies):
read_file(".vault-operator/plugin-skills/letta.readme.md")

## Usage

When the user asks for functionality related to Letta:
1. Read the plugin documentation (.readme.md) to understand capabilities and dependencies
2. Read the config file (.obsidian/plugins/letta/data.json). If it does not exist, that is normal -- create it with the required settings
3. Configure the plugin by writing data.json with the values needed for the task
4. Execute the task using the appropriate tool:
   - For Obsidian-native commands (including file export): use execute_command
   - For CLI-based conversion needing Pandoc/LaTeX: use execute_recipe
   - For data queries: use call_plugin_api
5. If a command opens a UI dialog, tell the user what to click.

CRITICAL RULES:
- Prefer native Obsidian commands over external tools when both can accomplish the task.
- NEVER create fake output files. If the user asks for a PDF/DOCX/image export, use execute_recipe -- do NOT write content to a .pdf file yourself.
- If a dependency is missing (e.g. Pandoc), tell the user what to install.
IMPORTANT: After reading this file, ALWAYS take action or respond. Never end silently.
