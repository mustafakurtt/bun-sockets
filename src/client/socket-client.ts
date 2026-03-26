import type { EventMap, EventHandler } from '../types/events.types.ts'
import type {
  ClientOptions,
  ResolvedClientOptions,
  ReconnectOptions,
  ConnectionState,
  LifecycleHandlers,
  BufferedMessage,
  BunSocketClient,
} from '../types/client.types.ts'

const DEFAULT_RECONNECT: ReconnectOptions = {
  enabled: true,
  maxRetries: 10,
  baseDelay: 1000,
  maxDelay: 30000,
  jitter: true,
}

function resolveOptions(options: ClientOptions): ResolvedClientOptions {
  let reconnect: ReconnectOptions

  if (options.reconnect === false) {
    reconnect = { ...DEFAULT_RECONNECT, enabled: false }
  } else if (options.reconnect === true || options.reconnect === undefined) {
    reconnect = { ...DEFAULT_RECONNECT }
  } else {
    reconnect = { ...DEFAULT_RECONNECT, ...options.reconnect, enabled: true }
  }

  return {
    url: options.url,
    path: options.path ?? '/ws',
    reconnect,
    auth: options.auth ?? {},
    protocols: options.protocols ?? [],
    bufferMessages: options.bufferMessages ?? true,
    maxBufferSize: options.maxBufferSize ?? 100,
  }
}

export class SocketClient<
  ClientEvents extends EventMap = EventMap,
  ServerEvents extends EventMap = EventMap,
> implements BunSocketClient<ClientEvents, ServerEvents> {
  private readonly options: ResolvedClientOptions
  private ws: WebSocket | null = null
  private currentState: ConnectionState = 'disconnected'
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalClose = false

  private readonly eventHandlers: Map<string, Set<EventHandler>> = new Map()
  private readonly buffer: BufferedMessage[] = []
  private readonly lifecycle: LifecycleHandlers = {
    connect: new Set(),
    disconnect: new Set(),
    reconnect: new Set(),
    reconnectFailed: new Set(),
    error: new Set(),
  }

  private socketId: string | null = null

  constructor(options: ClientOptions) {
    this.options = resolveOptions(options)
  }

  get id(): string | null {
    return this.socketId
  }

  get state(): ConnectionState {
    return this.currentState
  }

  get connected(): boolean {
    return this.currentState === 'connected'
  }

  connect(): this {
    if (this.currentState === 'connected' || this.currentState === 'connecting') {
      return this
    }

    this.intentionalClose = false
    this.createConnection()
    return this
  }

  disconnect(code = 1000, reason = 'client disconnect'): this {
    this.intentionalClose = true
    this.clearReconnectTimer()
    this.reconnectAttempt = 0

    if (this.ws) {
      this.ws.close(code, reason)
      this.ws = null
    }

    this.setState('disconnected')
    return this
  }

  emit<K extends keyof ClientEvents & string>(
    event: K,
    payload: ClientEvents[K],
  ): this {
    const message = JSON.stringify({ event, payload })

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message)
    } else if (this.options.bufferMessages) {
      this.addToBuffer(event, payload)
    }

    return this
  }

  on<K extends keyof ServerEvents & string>(
    event: K,
    handler: EventHandler<ServerEvents[K]>,
  ): this {
    let handlers = this.eventHandlers.get(event)
    if (!handlers) {
      handlers = new Set()
      this.eventHandlers.set(event, handlers)
    }
    handlers.add(handler as EventHandler)
    return this
  }

  off<K extends keyof ServerEvents & string>(
    event: K,
    handler?: EventHandler<ServerEvents[K]>,
  ): this {
    if (!handler) {
      this.eventHandlers.delete(event)
    } else {
      const handlers = this.eventHandlers.get(event)
      if (handlers) {
        handlers.delete(handler as EventHandler)
        if (handlers.size === 0) {
          this.eventHandlers.delete(event)
        }
      }
    }
    return this
  }

  onConnect(handler: () => void): this {
    this.lifecycle.connect.add(handler)
    return this
  }

  onDisconnect(handler: (code: number, reason: string) => void): this {
    this.lifecycle.disconnect.add(handler)
    return this
  }

  onReconnect(handler: (attempt: number) => void): this {
    this.lifecycle.reconnect.add(handler)
    return this
  }

  onReconnectFailed(handler: () => void): this {
    this.lifecycle.reconnectFailed.add(handler)
    return this
  }

  onError(handler: (error: Event) => void): this {
    this.lifecycle.error.add(handler)
    return this
  }

  private createConnection(): void {
    const isReconnect = this.currentState === 'reconnecting'
    this.setState(isReconnect ? 'reconnecting' : 'connecting')

    const url = this.buildUrl()

    try {
      this.ws = this.options.protocols.length
        ? new WebSocket(url, this.options.protocols)
        : new WebSocket(url)
    } catch {
      this.handleConnectionFailure()
      return
    }

    this.ws.onopen = () => {
      this.currentState = 'connected'

      if (isReconnect) {
        for (const handler of this.lifecycle.reconnect) {
          handler(this.reconnectAttempt)
        }
      }

      this.reconnectAttempt = 0

      for (const handler of this.lifecycle.connect) {
        handler()
      }

      this.flushBuffer()
    }

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as { event: string; payload: unknown }

        if (data.event === '__system:id') {
          this.socketId = data.payload as string
          return
        }

        const handlers = this.eventHandlers.get(data.event)
        if (handlers) {
          for (const handler of handlers) {
            handler(data.payload)
          }
        }
      } catch {
        // Silently ignore malformed messages
      }
    }

    this.ws.onclose = (event: CloseEvent) => {
      this.ws = null

      for (const handler of this.lifecycle.disconnect) {
        handler(event.code, event.reason)
      }

      if (!this.intentionalClose) {
        this.attemptReconnect()
      } else {
        this.setState('disconnected')
      }
    }

    this.ws.onerror = (event: Event) => {
      for (const handler of this.lifecycle.error) {
        handler(event)
      }
    }
  }

  private buildUrl(): string {
    const base = this.options.url.replace(/\/$/, '')
    const path = this.options.path.startsWith('/') ? this.options.path : `/${this.options.path}`
    let url = `${base}${path}`

    const authKeys = Object.keys(this.options.auth)
    if (authKeys.length > 0) {
      const params = new URLSearchParams(this.options.auth)
      url += `?${params.toString()}`
    }

    return url
  }

  private attemptReconnect(): void {
    const { reconnect } = this.options

    if (!reconnect.enabled) {
      this.setState('disconnected')
      return
    }

    if (this.reconnectAttempt >= reconnect.maxRetries) {
      this.setState('disconnected')
      for (const handler of this.lifecycle.reconnectFailed) {
        handler()
      }
      return
    }

    this.reconnectAttempt++
    this.setState('reconnecting')

    const delay = this.calculateDelay()

    this.reconnectTimer = setTimeout(() => {
      this.createConnection()
    }, delay)
  }

  private calculateDelay(): number {
    const { baseDelay, maxDelay, jitter } = this.options.reconnect

    // Exponential backoff: baseDelay * 2^(attempt-1)
    let delay = Math.min(
      baseDelay * Math.pow(2, this.reconnectAttempt - 1),
      maxDelay,
    )

    if (jitter) {
      // Add ±25% jitter to prevent thundering herd
      const jitterRange = delay * 0.25
      delay += (Math.random() * jitterRange * 2) - jitterRange
    }

    return Math.round(delay)
  }

  private handleConnectionFailure(): void {
    if (!this.intentionalClose) {
      this.attemptReconnect()
    } else {
      this.setState('disconnected')
    }
  }

  private addToBuffer(event: string, payload: unknown): void {
    if (this.buffer.length >= this.options.maxBufferSize) {
      this.buffer.shift()
    }

    this.buffer.push({
      event,
      payload,
      timestamp: Date.now(),
    })
  }

  private flushBuffer(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    while (this.buffer.length > 0) {
      const msg = this.buffer.shift()!
      this.ws.send(JSON.stringify({ event: msg.event, payload: msg.payload }))
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private setState(state: ConnectionState): void {
    this.currentState = state
  }
}
