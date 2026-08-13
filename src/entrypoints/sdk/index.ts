import * as net from 'net'

export * from './coreSchemas.js'
export * from './controlSchemas.js'
export * from './coreTypes.generated.js'
export * from './runtimeTypes.js'
export * from './toolTypes.js'

export const PROD_IPC_PORT = 50505
export const DEV_IPC_PORT = 50507
export const DEFAULT_IPC_HOST = '127.0.0.1'

export interface UnaxisClientOptions {
  host?: string
  port?: number
  timeoutMs?: number
}

export interface UnaxisCommandResult {
  code: number
  label: string
  lines: string[]
}

/**
 * UNAXIS Control Plane SDK Client.
 * Communicates with the running UNAXIS TUI Control Plane over local IPC.
 */
export class UnaxisClient {
  private host: string
  private port: number
  private timeoutMs: number

  constructor(options: UnaxisClientOptions = {}) {
    this.host = options.host || process.env['UNAXIS_IPC_HOST'] || DEFAULT_IPC_HOST
    this.port = options.port || Number(process.env['UNAXIS_IPC_PORT']) || PROD_IPC_PORT
    this.timeoutMs = options.timeoutMs || 10_000
  }

  /**
   * Execute an IPC command string array against the running UNAXIS Control Plane.
   */
  public async sendCommand(argv: string[]): Promise<UnaxisCommandResult> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port })
      const lines: string[] = []
      let buf = ''

      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error(`UNAXIS IPC timeout after ${this.timeoutMs}ms (${this.host}:${this.port})`))
      }, this.timeoutMs)

      socket.setEncoding('utf8')

      socket.on('connect', () => {
        socket.write(JSON.stringify({ argv }) + '\n')
      })

      socket.on('data', (chunk) => {
        buf += chunk
        const split = buf.split('\n')
        buf = split.pop() ?? ''
        for (const line of split) {
          lines.push(line)
        }
      })

      socket.on('error', (err) => {
        clearTimeout(timer)
        if (this.port === PROD_IPC_PORT) {
          const fallback = new UnaxisClient({ host: this.host, port: DEV_IPC_PORT, timeoutMs: this.timeoutMs })
          fallback.sendCommand(argv).then(resolve, reject)
          return
        }
        reject(err)
      })

      socket.on('close', () => {
        clearTimeout(timer)
        if (buf.trim()) {
          lines.push(buf.trim())
        }

        let code = 0
        let label = 'ok'
        const lastLine = lines[lines.length - 1] ?? ''

        if (lastLine.startsWith('__UNAXIS_EXIT__:')) {
          lines.pop()
          const parts = lastLine.split(':')
          code = Number(parts[1] ?? 0)
          label = parts[2] ?? 'ok'
        }

        resolve({ code, label, lines })
      })
    })
  }

  public async getStatus(): Promise<UnaxisCommandResult> {
    return this.sendCommand(['status'])
  }

  public async getSession(): Promise<UnaxisCommandResult> {
    return this.sendCommand(['session'])
  }

  public async listZones(): Promise<UnaxisCommandResult> {
    return this.sendCommand(['zones'])
  }

  public async zoneDevStart(zoneName: string): Promise<UnaxisCommandResult> {
    return this.sendCommand(['zone', zoneName, 'dev', 'start'])
  }

  public async zoneDevStop(zoneName: string): Promise<UnaxisCommandResult> {
    return this.sendCommand(['zone', zoneName, 'dev', 'stop'])
  }

  public async zoneDevRestart(zoneName: string): Promise<UnaxisCommandResult> {
    return this.sendCommand(['zone', zoneName, 'dev', 'restart'])
  }
}

export function createUnaxisClient(options?: UnaxisClientOptions): UnaxisClient {
  return new UnaxisClient(options)
}

export const sdk = {
  name: 'unaxis-sdk',
  status: 'active',
  createClient: createUnaxisClient,
} as const

export default sdk
