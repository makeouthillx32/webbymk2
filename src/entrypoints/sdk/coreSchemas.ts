import { z } from 'zod'

export const RuntimeZoneSchema = z.object({
  key: z.string(),
  label: z.string(),
  domain: z.string(),
  service: z.string(),
  container: z.string(),
  image: z.string(),
  status: z.enum(['unknown', 'running', 'stopped', 'starting', 'error']).default('unknown'),
  dockerfile: z.string().optional(),
  upstreamEnvKey: z.string().optional(),
  environmentId: z.string().nullable().optional(),
})

export const RuntimePanelSchema = z.object({
  id: z.string(),
  title: z.string(),
  active: z.boolean().default(false),
  badge: z.string().optional(),
})

export const RuntimeCommandSchema = z.object({
  id: z.string(),
  label: z.string(),
  command: z.string(),
  scope: z.enum(['core', 'zones', 'env', 'stack', 'system']),
  hotkey: z.string().optional(),
})

export const RuntimeOperationSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  busy: z.boolean(),
  lines: z.array(z.string()).default([]),
  dismissable: z.boolean().optional(),
})

export const RuntimeStackItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(['pending', 'running', 'done', 'failed']),
  detail: z.string().optional(),
  timestamp: z.string().optional(),
})

export const RuntimeNotificationSchema = z.object({
  key: z.string(),
  text: z.string(),
  type: z.enum(['success', 'error', 'info', 'warning']).default('info'),
  priority: z.enum(['low', 'medium', 'high', 'immediate']).default('medium'),
})

export const SDKMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('runtime.snapshot'),
    cwd: z.string(),
    activePanel: z.string(),
    activeZone: z.string().optional(),
    zones: z.array(RuntimeZoneSchema).default([]),
    operations: z.array(RuntimeOperationSchema).default([]),
    stackItems: z.array(RuntimeStackItemSchema).default([]),
    notifications: z.array(RuntimeNotificationSchema).default([]),
  }),
  z.object({
    type: z.literal('runtime.event'),
    name: z.string(),
    payload: z.unknown().optional(),
  }),
])
