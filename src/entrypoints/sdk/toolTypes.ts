export type RuntimeToolScope = 'core' | 'zones' | 'env' | 'stack' | 'system'

export type RuntimeTool = {
  id: string
  title: string
  scope: RuntimeToolScope
  command?: string
  hotkey?: string
  disabled?: boolean
  reason?: string
}

export type RuntimeToolResult =
  | { ok: true; message?: string; data?: unknown }
  | { ok: false; error: string; data?: unknown }
