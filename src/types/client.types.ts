import type { EventMap, EventHandler } from './events.types.ts'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface ReconnectOptions {
  enabled: boolean
  maxRetries: number
  baseDelay: number
  maxDelay: number
  jitter: boolean
}

export interface ClientOptions {
  url: string
  path?: string
  reconnect?: boolean | Partial<ReconnectOptions>
  auth?: Record<string, string>
  protocols?: string | string[]
  bufferMessages?: boolean
  maxBufferSize?: number
}

export interface ResolvedClientOptions {
  url: string
  path: string
  reconnect: ReconnectOptions
  auth: Record<string, string>
  protocols: string | string[]
  bufferMessages: boolean
  maxBufferSize: number
}

export interface LifecycleHandlers {
  connect: Set<() => void>
  disconnect: Set<(code: number, reason: string) => void>
  reconnect: Set<(attempt: number) => void>
  reconnectFailed: Set<() => void>
  error: Set<(error: Event) => void>
}

export type LifecycleEvent = keyof LifecycleHandlers

export interface BufferedMessage {
  event: string
  payload: unknown
  timestamp: number
}

export interface BunSocketClient<
  ClientEvents extends EventMap = EventMap,
  ServerEvents extends EventMap = EventMap,
> {
  readonly id: string | null
  readonly state: ConnectionState
  readonly connected: boolean

  connect(): this
  disconnect(code?: number, reason?: string): this

  emit<K extends keyof ClientEvents & string>(
    event: K,
    payload: ClientEvents[K],
  ): this

  on<K extends keyof ServerEvents & string>(
    event: K,
    handler: EventHandler<ServerEvents[K]>,
  ): this

  off<K extends keyof ServerEvents & string>(
    event: K,
    handler?: EventHandler<ServerEvents[K]>,
  ): this

  onConnect(handler: () => void): this
  onDisconnect(handler: (code: number, reason: string) => void): this
  onReconnect(handler: (attempt: number) => void): this
  onReconnectFailed(handler: () => void): this
  onError(handler: (error: Event) => void): this
}
