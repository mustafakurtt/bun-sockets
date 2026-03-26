import type { Server } from 'bun'
import type { EventMap, EventHandler } from '../types/events.types.ts'
import type { BunSocket, NativeWebSocket, InternalSocketData, RecoveryMessage } from '../types/socket.types.ts'
import type { HistoryAdapter } from '../types/history.types.ts'
import { encodeBinaryFrame } from './binary.ts'

export class SocketWrapper<
  ClientEvents extends EventMap = EventMap,
  ServerEvents extends EventMap = EventMap,
> implements BunSocket<ClientEvents, ServerEvents> {
  readonly ws: NativeWebSocket
  private readonly server: Server<InternalSocketData>
  private readonly roomRegistry: Map<string, Set<string>>
  private readonly recoveryBuffers: Map<string, RecoveryMessage[]> | null
  private readonly historyAdapter: HistoryAdapter | null
  private readonly maxBufferSize: number

  constructor(
    ws: NativeWebSocket,
    server: Server<InternalSocketData>,
    roomRegistry: Map<string, Set<string>>,
    recoveryBuffers: Map<string, RecoveryMessage[]> | null = null,
    historyAdapter: HistoryAdapter | null = null,
    maxBufferSize = 100,
  ) {
    this.ws = ws
    this.server = server
    this.roomRegistry = roomRegistry
    this.recoveryBuffers = recoveryBuffers
    this.historyAdapter = historyAdapter
    this.maxBufferSize = maxBufferSize
  }

  get id(): string {
    return this.ws.data.id
  }

  get rooms(): ReadonlySet<string> {
    return this.ws.data.rooms
  }

  get data(): Record<string, unknown> {
    return this.ws.data.context
  }

  join(room: string): this {
    this.ws.subscribe(room)
    this.ws.data.rooms.add(room)

    let members = this.roomRegistry.get(room)
    if (!members) {
      members = new Set<string>()
      this.roomRegistry.set(room, members)
    }
    members.add(this.ws.data.id)

    return this
  }

  leave(room: string): this {
    this.ws.unsubscribe(room)
    this.ws.data.rooms.delete(room)

    const members = this.roomRegistry.get(room)
    if (members) {
      members.delete(this.ws.data.id)
      if (members.size === 0) {
        this.roomRegistry.delete(room)
      }
    }

    return this
  }

  leaveAll(): this {
    for (const room of this.ws.data.rooms) {
      this.ws.unsubscribe(room)

      const members = this.roomRegistry.get(room)
      if (members) {
        members.delete(this.ws.data.id)
        if (members.size === 0) {
          this.roomRegistry.delete(room)
        }
      }
    }
    this.ws.data.rooms.clear()
    return this
  }

  emit<K extends keyof ServerEvents & string>(
    event: K,
    payload: ServerEvents[K],
  ): this {
    this.ws.data.seq++
    const seq = this.ws.data.seq

    this.ws.send(JSON.stringify({ event, payload, seq }))

    if (this.recoveryBuffers) {
      const buffer = this.recoveryBuffers.get(this.ws.data.id)
      if (buffer) {
        buffer.push({ seq, event, payload, timestamp: Date.now() })
        if (buffer.length > this.maxBufferSize) {
          buffer.splice(0, buffer.length - this.maxBufferSize)
        }
      }
    }

    return this
  }

  on<K extends keyof ClientEvents & string>(
    event: K,
    handler: EventHandler<ClientEvents[K]>,
  ): this {
    this.ws.data.handlers.set(event, handler as EventHandler)
    return this
  }

  broadcast<K extends keyof ServerEvents & string>(
    room: string,
    event: K,
    payload: ServerEvents[K],
  ): this {
    const message = JSON.stringify({ event, payload })
    this.server.publish(room, message)

    if (this.historyAdapter) {
      try { this.historyAdapter.store(room, event, payload) } catch { /* history store failed — non-fatal */ }
    }

    return this
  }

  emitBinary(event: string, data: ArrayBuffer | Uint8Array): this {
    this.ws.send(encodeBinaryFrame(event, data))
    return this
  }

  onBinary(event: string, handler: (data: ArrayBuffer) => void | Promise<void>): this {
    this.ws.data.binaryHandlers.set(event, handler)
    return this
  }

  disconnect(code?: number, reason?: string): void {
    this.ws.close(code, reason)
  }
}
