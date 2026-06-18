---
id: vault-operator
name: Vault Operator
source: vault-native
plugin-type: community
status: enabled
class: FULL
description: "Agentic AI operating layer for your vault. Discovers and uses installed plugins, maintains persistent unified memory, and adapts to your workflows, skills and tools with full safety controls."
has-settings: true
commands:
  - id: "vault-operator:open-agent-sidebar"
    name: "Vault Operator: Open agent sidebar"
  - id: "vault-operator:save-conversation-to-memory"
    name: "Vault Operator: Save conversation to memory"
  - id: "vault-operator:generate-memory-soak-report"
    name: "Vault Operator: Generate memory soak report"
  - id: "vault-operator:test-tool-execution"
    name: "Vault Operator: Test tool execution"
  - id: "vault-operator:ba25-run-frontmatter-backfill"
    name: "Vault Operator: Run frontmatter backfill job"
  - id: "vault-operator:ba25-run-inbox-triage"
    name: "Vault Operator: Run inbox triage on the configured auto-trigger property"
  - id: "vault-operator:ba25-refresh-moc-pages"
    name: "Vault Operator: Refresh map-of-content pages now (marker block)"
  - id: "vault-operator:ba25-inject-moc-markers"
    name: "Vault Operator: Inject initial map-of-content markers into cluster candidates"
  - id: "vault-operator:ba25-refresh-top-hub-block"
    name: "Vault Operator: Regenerate top-hub block now"
  - id: "vault-operator:open-setup-wizard"
    name: "Vault Operator: Open setup wizard"
---

# Vault Operator

**Description:** Agentic AI operating layer for your vault. Discovers and uses installed plugins, maintains persistent unified memory, and adapts to your workflows, skills and tools with full safety controls.
**Status:** Enabled
**Plugin ID:** vault-operator

## Available Commands

Available command IDs (use execute_command for Obsidian-native commands):
- `vault-operator:open-agent-sidebar` -- Vault Operator: Open agent sidebar
- `vault-operator:save-conversation-to-memory` -- Vault Operator: Save conversation to memory
- `vault-operator:generate-memory-soak-report` -- Vault Operator: Generate memory soak report
- `vault-operator:test-tool-execution` -- Vault Operator: Test tool execution
- `vault-operator:ba25-run-frontmatter-backfill` -- Vault Operator: Run frontmatter backfill job
- `vault-operator:ba25-run-inbox-triage` -- Vault Operator: Run inbox triage on the configured auto-trigger property
- `vault-operator:ba25-refresh-moc-pages` -- Vault Operator: Refresh map-of-content pages now (marker block)
- `vault-operator:ba25-inject-moc-markers` -- Vault Operator: Inject initial map-of-content markers into cluster candidates
- `vault-operator:ba25-refresh-top-hub-block` -- Vault Operator: Regenerate top-hub block now
- `vault-operator:open-setup-wizard` -- Vault Operator: Open setup wizard

## Configuration File

Settings path: `.obsidian/plugins/vault-operator/data.json`

To configure this plugin programmatically:
1. Read the config: read_file(".obsidian/plugins/vault-operator/data.json")
2. Understand the settings structure and modify values as needed
3. Write changes: write_file(".obsidian/plugins/vault-operator/data.json", updatedJSON)

Do NOT ask the user to open Settings UI. Modify data.json directly.

## Current Configuration

These are the plugin's current settings (sensitive values redacted):

```
defaultProvider: anthropic
mcpServers:
  icons8:
    type: streamable-http
    url: https://mcp.icons8.com/mcp/
    disabled: false
    timeout: 60
    isBuiltIn: true
currentMode: agent
autoApproval:
  enabled: false
  showMenuInChat: true
  read: true
  noteEdits: false
  vaultChanges: false
  web: false
  mcp: false
  mode: false
  subtasks: false
  question: true
  todo: true
  skills: false
  pluginApiRead: true
  pluginApiWrite: false
  recipes: false
  sandbox: false
autoApprovalRules:
  readOperations: true
  writeToTempFiles: false
advancedApi:
  consecutiveMistakeLimit: 3
  rateLimitMs: 0
  condensingEnabled: true
  condensingThreshold: 80
  powerSteeringFrequency: 0
  maxIterations: 25
  maxSubtaskDepth: 2
  microcompactionEnabled: true
  rollingSummaryThreshold: 50
  costWarnThresholdEur: 0
  telemetryRecordPromptPreview: false
enableSemanticIndex: false
embeddingModels: [1 items]
activeEmbeddingModelKey: docker.io/ai/nomic-embed-text-v1.5:latest|custom
semanticBatchSize: 20
semanticAutoIndex: never
semanticStorageLocation: global
semanticIndexPdfs: false
semanticChunkSize: 2000
enableContextualRetrieval: true
hydeEnabled: false
semanticAutoIndexOnChange: false
enableGraphExpansion: true
graphExpansionHops: 1
mocPropertyNames: [Themen, Konzepte, Personen, Notizen, Meeting-Notes, Quellen]
enableImplicitConnections: true
implicitThreshold: 0.7
enableSuggestionBanner: true
categoryProperty: Kategorie
summaryProperty: Zusammenfassung
sourceNamingConvention: Autor-Jahr_Titel
enableSynthesisButton: true
enableVaultHealthCheck: true
enableReranking: true
rerankCandidates: 20
enableMcpServer: true
enableRemoteRelay: false
enableCheckpoints: true
checkpointTimeoutSeconds: 30
checkpointAutoCleanup: true
webTools:
  enabled: true
  provider: none
enableChatHistory: true
memory:
  enabled: true
  autoExtractSessions: true
  extractionThreshold: 6
  v2MigrationStatus: completed
  crossSurface:
    defaultSyncMode: auto
    perProvider:
      obsilo: global
      claude-ai: global
      claude-code: global
      chatgpt: manual
      perplexity: manual
      unknown: manual
    livingDocumentByDefault: true
    strictSourceIsolation: false
  lastAgingRunAt: 2026-06-18T19:21:00.659Z
  lastCapabilityHash: ae633956
chatLinking:
  enabled: true
autoAddActiveFileContext: true
sendWithEnter: true
includeCurrentTimeInContext: false
showContextProgress: false
customPrompts: [3 items: {...}, {...}, {...}...]
vaultDNA:
  enabled: true
skillVersioning:
  retentionCount: 20
backup:
  autoDailyEnabled: false
  autoDailyTargetPath: .vault-operator/cache/backups
  retentionCount: 7
  lastAutoBackupAt: 0
pluginApi:
  enabled: true
  defaultTimeoutMs: 10000
  autoPromotionEnabled: true
  autoPromotionThreshold: 3
recipes:
  enabled: true
mastery:
  enabled: true
  recipeBudget: 2000
  learnedRecipesEnabled: true
onboarding:
  completed: false
  currentStep: backup
  firstRunModalShownCount: 3
  dontShowFirstRunAgain: false
  modalCompleted: false
sandboxMode: auto
taskExtraction:
  enabled: true
  taskFolder: Tasks
  preferTaskNotesPlugin: true
  taskNotesHintDismissed: false
kiloLastValidatedAt: 0
chatgptOAuthEmail: skillet1005@gmail.com
chatgptOAuthExpiresAt: 1781328237772
chatgptOAuthModel: gpt-5.5
chatgptOAuthDisclaimerAcknowledgedAt: 0
debugMode: false
agentFolderPath: .vault-operator
defaultOutputFolder: Inbox/
autoTaskRouter:
  enabled: true
vaultIngest:
  summaryPrompt:
    template: [string, 641 chars]
  autoSummary:
    enabled: true
    writeFrontmatter: false
  autoTrigger:
    enabled: false
    propertyName: category
    propertyValue: source
    notification: false
  pdfStrategy: page-refs
  topHubBlock:
    enabled: false
    privacyAcknowledged: false
  stufe2Hint:
    enabled: false
    hintThresholdScore: 70
    minDaysSinceCheck: 30
    perClusterCooldownDays: 7
    maxHintsPerDay: 5
providerConfigs: [2 items: {...}, {...}...]
activeProviderId: custom-main
defaultMainModelTier: mid
_globalStorageMigrated: true
_parentDirMigrated: true
_pluginDataDirsMigrated: true
_legacyVaultDirsCleaned: true
_encrypted: true
```
(14 sensitive field(s) redacted)

For full settings, read: `.obsidian/plugins/vault-operator/data.json`

## Documentation

For detailed plugin documentation (commands, options, dependencies):
read_file(".vault-operator/plugin-skills/vault-operator.readme.md")

## Usage

When the user asks for functionality related to Vault Operator:
1. Read the plugin documentation (.readme.md) to understand capabilities and dependencies
2. Read the config file (.obsidian/plugins/vault-operator/data.json). If it does not exist, that is normal -- create it with the required settings
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
