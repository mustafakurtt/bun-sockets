import type { Server } from 'bun'
import type { EventMap, EventHandler } from '../types/events.types.ts'
import type { BunSocket, NativeWebSocket, InternalSocketData } from '../types/socket.types.ts'

export class SocketWrapper<
  ClientEvents extends EventMap = EventMap,
  ServerEvents extends EventMap = EventMap,
> implements BunSocket<ClientEvents, ServerEvents> {
  private readonly ws: NativeWebSocket
  private readonly server: Server<InternalSocketData>
  private readonly roomRegistry: Map<string, Set<string>>

  constructor(
    ws: NativeWebSocket,
    server: Server<InternalSocketData>,
    roomRegistry: Map<string, Set<string>>,
  ) {
    this.ws = ws
    this.server = server
    this.roomRegistry = roomRegistry
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
    this.ws.send(JSON.stringify({ event, payload }))
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
    return this
  }

  disconnect(code?: number, reason?: string): void {
    this.ws.close(code, reason)
  }
}
