---
id: vault-as-mcp
name: Vault as MCP
source: vault-native
plugin-type: community
status: enabled
class: FULL
description: "MCP server connecting Open WebUI, Claude Desktop, and other LLMs to your vault."
has-settings: true
commands:
  - id: "vault-as-mcp:start-server"
    name: "Vault as MCP: Start MCP server"
  - id: "vault-as-mcp:stop-server"
    name: "Vault as MCP: Stop MCP server"
  - id: "vault-as-mcp:restart-server"
    name: "Vault as MCP: Restart MCP server"
---

# Vault as MCP

**Description:** MCP server connecting Open WebUI, Claude Desktop, and other LLMs to your vault.
**Status:** Enabled
**Plugin ID:** vault-as-mcp

## Available Commands

Available command IDs (use execute_command for Obsidian-native commands):
- `vault-as-mcp:start-server` -- Vault as MCP: Start MCP server
- `vault-as-mcp:stop-server` -- Vault as MCP: Stop MCP server
- `vault-as-mcp:restart-server` -- Vault as MCP: Restart MCP server

## Configuration File

Settings path: `.obsidian/plugins/vault-as-mcp/data.json`

To configure this plugin programmatically:
1. Read the config: read_file(".obsidian/plugins/vault-as-mcp/data.json")
2. Understand the settings structure and modify values as needed
3. Write changes: write_file(".obsidian/plugins/vault-as-mcp/data.json", updatedJSON)

Do NOT ask the user to open Settings UI. Modify data.json directly.

## Current Configuration

These are the plugin's current settings (sensitive values redacted):

```
serverPort: 8765
serverHost: 127.0.0.1
autoStart: true
debug: false
```

For full settings, read: `.obsidian/plugins/vault-as-mcp/data.json`

## Documentation

For detailed plugin documentation (commands, options, dependencies):
read_file(".vault-operator/plugin-skills/vault-as-mcp.readme.md")

## Usage

When the user asks for functionality related to Vault as MCP:
1. Read the plugin documentation (.readme.md) to understand capabilities and dependencies
2. Read the config file (.obsidian/plugins/vault-as-mcp/data.json). If it does not exist, that is normal -- create it with the required settings
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
