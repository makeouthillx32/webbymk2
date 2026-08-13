export type RuntimeToolScope = 'core' | 'zones' | 'env' | 'stack' | 'system'

export type AgentRoleScope = 'unaxis' | 'unenter' | 'unenter-blog' | 'obsidian'

export type RuntimeTool = {
  id: string
  title: string
  scope: RuntimeToolScope
  agentRole?: AgentRoleScope
  command?: string
  hotkey?: string
  disabled?: boolean
  reason?: string
}

export type RuntimeToolResult =
  | { ok: true; message?: string; data?: unknown }
  | { ok: false; error: string; data?: unknown }
