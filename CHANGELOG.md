# Changelog

All notable changes to this project will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
