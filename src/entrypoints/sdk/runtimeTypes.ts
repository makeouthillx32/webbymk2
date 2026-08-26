export type {
  RuntimeCommand,
  RuntimeNotification,
  RuntimeOperation,
  RuntimePanel,
  RuntimeStackItem,
  RuntimeZone,
  SDKControlRequest,
  SDKControlResponse,
  SDKMessage,
} from './coreTypes.generated.js'

import type {
  RuntimeNotification,
  RuntimeOperation,
  RuntimeStackItem,
  RuntimeZone,
} from './coreTypes.generated.js'

export type RuntimeSnapshot = {
  cwd: string
  activePanel: string
  activeZone?: string
  zones: RuntimeZone[]
  operations: RuntimeOperation[]
  stackItems: RuntimeStackItem[]
  notifications: RuntimeNotification[]
}
