import type { ServerWebSocket } from 'bun'
import type { EventMap, EventHandler } from './events.types.ts'

export interface InternalSocketData {
  id: string
  rooms: Set<string>
  handlers: Map<string, EventHandler>
  context: Record<string, unknown>
}

export type NativeWebSocket = ServerWebSocket<InternalSocketData>

export interface BunSocket<
  ClientEvents extends EventMap = EventMap,
  ServerEvents extends EventMap = EventMap,
> {
  readonly id: string
  readonly rooms: ReadonlySet<string>
  readonly data: Record<string, unknown>

  join(room: string): this
  leave(room: string): this
  leaveAll(): this

  emit<K extends keyof ServerEvents & string>(
    event: K,
    payload: ServerEvents[K],
  ): this

  on<K extends keyof ClientEvents & string>(
    event: K,
    handler: EventHandler<ClientEvents[K]>,
  ): this

  broadcast<K extends keyof ServerEvents & string>(
    room: string,
    event: K,
    payload: ServerEvents[K],
  ): this

  disconnect(code?: number, reason?: string): void
}
