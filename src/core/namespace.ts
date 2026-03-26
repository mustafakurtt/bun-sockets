import type { Server } from 'bun'
import type { EventMap } from '../types/events.types.ts'
import type {
  MiddlewareFn,
  ConnectionHandler,
  DisconnectHandler,
  RoomEmitter,
} from '../types/server.types.ts'
import type { HistoryAdapter, HistoryEntry, HistoryQuery } from '../types/history.types.ts'
import type { InternalSocketData, NativeWebSocket, RecoveryMessage } from '../types/socket.types.ts'
import { SocketWrapper } from './socket-wrapper.ts'

export class Namespace<
  ClientEvents extends EventMap = EventMap,
  ServerEvents extends EventMap = EventMap,
> {
  readonly path: string
  private readonly middlewares: MiddlewareFn[] = []
  private readonly connectionHandlers: Set<ConnectionHandler<ClientEvents, ServerEvents>> = new Set()
  private readonly disconnectHandlers: Set<DisconnectHandler<ClientEvents, ServerEvents>> = new Set()
  private readonly socketRegistry: Map<string, SocketWrapper<ClientEvents, ServerEvents>> = new Map()
  private readonly roomRegistry: Map<string, Set<string>> = new Map()
  private readonly historyAdapter: HistoryAdapter | null
  private readonly maxBufferSize: number
  private nativeServer: Server<InternalSocketData> | null = null

  constructor(path: string, historyAdapter: HistoryAdapter | null = null, maxBufferSize = 100) {
    this.path = path
    this.historyAdapter = historyAdapter
    this.maxBufferSize = maxBufferSize
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
        this.nativeServer.publish(room, JSON.stringify({ event, payload }))
        if (this.historyAdapter) { try { this.historyAdapter.store(room, event, payload) } catch { /* non-fatal */ } }
      },
    }
  }

  history(room: string, query?: HistoryQuery): HistoryEntry[] | Promise<HistoryEntry[]> {
    if (!this.historyAdapter) return []
    return this.historyAdapter.getHistory(room, query)
  }

  get rooms(): ReadonlyMap<string, ReadonlySet<string>> { return this.roomRegistry }
  get sockets(): ReadonlyMap<string, SocketWrapper<ClientEvents, ServerEvents>> { return this.socketRegistry }
  get connectionCount(): number { return this.socketRegistry.size }

  /** @internal — called by SocketServer */
  _setServer(server: Server<InternalSocketData>): void { this.nativeServer = server }
  _getMiddlewares(): MiddlewareFn[] { return this.middlewares }

  /** @internal */
  _handleOpen(ws: NativeWebSocket, recoveryBuffers: Map<string, RecoveryMessage[]> | null): void {
    if (!this.nativeServer) return
    const wrapper = new SocketWrapper<ClientEvents, ServerEvents>(
      ws, this.nativeServer, this.roomRegistry, recoveryBuffers, this.historyAdapter, this.maxBufferSize,
    )
    this.socketRegistry.set(ws.data.id, wrapper)
    for (const handler of this.connectionHandlers) handler(wrapper)
  }

  /** @internal */
  _handleClose(ws: NativeWebSocket, code: number, reason: string): void {
    const wrapper = this.socketRegistry.get(ws.data.id)
    if (!wrapper) return

    for (const room of ws.data.rooms) {
      const members = this.roomRegistry.get(room)
      if (members) {
        members.delete(ws.data.id)
        if (members.size === 0) this.roomRegistry.delete(room)
      }
    }

    for (const handler of this.disconnectHandlers) handler(wrapper, code, reason)
    this.socketRegistry.delete(ws.data.id)
  }
}
