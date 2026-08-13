import type { z } from 'zod'
import type {
  RuntimeCommandSchema,
  RuntimeNotificationSchema,
  RuntimeOperationSchema,
  RuntimePanelSchema,
  RuntimeStackItemSchema,
  RuntimeZoneSchema,
  SDKMessageSchema,
} from './coreSchemas.js'
import type {
  SDKControlCliCommandSchema,
  SDKControlEvalRequestSchema,
  SDKControlExitRequestSchema,
  SDKControlInitializeRequestSchema,
  SDKControlInputRequestSchema,
  SDKControlPrintRequestSchema,
  SDKControlRequestSchema,
  SDKControlResponseSchema,
} from './controlSchemas.js'

export type RuntimeZone = z.infer<typeof RuntimeZoneSchema>
export type RuntimePanel = z.infer<typeof RuntimePanelSchema>
export type RuntimeCommand = z.infer<typeof RuntimeCommandSchema>
export type RuntimeOperation = z.infer<typeof RuntimeOperationSchema>
export type RuntimeStackItem = z.infer<typeof RuntimeStackItemSchema>
export type RuntimeNotification = z.infer<typeof RuntimeNotificationSchema>
export type SDKMessage = z.infer<typeof SDKMessageSchema>

export type SDKControlInitializeRequest = z.infer<typeof SDKControlInitializeRequestSchema>
export type SDKControlInputRequest = z.infer<typeof SDKControlInputRequestSchema>
export type SDKControlEvalRequest = z.infer<typeof SDKControlEvalRequestSchema>
export type SDKControlPrintRequest = z.infer<typeof SDKControlPrintRequestSchema>
export type SDKControlExitRequest = z.infer<typeof SDKControlExitRequestSchema>
export type SDKControlCliCommand = z.infer<typeof SDKControlCliCommandSchema>
export type SDKControlRequest = z.infer<typeof SDKControlRequestSchema>
export type SDKControlResponse = z.infer<typeof SDKControlResponseSchema>
