---
id: obsidian42-brat
name: BRAT
source: vault-native
plugin-type: community
status: disabled
class: PARTIAL
description: "Easily install a beta version of a plugin for testing."
has-settings: true
needs-setup: true
---

# BRAT

**Description:** Easily install a beta version of a plugin for testing.
**Status:** Disabled
**Plugin ID:** obsidian42-brat

## Setup Required

Plugin is disabled. Use enable_plugin to activate it first.
Guide the user to configure this plugin via Obsidian Settings if needed.

## Configuration File

Settings path: `.obsidian/plugins/obsidian42-brat/data.json`

To configure this plugin programmatically:
1. Read the config: read_file(".obsidian/plugins/obsidian42-brat/data.json")
2. Understand the settings structure and modify values as needed
3. Write changes: write_file(".obsidian/plugins/obsidian42-brat/data.json", updatedJSON)

Do NOT ask the user to open Settings UI. Modify data.json directly.

## Current Configuration

These are the plugin's current settings (sensitive values redacted):

```
pluginList: [ebullient/obsidian-vault-mcp]
pluginSubListFrozenVersion: [1 items]
updateAtStartup: true
updateThemesAtStartup: true
enableAfterInstall: true
loggingEnabled: false
loggingPath: BRAT-log
loggingVerboseEnabled: false
debuggingMode: false
notificationsEnabled: true
selectLatestPluginVersionByDefault: false
allowIncompatiblePlugins: true
```
(2 sensitive field(s) redacted)

For full settings, read: `.obsidian/plugins/obsidian42-brat/data.json`

## Documentation

For detailed plugin documentation (commands, options, dependencies):
read_file(".vault-operator/plugin-skills/obsidian42-brat.readme.md")

## Usage

This plugin is currently disabled. Use enable_plugin("obsidian42-brat") to activate it first.
After enabling, the plugin's commands will become available for execute_command.
