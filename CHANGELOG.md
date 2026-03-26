# Changelog

All notable changes to this project will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.0] — 2026-03-26

### Added
- **History Adapters** — pluggable room message history with pagination support
- **`MemoryAdapter`** — in-memory history storage, configurable `maxPerRoom` (default: 1000)
- **`SqliteAdapter`** — persistent history via `bun:sqlite`, WAL mode, auto-indexed, configurable `maxPerRoom` (default: 10000)
- **`HistoryAdapter` interface** — implement `store`, `getHistory`, `clear`, `clearAll` for custom adapters (e.g. Redis)
- **`io.history(room, query?)`** — query room history with pagination, filtering, and ordering
- **`HistoryQuery`** — `limit`, `before`, `after`, `order`, `event` filter options
- **Automatic history storage** — messages from `io.to(room).emit()` and `socket.broadcast()` are auto-stored
- **`HistoryEntry`** — `{ id, room, event, payload, timestamp }` with UUID per entry
- `MemoryAdapterOptions` and `SqliteAdapterOptions` types exported
- 32 new integration tests — MemoryAdapter (13) + SqliteAdapter (14) + Server integration (5)

### Changed
- `ServerOptions` now accepts optional `history` adapter
- `BunSocketServer` interface includes `history()` method
- `SocketWrapper` receives and uses history adapter for `broadcast()` auto-storage
- tsup config: `bun:sqlite` marked as external (Bun runtime provides it)

## [0.3.0] — 2026-03-26

### Added
- **Heartbeat / Ping-Pong** — server sends periodic `__system:ping`, detects and closes zombie sockets
- **`heartbeat`** option — `{ interval: 25000, timeout: 10000 }` defaults, fully configurable or `false` to disable
- **Client auto-pong** — client automatically responds to `__system:ping` with `__system:pong`
- **Stale connection detection** — client closes connection if no pings received for extended period, triggers reconnect
- **Connection State Recovery** — server buffers outgoing messages with sequence numbers per socket
- **`recovery`** option — `{ maxBufferSize: 100, maxBufferAge: 30000 }` defaults, configurable or `false` to disable
- **Automatic recovery on reconnect** — client sends `__system:recover` with `lastSeq`, server replays missed messages
- **`__system:recovery_complete`** — server notifies client when replay is done
- **`__system:recovery_failed`** — server notifies when buffer expired or not found
- **Buffer auto-cleanup** — recovery buffers are automatically purged after `maxBufferAge` post-disconnect
- **`seq` field** on all emitted messages — monotonically increasing per socket
- `HeartbeatOptions` and `RecoveryOptions` types exported
- 11 new integration tests — heartbeat (5) + recovery (6)

### Changed
- `InternalSocketData` now includes `lastPong` and `seq` fields
- `SocketWrapper.ws` is now `readonly` (public) for internal heartbeat access
- `SocketWrapper.emit()` now increments `seq` and writes to recovery buffer when enabled
- Server defaults: heartbeat and recovery are **enabled by default** — zero-config for most use cases

## [0.2.0] — 2026-03-26

### Added
- **Client Package** — `@mustafakurtt/bun-sockets/client` separate entry point
- **`createClient<ClientEvents, ServerEvents>(options)`** — type-safe factory for WebSocket client
- **Auto-Reconnect** — exponential backoff with configurable `maxRetries`, `baseDelay`, `maxDelay`
- **Jitter** — ±25% randomness on reconnect delays to prevent thundering herd
- **Event Buffering** — messages sent while disconnected are queued and flushed on reconnect
- **`maxBufferSize`** — configurable buffer limit (default: 100), oldest messages dropped when full
- **Lifecycle Hooks** — `onConnect`, `onDisconnect`, `onReconnect`, `onReconnectFailed`, `onError`
- **`socket.off(event, handler?)`** — remove specific or all handlers for an event
- **`socket.state`** — `'disconnected'` | `'connecting'` | `'connected'` | `'reconnecting'`
- **`socket.connected`** — boolean shorthand for state check
- **Auth Support** — `auth: { token: '...' }` sent as query string parameters
- **`protocols`** — WebSocket sub-protocol support
- **Fluent API** — all client methods return `this` for chaining
- Client types: `ClientOptions`, `ReconnectOptions`, `ConnectionState`, `BunSocketClient`
- 25 client integration tests — connect, disconnect, emit, on/off, buffering, reconnect, auth, generics
- Dual entry build: `dist/index.js` (server) + `dist/client.js` (client)

### Changed
- `package.json` exports now include `./client` subpath
- tsup config updated for dual entry points
- README expanded with full client documentation, shared type-safety examples, comparison table updates

## [0.1.0] — 2026-03-26

### Added
- **Core WebSocket Server** — `createServer()` factory with full Bun-native WebSocket integration
- **Type-Safe Events** — `createServer<ClientEvents, ServerEvents>()` with compile-time event/payload validation
- **Room Management** — `socket.join()`, `socket.leave()`, `socket.leaveAll()` powered by Bun's native pub/sub topics
- **Server Broadcasting** — `io.to(room).emit(event, payload)` for room-level messaging
- **Socket Broadcasting** — `socket.broadcast(room, event, payload)` from individual sockets
- **Middleware System** — `io.use()` runs at HTTP upgrade (before handshake), supports async and chaining
- **Socket Context** — middleware can pass data via `next({ key: value })`, accessible on `socket.data`
- **Socket Registry** — `io.sockets`, `io.rooms`, `io.connectionCount` for server introspection
- **Fluent API** — all socket methods return `this` for chaining
- **Per-Socket Event Handlers** — `socket.on(event, handler)` inside connection callback (not global)
- **Wire Protocol** — simple `{ event, payload }` JSON format
- **Server Options** — configurable `path`, `idleTimeout`, `maxPayloadLength`, `perMessageDeflate`
- `SocketServer`, `SocketWrapper` classes with full TypeScript generics
- `BunSocket`, `BunSocketServer`, `EventMap`, `MiddlewareFn` type exports
- 26 integration tests — connection, disconnect, emit, rooms, middleware, type-safety
- Zero dependencies — only Bun's built-in APIs
