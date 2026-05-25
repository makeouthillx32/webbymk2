import type { z } from 'zod'
import type {
  RuntimeCommandSchema,
  RuntimeNotificationSchema,
  RuntimeOperationSchema,
  RuntimePanelSchema,
  RuntimeZoneSchema,
  SDKMessageSchema,
} from './coreSchemas.js'

export type RuntimeZone = z.infer<typeof RuntimeZoneSchema>
export type RuntimePanel = z.infer<typeof RuntimePanelSchema>
export type RuntimeCommand = z.infer<typeof RuntimeCommandSchema>
export type RuntimeOperation = z.infer<typeof RuntimeOperationSchema>
export type RuntimeNotification = z.infer<typeof RuntimeNotificationSchema>
export type SDKMessage = z.infer<typeof SDKMessageSchema>
