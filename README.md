# @mustafakurtt/bun-sockets

Bun-native WebSocket server with type-safe events, rooms, middleware, and zero dependencies.

The Socket.io DX you love, powered by Bun's native C++ WebSocket engine.

[![npm version](https://img.shields.io/npm/v/@mustafakurtt/bun-sockets.svg)](https://www.npmjs.com/package/@mustafakurtt/bun-sockets)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Package?

| | Socket.io | Raw Bun WS | **bun-sockets** |
|--|-----------|------------|-----------------|
| **Speed** | ❌ Engine.io overhead | ✅ Native C++ | ✅ Native C++ |
| **Bundle size** | ~100 KB | 0 KB | **~6 KB** |
| **Type-safe events** | ⚠️ Manual generics | ❌ None | ✅ Built-in |
| **Rooms** | ✅ Built-in | ❌ DIY | ✅ Built-in |
| **Middleware** | ✅ After handshake | ❌ DIY | ✅ Before handshake |
| **Dependencies** | 17+ packages | 0 | **0** |
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
})
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

- [ ] Client package (`@mustafakurtt/bun-sockets/client`) — auto-reconnect, backoff, type-safe
- [ ] Heartbeat / ping-pong — zombie socket cleanup
- [ ] Connection State Recovery — resume missed messages after refresh
- [ ] History adapters (Memory + bun:sqlite) — room message history with pagination
- [ ] Namespace support — multiple endpoints on one server
- [ ] Binary message support — ArrayBuffer / Uint8Array

## License

[MIT](./LICENSE) — Mustafa Kurt
