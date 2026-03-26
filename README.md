# @mustafakurtt/bun-sockets

Bun-native WebSocket server & client with type-safe events, rooms, middleware, auto-reconnect, and zero dependencies.

The Socket.io DX you love, powered by Bun's native C++ WebSocket engine.

[![npm version](https://img.shields.io/npm/v/@mustafakurtt/bun-sockets.svg)](https://www.npmjs.com/package/@mustafakurtt/bun-sockets)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Package?

| | Socket.io | Raw Bun WS | **bun-sockets** |
|--|-----------|------------|-----------------|
| **Speed** | ❌ Engine.io overhead | ✅ Native C++ | ✅ Native C++ |
| **Bundle size** | ~100 KB | 0 KB | **~13 KB** (server + client) |
| **Type-safe events** | ⚠️ Manual generics | ❌ None | ✅ Built-in |
| **Rooms** | ✅ Built-in | ❌ DIY | ✅ Built-in |
| **Middleware** | ✅ After handshake | ❌ DIY | ✅ Before handshake |
| **Dependencies** | 17+ packages | 0 | **0** |
| **Auto-reconnect** | ✅ Built-in | ❌ DIY | ✅ Built-in |
| **Event buffering** | ❌ None | ❌ None | ✅ Built-in |
| **Bun-native** | ❌ Node.js polyfills | ✅ | ✅ |

**bun-sockets** sits in the sweet spot: Socket.io's developer experience with Bun's raw performance, zero dependencies, and full TypeScript support.

## Install

```bash
bun add @mustafakurtt/bun-sockets
```

## Quick Start

```typescript
import { createServer } from '@mustafakurtt/bun-sockets'

const io = createServer()

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`)

  socket
    .join('general')
    .emit('welcome', { message: 'Hello!' })

  socket.on('chat_message', (payload) => {
    socket.broadcast('general', 'new_message', {
      from: socket.id,
      text: payload.text,
    })
  })
})

io.on('disconnect', (socket, code, reason) => {
  console.log(`Disconnected: ${socket.id} (${code})`)
})

Bun.serve({
  port: 3000,
  fetch: io.handler,
  websocket: io.websocket,
})

console.log('🚀 Server running on ws://localhost:3000/ws')
```

## Client

The client works in both **browser** and **Bun** environments:

```typescript
import { createClient } from '@mustafakurtt/bun-sockets/client'

const socket = createClient({ url: 'ws://localhost:3000' })

socket
  .on('welcome', (payload) => {
    console.log(payload.message) // 'Hello!'
  })
  .on('new_message', (payload) => {
    console.log(`${payload.from}: ${payload.text}`)
  })
  .onConnect(() => console.log('Connected!'))
  .onDisconnect((code) => console.log(`Disconnected: ${code}`))
  .onReconnect((attempt) => console.log(`Reconnected after ${attempt} attempts`))
  .connect()

// Send events to server
socket.emit('chat_message', { text: 'Hello everyone!' })
```

### Shared Type Safety (Server + Client)

Define event contracts once, share between server and client — **full autocomplete on both sides**:

```typescript
// shared/events.ts
export type ClientEvents = {
  send_message: { text: string; roomId: string }
  join_room: { roomId: string }
}

export type ServerEvents = {
  new_message: { user: string; text: string; timestamp: number }
  user_joined: { userId: string; roomId: string }
}
```

```typescript
// server.ts
import { createServer } from '@mustafakurtt/bun-sockets'
import type { ClientEvents, ServerEvents } from './shared/events'

const io = createServer<ClientEvents, ServerEvents>()

io.on('connection', (socket) => {
  socket.on('send_message', (payload) => {
    // ✅ payload is { text: string; roomId: string }
    io.to(payload.roomId).emit('new_message', {
      user: socket.id,
      text: payload.text,
      timestamp: Date.now(),
    })
  })
})
```

```typescript
// client.ts
import { createClient } from '@mustafakurtt/bun-sockets/client'
import type { ClientEvents, ServerEvents } from './shared/events'

const socket = createClient<ClientEvents, ServerEvents>({
  url: 'ws://localhost:3000'
})

socket.on('new_message', (payload) => {
  // ✅ payload is { user: string; text: string; timestamp: number }
  console.log(`${payload.user}: ${payload.text}`)
})

socket.emit('send_message', { text: 'Hello!', roomId: 'general' })
// ❌ TypeScript error: socket.emit('invalid_event', {})
```

## Type-Safe Events

Define your event contracts once, get full IDE autocomplete and compile-time checks everywhere:

```typescript
import { createServer } from '@mustafakurtt/bun-sockets'

type ClientEvents = {
  send_message: { text: string; roomId: string }
  join_room: { roomId: string }
}

type ServerEvents = {
  new_message: { user: string; text: string; timestamp: number }
  user_joined: { userId: string; roomId: string }
}

const io = createServer<ClientEvents, ServerEvents>()

io.on('connection', (socket) => {
  // ✅ IDE knows payload is { text: string; roomId: string }
  socket.on('send_message', (payload) => {
    io.to(payload.roomId).emit('new_message', {
      user: socket.id,
      text: payload.text,        // ← autocomplete works
      timestamp: Date.now(),
    })
  })

  // ❌ TypeScript error: 'invalid_event' doesn't exist in ClientEvents
  // socket.on('invalid_event', () => {})
})
```

## Rooms

Rooms are powered by Bun's native `publish/subscribe` — no polling, no overhead:

```typescript
io.on('connection', (socket) => {
  // Fluent API — chain as many as you want
  socket
    .join('global-chat')
    .join('vip-lounge')
    .join(`user-${socket.id}`)

  // Leave a specific room
  socket.leave('vip-lounge')

  // Leave all rooms at once
  socket.leaveAll()

  // Check which rooms this socket is in
  console.log(socket.rooms) // ReadonlySet<string>
})

// Broadcast to a room from server level
io.to('global-chat').emit('announcement', { text: 'Server restarting in 5 min' })

// Broadcast to a room from a socket (all subscribers receive it)
socket.broadcast('global-chat', 'new_message', { from: socket.id, text: 'Hi!' })

// Inspect rooms
console.log(io.rooms)           // Map<roomName, Set<socketId>>
console.log(io.connectionCount) // number
console.log(io.sockets)         // Map<socketId, BunSocket>
```

## Middleware (Authentication)

Middleware runs **at HTTP upgrade** — before the WebSocket handshake. If auth fails, the socket never opens, saving server resources:

```typescript
io.use(async (req, next) => {
  const token = req.headers.get('authorization')?.split(' ')[1]

  if (!token) {
    throw new Error('No token provided') // → HTTP 401, socket never opens
  }

  const user = await verifyJWT(token)

  if (!user) {
    throw new Error('Invalid token')
  }

  // Pass data to socket.data
  next({ userId: user.id, role: user.role })
})

io.on('connection', (socket) => {
  // Access middleware data
  console.log(socket.data.userId) // 'user-123'
  console.log(socket.data.role)   // 'admin'
})
```

Multiple middlewares run in order — each can enrich `socket.data`:

```typescript
io.use(async (req, next) => {
  const user = await authenticate(req)
  next({ user })
})

io.use(async (req, next) => {
  const permissions = await loadPermissions(req)
  next({ permissions })
})

io.on('connection', (socket) => {
  // Both middleware results available
  console.log(socket.data.user)
  console.log(socket.data.permissions)
})
```

## Server Options

```typescript
const io = createServer({
  path: '/ws',                    // WebSocket endpoint path (default: '/ws')
  idleTimeout: 120,               // Seconds before idle socket is dropped (default: 120)
  maxPayloadLength: 16 * 1024 * 1024, // Max message size in bytes (default: 16 MB)
  perMessageDeflate: false,       // Enable compression (default: false)
  heartbeat: true,                // Enable heartbeat (default: true)
  // heartbeat: {                 // Or fine-tune:
  //   interval: 25000,           //   Ping interval in ms (default: 25000)
  //   timeout: 10000,            //   Max wait for pong before close (default: 10000)
  // },
  recovery: true,                 // Enable connection state recovery (default: true)
  // recovery: {                  // Or fine-tune:
  //   maxBufferSize: 100,        //   Messages to keep per socket (default: 100)
  //   maxBufferAge: 30000,       //   Buffer TTL after disconnect in ms (default: 30000)
  // },
})
```

### Heartbeat / Ping-Pong

The server automatically sends `__system:ping` messages to all connected sockets at the configured interval. The client **automatically responds** with `__system:pong`. If a socket fails to respond within the timeout window, the server closes it with code `4000` (heartbeat timeout).

```
Server ──[__system:ping]──▶ Client
Server ◀──[__system:pong]── Client   ✅ alive

Server ──[__system:ping]──▶ Client
         ... no pong ...             ❌ close(4000)
```

The client also detects stale connections: if no ping is received for an extended period, it closes the connection and triggers auto-reconnect.

```typescript
const io = createServer({
  heartbeat: {
    interval: 15000,   // Send ping every 15s
    timeout: 5000,     // Allow 5s for pong response
  },
})
```

Disable heartbeat entirely:
```typescript
const io = createServer({ heartbeat: false })
```

### Connection State Recovery

When a client disconnects and reconnects, the server can **replay missed messages** automatically. Each emitted message carries a sequence number (`seq`). On reconnect, the client sends its last known `seq` and the server replays everything after it.

```
1. Client receives messages with seq: 1, 2, 3
2. Connection drops at seq 3
3. Server continues buffering: seq 4, 5
4. Client reconnects → sends __system:recover { lastSeq: 3 }
5. Server replays seq 4, 5 → sends __system:recovery_complete
```

This is **fully automatic** when both heartbeat and recovery are enabled (the defaults). No code changes needed.

```typescript
// Fine-tune recovery buffer
const io = createServer({
  recovery: {
    maxBufferSize: 200,    // Keep last 200 messages per socket
    maxBufferAge: 60000,   // Keep buffer for 60s after disconnect
  },
})
```

Disable recovery:
```typescript
const io = createServer({ recovery: false })
```

### History Adapters

Store room message history with pluggable adapters. Two built-in adapters: **MemoryAdapter** (in-memory, great for dev) and **SqliteAdapter** (persistent, powered by `bun:sqlite`).

```typescript
import { createServer, MemoryAdapter, SqliteAdapter } from '@mustafakurtt/bun-sockets'

// In-memory (development)
const io = createServer({
  history: new MemoryAdapter({ maxPerRoom: 1000 }),
})

// SQLite (production — persistent, WAL mode)
const io = createServer({
  history: new SqliteAdapter({
    path: './chat-history.db',  // ':memory:' for in-memory SQLite
    maxPerRoom: 10000,
  }),
})
```

**Automatic storage** — messages sent via `io.to(room).emit()` and `socket.broadcast()` are automatically stored.

**Query history with pagination:**

```typescript
// Latest 50 messages (default)
const messages = await io.history('chat-room')

// Paginate — get older messages
const page1 = await io.history('chat-room', { limit: 20 })
const page2 = await io.history('chat-room', {
  limit: 20,
  before: page1[page1.length - 1].timestamp,
})

// Filter by event type
const chatOnly = await io.history('chat-room', { event: 'chat_message' })

// Ascending order
const oldest = await io.history('chat-room', { order: 'asc', limit: 10 })
```

**HistoryQuery options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `limit` | `number` | `50` | Max entries to return |
| `before` | `number` | — | Return entries before this timestamp |
| `after` | `number` | — | Return entries after this timestamp |
| `order` | `'asc' \| 'desc'` | `'desc'` | Sort order by timestamp |
| `event` | `string` | — | Filter by event name |

**Custom adapter** — implement the `HistoryAdapter` interface:

```typescript
import type { HistoryAdapter } from '@mustafakurtt/bun-sockets'

class RedisAdapter implements HistoryAdapter {
  store(room, event, payload) { /* ... */ }
  getHistory(room, query?) { /* ... */ }
  clear(room) { /* ... */ }
  clearAll() { /* ... */ }
}
```

## Client Options

```typescript
const socket = createClient({
  url: 'ws://localhost:3000',     // Server URL (required)
  path: '/ws',                    // WebSocket endpoint path (default: '/ws')
  reconnect: true,                // Enable auto-reconnect (default: true)
  // reconnect: {                 // Or fine-tune:
  //   maxRetries: 10,            //   Max reconnection attempts (default: 10)
  //   baseDelay: 1000,           //   Initial delay in ms (default: 1000)
  //   maxDelay: 30000,           //   Max delay in ms (default: 30000)
  //   jitter: true,              //   Add randomness to prevent thundering herd (default: true)
  // },
  auth: { token: 'jwt-token' },   // Auth params sent as query string (default: {})
  bufferMessages: true,           // Buffer messages sent while disconnected (default: true)
  maxBufferSize: 100,             // Max buffered messages (default: 100)
  protocols: [],                  // WebSocket sub-protocols (default: [])
})
```

### Auto-Reconnect

When the connection drops unexpectedly, the client automatically reconnects with **exponential backoff** and **jitter**:

```
Attempt 1: ~1000ms delay
Attempt 2: ~2000ms delay
Attempt 3: ~4000ms delay
Attempt 4: ~8000ms delay
...capped at maxDelay (30s)
```

Jitter adds ±25% randomness to each delay, preventing all clients from reconnecting at the exact same time (thundering herd problem).

```typescript
const socket = createClient({
  url: 'ws://localhost:3000',
  reconnect: { maxRetries: 5, baseDelay: 500 },
})

socket
  .onReconnect((attempt) => console.log(`Reconnected on attempt ${attempt}`))
  .onReconnectFailed(() => console.log('All reconnection attempts exhausted'))
  .connect()
```

### Event Buffering

Messages sent while disconnected are queued and **automatically flushed** when the connection is restored:

```typescript
const socket = createClient({ url: 'ws://localhost:3000' })

// These are buffered — not lost
socket.emit('message', { text: 'sent while offline 1' })
socket.emit('message', { text: 'sent while offline 2' })

socket.connect()
// → on connect, both messages are delivered in order
```

## API Reference

### `createServer<ClientEvents, ServerEvents>(options?)`

Creates a new WebSocket server instance.

### Server (`io`)

| Method / Property | Description |
|-------------------|-------------|
| `io.on('connection', handler)` | Handle new connections |
| `io.on('disconnect', handler)` | Handle disconnections |
| `io.use(middleware)` | Add middleware (runs at HTTP upgrade) |
| `io.to(room).emit(event, data)` | Broadcast to all sockets in a room |
| `io.rooms` | `ReadonlyMap<string, ReadonlySet<string>>` — all rooms |
| `io.sockets` | `ReadonlyMap<string, BunSocket>` — all connected sockets |
| `io.connectionCount` | Number of connected sockets |
| `io.handler` | Pass to `Bun.serve({ fetch })` |
| `io.websocket` | Pass to `Bun.serve({ websocket })` |

### Socket (`socket`)

| Method / Property | Description |
|-------------------|-------------|
| `socket.id` | Unique socket identifier (UUID) |
| `socket.rooms` | `ReadonlySet<string>` — rooms this socket is in |
| `socket.data` | `Record<string, unknown>` — middleware context |
| `socket.join(room)` | Subscribe to a room (fluent) |
| `socket.leave(room)` | Unsubscribe from a room (fluent) |
| `socket.leaveAll()` | Leave all rooms (fluent) |
| `socket.emit(event, payload)` | Send event to this socket only (fluent) |
| `socket.on(event, handler)` | Listen for client events (fluent) |
| `socket.broadcast(room, event, payload)` | Publish to all sockets in a room (fluent) |
| `socket.disconnect(code?, reason?)` | Close the connection |

### Middleware

```typescript
type MiddlewareFn = (req: Request, next: MiddlewareNext) => void | Promise<void>
type MiddlewareNext = (context?: Record<string, unknown>) => void
```

### `createClient<ClientEvents, ServerEvents>(options)`

Creates a new WebSocket client instance.

### Client (`socket`)

| Method / Property | Description |
|-------------------|-------------|
| `socket.id` | Socket ID (null until connected) |
| `socket.state` | `'disconnected'` \| `'connecting'` \| `'connected'` \| `'reconnecting'` |
| `socket.connected` | `true` if currently connected |
| `socket.connect()` | Open the WebSocket connection (fluent) |
| `socket.disconnect(code?, reason?)` | Close the connection (fluent) |
| `socket.emit(event, payload)` | Send event to server (fluent, buffered) |
| `socket.on(event, handler)` | Listen for server events (fluent) |
| `socket.off(event, handler?)` | Remove event handler(s) (fluent) |
| `socket.onConnect(handler)` | Connection opened callback (fluent) |
| `socket.onDisconnect(handler)` | Connection closed callback (fluent) |
| `socket.onReconnect(handler)` | Successful reconnection callback (fluent) |
| `socket.onReconnectFailed(handler)` | All retries exhausted callback (fluent) |
| `socket.onError(handler)` | WebSocket error callback (fluent) |

## Wire Protocol

Messages between client and server use a simple JSON protocol:

```json
{ "event": "event_name", "payload": { ... } }
```

**Client → Server example:**
```javascript
ws.send(JSON.stringify({ event: 'chat_message', payload: { text: 'Hello!' } }))
```

**Server → Client example (received):**
```json
{ "event": "new_message", "payload": { "from": "uuid", "text": "Hello!" } }
```

## Requirements

- **Bun** >= 1.0.0

> This package uses Bun's native WebSocket server. It does not work with Node.js.

## Roadmap

- [x] ~~Client package~~ — auto-reconnect, backoff, event buffering, type-safe ✅
- [x] ~~Heartbeat / ping-pong~~ — zombie socket detection and cleanup ✅
- [x] ~~Connection State Recovery~~ — replay missed messages after reconnect ✅
- [x] ~~History adapters (Memory + bun:sqlite)~~ — room message history with pagination ✅
- [ ] Namespace support — multiple endpoints on one server
- [ ] Binary message support — ArrayBuffer / Uint8Array

## License

[MIT](./LICENSE) — Mustafa Kurt
