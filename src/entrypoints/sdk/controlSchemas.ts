import { z } from 'zod'
import {
  RuntimeCommandSchema,
  RuntimeNotificationSchema,
  RuntimeOperationSchema,
  RuntimePanelSchema,
  RuntimeZoneSchema,
  SDKMessageSchema,
} from './coreSchemas.js'

export const SDKControlInitializeRequestSchema = z.object({
  subtype: z.literal('initialize'),
  cwd: z.string().optional(),
  panels: z.array(RuntimePanelSchema).optional(),
})

export const SDKControlInitializeResponseSchema = z.object({
  product: z.literal('unaxis'),
  runtime: z.literal('control-plane'),
  panels: z.array(RuntimePanelSchema).default([]),
  commands: z.array(RuntimeCommandSchema).default([]),
  zones: z.array(RuntimeZoneSchema).default([]),
})

export const SDKControlInputRequestSchema = z.object({
  subtype: z.literal('input'),
  source: z.enum(['keyboard', 'hotkey', 'screen', 'command']),
  value: z.string(),
})

export const SDKControlEvalRequestSchema = z.object({
  subtype: z.literal('eval'),
  action: z.enum(['ipc', 'environment', 'zone', 'stack', 'db', 'proxy']),
  target: z.string(),
  payload: z.unknown().optional(),
})

export const SDKControlPrintRequestSchema = z.object({
  subtype: z.literal('print'),
  surface: z.enum(['tui', 'overlay', 'notification', 'panel']),
  notification: RuntimeNotificationSchema.optional(),
  operation: RuntimeOperationSchema.optional(),
})

export const SDKControlExitRequestSchema = z.object({
  subtype: z.literal('exit'),
  reason: z.string().optional(),
})

export const SDKControlCliCommandSchema = z.object({
  subtype: z.literal('command'),
  id: z.string().optional(),
  argv: z.array(z.string()),
  actor: z.string().optional(),
})

export const SDKControlRequestSchema = z.discriminatedUnion('subtype', [
  SDKControlInitializeRequestSchema,
  SDKControlInputRequestSchema,
  SDKControlEvalRequestSchema,
  SDKControlPrintRequestSchema,
  SDKControlExitRequestSchema,
  SDKControlCliCommandSchema,
])

export const SDKControlResponseSchema = z.object({
  type: z.literal('control.ack'),
  subtype: z.string(),
  ok: z.boolean(),
  code: z.number().default(0),
  lines: z.array(z.string()).optional(),
  data: z.unknown().optional(),
  error: z.string().optional(),
})
