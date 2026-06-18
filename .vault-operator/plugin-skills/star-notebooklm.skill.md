---
id: star-notebooklm
name: Star NotebookLM
source: vault-native
plugin-type: community
status: enabled
class: FULL
description: "Send notes directly to Google NotebookLM as sources from an embedded NotebookLM view."
has-settings: true
commands:
  - id: "star-notebooklm:send-to-notebooklm"
    name: "Star NotebookLM: Send current note to NotebookLM"
  - id: "star-notebooklm:send-selection-to-notebooklm"
    name: "Star NotebookLM: Send selected text to NotebookLM"
  - id: "star-notebooklm:open-notebooklm"
    name: "Star NotebookLM: Open NotebookLM"
---

# Star NotebookLM

**Description:** Send notes directly to Google NotebookLM as sources from an embedded NotebookLM view.
**Status:** Enabled
**Plugin ID:** star-notebooklm

## Available Commands

Available command IDs (use execute_command for Obsidian-native commands):
- `star-notebooklm:send-to-notebooklm` -- Star NotebookLM: Send current note to NotebookLM
- `star-notebooklm:send-selection-to-notebooklm` -- Star NotebookLM: Send selected text to NotebookLM
- `star-notebooklm:open-notebooklm` -- Star NotebookLM: Open NotebookLM

## Configuration File

Settings path: `.obsidian/plugins/star-notebooklm/data.json`

To configure this plugin programmatically:
1. Read the config: read_file(".obsidian/plugins/star-notebooklm/data.json")
2. Understand the settings structure and modify values as needed
3. Write changes: write_file(".obsidian/plugins/star-notebooklm/data.json", updatedJSON)

Do NOT ask the user to open Settings UI. Modify data.json directly.

## Current Configuration

These are the plugin's current settings (sensitive values redacted):

```
language: auto
includeMetadata: true
includeFrontmatter: true
sourceAddMethod: api
```

For full settings, read: `.obsidian/plugins/star-notebooklm/data.json`

## Documentation

For detailed plugin documentation (commands, options, dependencies):
read_file(".vault-operator/plugin-skills/star-notebooklm.readme.md")

## Usage

When the user asks for functionality related to Star NotebookLM:
1. Read the plugin documentation (.readme.md) to understand capabilities and dependencies
2. Read the config file (.obsidian/plugins/star-notebooklm/data.json). If it does not exist, that is normal -- create it with the required settings
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
