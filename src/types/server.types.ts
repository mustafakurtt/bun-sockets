import type { Server } from 'bun'
import type { EventMap } from './events.types.ts'
import type { BunSocket, InternalSocketData, NativeWebSocket } from './socket.types.ts'
import type { HistoryAdapter, HistoryEntry, HistoryQuery } from './history.types.ts'

export interface HeartbeatOptions {
  enabled: boolean
  interval: number
  timeout: number
}

export interface RecoveryOptions {
  enabled: boolean
  maxBufferSize: number
  maxBufferAge: number
}

export interface ServerOptions {
  path?: string
  idleTimeout?: number
  maxPayloadLength?: number
  perMessageDeflate?: boolean
  heartbeat?: boolean | Partial<HeartbeatOptions>
  recovery?: boolean | Partial<RecoveryOptions>
  history?: HistoryAdapter
}

export type MiddlewareNext = (context?: Record<string, unknown>) => void

export type MiddlewareFn = (
  req: Request,
  next: MiddlewareNext,
) => void | Promise<void>

export type ConnectionHandler<
  ClientEvents extends EventMap = EventMap,
  ServerEvents extends EventMap = EventMap,
> = (socket: BunSocket<ClientEvents, ServerEvents>) => void

export type DisconnectHandler<
  ClientEvents extends EventMap = EventMap,
  ServerEvents extends EventMap = EventMap,
> = (socket: BunSocket<ClientEvents, ServerEvents>, code: number, reason: string) => void

export interface RoomEmitter<ServerEvents extends EventMap = EventMap> {
  emit<K extends keyof ServerEvents & string>(
    event: K,
    payload: ServerEvents[K],
  ): void
}

export interface BunSocketServer<
  ClientEvents extends EventMap = EventMap,
  ServerEvents extends EventMap = EventMap,
> {
  on(event: 'connection', handler: ConnectionHandler<ClientEvents, ServerEvents>): this
  on(event: 'disconnect', handler: DisconnectHandler<ClientEvents, ServerEvents>): this

  use(middleware: MiddlewareFn): this

  to(room: string): RoomEmitter<ServerEvents>

  history(room: string, query?: HistoryQuery): HistoryEntry[] | Promise<HistoryEntry[]>

  of<CE extends EventMap, SE extends EventMap>(path: string): {
    on(event: 'connection', handler: ConnectionHandler<CE, SE>): any
    on(event: 'disconnect', handler: DisconnectHandler<CE, SE>): any
    use(middleware: MiddlewareFn): any
    to(room: string): RoomEmitter<SE>
    history(room: string, query?: HistoryQuery): HistoryEntry[] | Promise<HistoryEntry[]>
    readonly rooms: ReadonlyMap<string, ReadonlySet<string>>
    readonly sockets: ReadonlyMap<string, BunSocket<CE, SE>>
    readonly connectionCount: number
  }

  readonly rooms: ReadonlyMap<string, ReadonlySet<string>>
  readonly sockets: ReadonlyMap<string, BunSocket<ClientEvents, ServerEvents>>
  readonly connectionCount: number

  handler: (req: Request, server: Server<InternalSocketData>) => Response | undefined
  websocket: {
    open: (ws: NativeWebSocket) => void
    message: (ws: NativeWebSocket, message: string | Buffer) => void
    close: (ws: NativeWebSocket, code: number, reason: string) => void
  }
}
