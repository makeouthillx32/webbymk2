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
  action: z.enum(['ipc', 'environment', 'zone', 'stack']),
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

export const SDKControlRequestSchema = z.discriminatedUnion('subtype', [
  SDKControlInitializeRequestSchema,
  SDKControlInputRequestSchema,
  SDKControlEvalRequestSchema,
  SDKControlPrintRequestSchema,
  SDKControlExitRequestSchema,
])

export const SDKControlResponseSchema = z.discriminatedUnion('type', [
  ...SDKMessageSchema.options,
  z.object({
    type: z.literal('control.ack'),
    subtype: z.enum(['initialize', 'input', 'eval', 'print', 'exit']),
    ok: z.boolean(),
    error: z.string().optional(),
  }),
])
