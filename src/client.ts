import type { EventMap } from './types/events.types.ts'
import type { ClientOptions } from './types/client.types.ts'
import { SocketClient } from './client/socket-client.ts'

export function createClient<
  ClientEvents extends EventMap = EventMap,
  ServerEvents extends EventMap = EventMap,
>(options: ClientOptions): SocketClient<ClientEvents, ServerEvents> {
  return new SocketClient<ClientEvents, ServerEvents>(options)
}

// Client class
export { SocketClient } from './client/socket-client.ts'

// Client types
export type {
  ClientOptions,
  ResolvedClientOptions,
  ReconnectOptions,
  ConnectionState,
  LifecycleHandlers,
  BufferedMessage,
  BunSocketClient,
} from './types/client.types.ts'

// Shared types
export type {
  EventMap,
  EventHandler,
  InferEventPayload,
} from './types/events.types.ts'
