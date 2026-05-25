export type {
  RuntimeCommand,
  RuntimeNotification,
  RuntimeOperation,
  RuntimePanel,
  RuntimeZone,
} from './coreTypes.generated.js'
import type {
  RuntimeNotification,
  RuntimeOperation,
  RuntimeZone,
} from './coreTypes.generated.js'

export type RuntimeSnapshot = {
  cwd: string
  activePanel: string
  activeZone?: string
  zones: RuntimeZone[]
  operations: RuntimeOperation[]
  notifications: RuntimeNotification[]
}
