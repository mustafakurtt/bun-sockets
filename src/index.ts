import type { EventMap } from './types/events.types.ts'
import type { ServerOptions } from './types/server.types.ts'
import { SocketServer } from './core/socket-server.ts'

export function createServer<
  ClientEvents extends EventMap = EventMap,
  ServerEvents extends EventMap = EventMap,
>(options?: ServerOptions): SocketServer<ClientEvents, ServerEvents> {
  return new SocketServer<ClientEvents, ServerEvents>(options)
}

// Core classes
export { SocketServer } from './core/socket-server.ts'
export { SocketWrapper } from './core/socket-wrapper.ts'
export { Namespace } from './core/namespace.ts'

// Types
export type {
  EventMap,
  EventHandler,
  InferEventPayload,
} from './types/events.types.ts'

export type {
  RecoveryMessage,
  InternalSocketData,
  NativeWebSocket,
  BunSocket,
} from './types/socket.types.ts'

export type {
  ServerOptions,
  HeartbeatOptions,
  RecoveryOptions,
  MiddlewareNext,
  MiddlewareFn,
  ConnectionHandler,
  DisconnectHandler,
  RoomEmitter,
  BunSocketServer,
} from './types/server.types.ts'

// History adapters
export { MemoryAdapter } from './history/memory-adapter.ts'
export { SqliteAdapter } from './history/sqlite-adapter.ts'

export type {
  HistoryEntry,
  HistoryQuery,
  HistoryAdapter,
  MemoryAdapterOptions,
  SqliteAdapterOptions,
} from './types/history.types.ts'
