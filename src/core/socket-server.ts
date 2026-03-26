import type { Server } from 'bun'
import type { EventMap } from '../types/events.types.ts'
import type {
  ServerOptions,
  MiddlewareFn,
  ConnectionHandler,
  DisconnectHandler,
  RoomEmitter,
  BunSocketServer,
} from '../types/server.types.ts'
import type { InternalSocketData, NativeWebSocket } from '../types/socket.types.ts'
import { SocketWrapper } from './socket-wrapper.ts'

const DEFAULT_OPTIONS: Required<ServerOptions> = {
  path: '/ws',
  idleTimeout: 120,
  maxPayloadLength: 16 * 1024 * 1024,
  perMessageDeflate: false,
}

export class SocketServer<
  ClientEvents extends EventMap = EventMap,
  ServerEvents extends EventMap = EventMap,
> implements BunSocketServer<ClientEvents, ServerEvents> {
  private readonly options: Required<ServerOptions>
  private readonly middlewares: MiddlewareFn[] = []
  private readonly connectionHandlers: Set<ConnectionHandler<ClientEvents, ServerEvents>> = new Set()
  private readonly disconnectHandlers: Set<DisconnectHandler<ClientEvents, ServerEvents>> = new Set()
  private readonly socketRegistry: Map<string, SocketWrapper<ClientEvents, ServerEvents>> = new Map()
  private readonly roomRegistry: Map<string, Set<string>> = new Map()
  private nativeServer: Server<InternalSocketData> | null = null

  readonly websocket: {
    idleTimeout: number
    maxPayloadLength: number
    perMessageDeflate: boolean
    open: (ws: NativeWebSocket) => void
    message: (ws: NativeWebSocket, message: string | Buffer) => void
    close: (ws: NativeWebSocket, code: number, reason: string) => void
  }

  constructor(options: ServerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }

    this.websocket = {
      idleTimeout: this.options.idleTimeout,
      maxPayloadLength: this.options.maxPayloadLength,
      perMessageDeflate: this.options.perMessageDeflate,

      open: (ws: NativeWebSocket) => {
        if (!this.nativeServer) return

        const wrapper = new SocketWrapper<ClientEvents, ServerEvents>(ws, this.nativeServer, this.roomRegistry)
        this.socketRegistry.set(ws.data.id, wrapper)

        for (const handler of this.connectionHandlers) {
          handler(wrapper)
        }
      },

      message: (ws: NativeWebSocket, message: string | Buffer) => {
        try {
          const raw = typeof message === 'string' ? message : message.toString()
          const { event, payload } = JSON.parse(raw) as { event: string; payload: unknown }

          const handler = ws.data.handlers.get(event)
          if (handler) {
            handler(payload)
          }
        } catch {
          // Silently ignore malformed messages
        }
      },

      close: (ws: NativeWebSocket, code: number, reason: string) => {
        const wrapper = this.socketRegistry.get(ws.data.id)
        if (!wrapper) return

        for (const room of ws.data.rooms) {
          const members = this.roomRegistry.get(room)
          if (members) {
            members.delete(ws.data.id)
            if (members.size === 0) {
              this.roomRegistry.delete(room)
            }
          }
        }

        for (const handler of this.disconnectHandlers) {
          handler(wrapper, code, reason)
        }

        this.socketRegistry.delete(ws.data.id)
      },
    }
  }

  on(event: 'connection', handler: ConnectionHandler<ClientEvents, ServerEvents>): this
  on(event: 'disconnect', handler: DisconnectHandler<ClientEvents, ServerEvents>): this
  on(event: string, handler: (...args: any[]) => void): this {
    if (event === 'connection') {
      this.connectionHandlers.add(handler as ConnectionHandler<ClientEvents, ServerEvents>)
    } else if (event === 'disconnect') {
      this.disconnectHandlers.add(handler as DisconnectHandler<ClientEvents, ServerEvents>)
    }
    return this
  }

  use(middleware: MiddlewareFn): this {
    this.middlewares.push(middleware)
    return this
  }

  to(room: string): RoomEmitter<ServerEvents> {
    return {
      emit: <K extends keyof ServerEvents & string>(event: K, payload: ServerEvents[K]) => {
        if (!this.nativeServer) return
        const message = JSON.stringify({ event, payload })
        this.nativeServer.publish(room, message)
      },
    }
  }

  get rooms(): ReadonlyMap<string, ReadonlySet<string>> {
    return this.roomRegistry
  }

  get sockets(): ReadonlyMap<string, SocketWrapper<ClientEvents, ServerEvents>> {
    return this.socketRegistry
  }

  get connectionCount(): number {
    return this.socketRegistry.size
  }

  handler = (req: Request, server: Server<InternalSocketData>): Response | undefined => {
    this.nativeServer = server

    const url = new URL(req.url)
    if (url.pathname !== this.options.path) {
      return undefined
    }

    if (this.middlewares.length === 0) {
      const upgraded = server.upgrade(req, {
        data: this.createSocketData(),
      })
      return upgraded ? undefined : new Response('WebSocket upgrade failed', { status: 400 })
    }

    return this.runMiddlewares(req, server)
  }

  private createSocketData(): InternalSocketData {
    return {
      id: crypto.randomUUID(),
      rooms: new Set<string>(),
      handlers: new Map(),
      context: {},
    }
  }

  private runMiddlewares(req: Request, server: Server<InternalSocketData>): Response | undefined {
    const socketData = this.createSocketData()
    let index = 0

    const runNext = (context?: Record<string, unknown>): void => {
      if (context) {
        Object.assign(socketData.context, context)
      }

      index++

      if (index >= this.middlewares.length) {
        // All middlewares passed — upgrade the connection
        server.upgrade(req, { data: socketData })
        return
      }

      const nextMiddleware = this.middlewares[index]!
      try {
        const result = nextMiddleware(req, runNext)
        if (result instanceof Promise) {
          result.catch(() => {
            // Middleware threw async — reject
          })
        }
      } catch {
        // Middleware threw sync — reject
      }
    }

    // Run first middleware
    try {
      const result = this.middlewares[0]!(req, runNext)
      if (result instanceof Promise) {
        // Async middleware: we need to handle this differently
        // Bun's fetch handler supports returning Response or undefined synchronously
        // For async middlewares, we upgrade inside the promise
        result.catch(() => {
          // Middleware rejected — connection is dropped
        })
        // Return undefined to let the upgrade happen inside the async chain
        return undefined
      }
    } catch {
      return new Response('Unauthorized', { status: 401 })
    }

    return undefined
  }
}
