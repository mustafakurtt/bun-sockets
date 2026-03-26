# Changelog

All notable changes to this project will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
