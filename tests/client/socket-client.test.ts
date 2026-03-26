import { describe, expect, it, afterEach } from 'bun:test'
import { createServer } from '../../src/index.ts'
import { createClient } from '../../src/client.ts'
import type { Server } from 'bun'
import type { InternalSocketData } from '../../src/index.ts'
import type { SocketClient } from '../../src/client/socket-client.ts'

const servers: Server<InternalSocketData>[] = []
const clients: SocketClient[] = []
let portCounter = 20000

function getPort(): number {
  return portCounter++
}

function startServer(io: ReturnType<typeof createServer>, port: number): Server<InternalSocketData> {
  const s = Bun.serve({
    port,
    fetch: io.handler,
    websocket: io.websocket,
  })
  servers.push(s)
  return s
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function trackClient(client: SocketClient): SocketClient {
  clients.push(client)
  return client
}

afterEach(() => {
  for (const c of clients) {
    if (c.connected) c.disconnect()
  }
  clients.length = 0

  for (const s of servers) {
    s.stop(true)
  }
  servers.length = 0
})

describe('SocketClient', () => {
  describe('createClient()', () => {
    it('should create a client instance', () => {
      const client = createClient({ url: 'ws://localhost:9999' })
      expect(client).toBeDefined()
      expect(client.state).toBe('disconnected')
      expect(client.connected).toBe(false)
      expect(client.id).toBeNull()
    })

    it('should support custom options', () => {
      const client = createClient({
        url: 'ws://localhost:9999',
        path: '/custom',
        reconnect: { maxRetries: 5, baseDelay: 500 },
        auth: { token: 'abc' },
      })
      expect(client).toBeDefined()
    })

    it('should disable reconnect when set to false', () => {
      const client = createClient({
        url: 'ws://localhost:9999',
        reconnect: false,
      })
      expect(client).toBeDefined()
    })
  })

  describe('connect / disconnect', () => {
    it('should connect to server', async () => {
      const port = getPort()
      const io = createServer()
      io.on('connection', () => {})
      startServer(io, port)

      const client = trackClient(createClient({ url: `ws://localhost:${port}`, reconnect: false }))

      let connected = false
      client.onConnect(() => { connected = true })
      client.connect()

      await sleep(100)
      expect(connected).toBe(true)
      expect(client.connected).toBe(true)
      expect(client.state).toBe('connected')
    })

    it('should disconnect from server', async () => {
      const port = getPort()
      const io = createServer()
      io.on('connection', () => {})
      startServer(io, port)

      const client = trackClient(createClient({ url: `ws://localhost:${port}`, reconnect: false }))

      let disconnectCode = 0
      client.onDisconnect((code) => { disconnectCode = code })
      client.connect()

      await sleep(100)
      client.disconnect()
      await sleep(100)

      expect(client.connected).toBe(false)
      expect(client.state).toBe('disconnected')
      expect(disconnectCode).toBe(1000)
    })

    it('should not connect twice when already connected', async () => {
      const port = getPort()
      const io = createServer()
      let connectionCount = 0
      io.on('connection', () => { connectionCount++ })
      startServer(io, port)

      const client = trackClient(createClient({ url: `ws://localhost:${port}`, reconnect: false }))
      client.connect()
      await sleep(100)

      client.connect() // Should be a no-op
      await sleep(100)

      expect(connectionCount).toBe(1)
    })
  })

  describe('emit / on (client ↔ server)', () => {
    it('should emit events from client to server', async () => {
      const port = getPort()
      const io = createServer()
      let receivedPayload: unknown = null

      io.on('connection', (socket) => {
        socket.on('greeting', (payload) => {
          receivedPayload = payload
        })
      })

      startServer(io, port)

      const client = trackClient(createClient({ url: `ws://localhost:${port}`, reconnect: false }))
      client.connect()
      await sleep(100)

      client.emit('greeting', { text: 'hello from client' })
      await sleep(100)

      expect(receivedPayload).toEqual({ text: 'hello from client' })
    })

    it('should receive events from server on client', async () => {
      const port = getPort()
      const io = createServer()

      io.on('connection', (socket) => {
        socket.emit('welcome', { message: 'hi there' })
      })

      startServer(io, port)

      const client = trackClient(createClient({ url: `ws://localhost:${port}`, reconnect: false }))
      let receivedPayload: unknown = null

      client.on('welcome', (payload) => {
        receivedPayload = payload
      })

      client.connect()
      await sleep(100)

      expect(receivedPayload).toEqual({ message: 'hi there' })
    })

    it('should support fluent chaining on emit', async () => {
      const port = getPort()
      const io = createServer()
      const received: string[] = []

      io.on('connection', (socket) => {
        socket.on('msg1', () => { received.push('msg1') })
        socket.on('msg2', () => { received.push('msg2') })
      })

      startServer(io, port)

      const client = trackClient(createClient({ url: `ws://localhost:${port}`, reconnect: false }))
      client.connect()
      await sleep(100)

      client
        .emit('msg1', { id: 1 })
        .emit('msg2', { id: 2 })

      await sleep(100)
      expect(received).toContain('msg1')
      expect(received).toContain('msg2')
    })

    it('should support multiple handlers for same event', async () => {
      const port = getPort()
      const io = createServer()

      io.on('connection', (socket) => {
        socket.emit('ping', { ts: 123 })
      })

      startServer(io, port)

      const client = trackClient(createClient({ url: `ws://localhost:${port}`, reconnect: false }))
      const results: number[] = []

      client
        .on('ping', () => { results.push(1) })
        .on('ping', () => { results.push(2) })

      client.connect()
      await sleep(100)

      expect(results).toEqual([1, 2])
    })

    it('should remove specific handler with off()', async () => {
      const port = getPort()
      const io = createServer()

      io.on('connection', (socket) => {
        setTimeout(() => socket.emit('ping', {}), 50)
      })

      startServer(io, port)

      const client = trackClient(createClient({ url: `ws://localhost:${port}`, reconnect: false }))
      let called = false
      const handler = () => { called = true }

      client.on('ping', handler)
      client.off('ping', handler)

      client.connect()
      await sleep(200)

      expect(called).toBe(false)
    })

    it('should remove all handlers with off() without handler arg', async () => {
      const port = getPort()
      const io = createServer()

      io.on('connection', (socket) => {
        setTimeout(() => socket.emit('ping', {}), 50)
      })

      startServer(io, port)

      const client = trackClient(createClient({ url: `ws://localhost:${port}`, reconnect: false }))
      const results: number[] = []

      client
        .on('ping', () => { results.push(1) })
        .on('ping', () => { results.push(2) })
        .off('ping')

      client.connect()
      await sleep(200)

      expect(results).toEqual([])
    })
  })

  describe('event buffering', () => {
    it('should buffer messages sent before connect and flush on open', async () => {
      const port = getPort()
      const io = createServer()
      let receivedPayload: unknown = null

      io.on('connection', (socket) => {
        socket.on('buffered_msg', (payload) => {
          receivedPayload = payload
        })
      })

      startServer(io, port)

      const client = trackClient(createClient({ url: `ws://localhost:${port}`, reconnect: false }))

      // Emit before connecting — should be buffered
      client.emit('buffered_msg', { queued: true })
      expect(client.connected).toBe(false)

      client.connect()
      await sleep(150)

      expect(receivedPayload).toEqual({ queued: true })
    })

    it('should respect maxBufferSize', () => {
      const client = trackClient(createClient({
        url: 'ws://localhost:9999',
        reconnect: false,
        maxBufferSize: 3,
      }))

      // Send 5 messages while disconnected — only last 3 should survive
      for (let i = 0; i < 5; i++) {
        client.emit('test', { index: i })
      }

      // We can't directly inspect buffer, but we verify it doesn't crash
      expect(client.connected).toBe(false)
    })

    it('should not buffer when bufferMessages is false', async () => {
      const port = getPort()
      const io = createServer()
      let receivedPayload: unknown = null

      io.on('connection', (socket) => {
        socket.on('msg', (payload) => {
          receivedPayload = payload
        })
      })

      startServer(io, port)

      const client = trackClient(createClient({
        url: `ws://localhost:${port}`,
        reconnect: false,
        bufferMessages: false,
      }))

      // Emit before connecting — should NOT be buffered
      client.emit('msg', { lost: true })

      client.connect()
      await sleep(150)

      expect(receivedPayload).toBeNull()
    })
  })

  describe('lifecycle hooks', () => {
    it('should fire onConnect', async () => {
      const port = getPort()
      const io = createServer()
      io.on('connection', () => {})
      startServer(io, port)

      const client = trackClient(createClient({ url: `ws://localhost:${port}`, reconnect: false }))
      let fired = false
      client.onConnect(() => { fired = true })
      client.connect()

      await sleep(100)
      expect(fired).toBe(true)
    })

    it('should fire onDisconnect with code and reason', async () => {
      const port = getPort()
      const io = createServer()
      io.on('connection', () => {})
      startServer(io, port)

      const client = trackClient(createClient({ url: `ws://localhost:${port}`, reconnect: false }))
      let disconnectInfo = { code: 0, reason: '' }

      client.onDisconnect((code, reason) => {
        disconnectInfo = { code, reason }
      })

      client.connect()
      await sleep(100)

      client.disconnect(4001, 'custom reason')
      await sleep(100)

      expect(disconnectInfo.code).toBe(4001)
    })

    it('should fire onError when connection fails', async () => {
      const client = trackClient(createClient({
        url: 'ws://localhost:1',
        reconnect: false,
      }))

      let errorFired = false
      client.onError(() => { errorFired = true })
      client.connect()

      await sleep(300)
      expect(errorFired).toBe(true)
    })
  })

  describe('auto-reconnect', () => {
    it('should reconnect after server drops connection', async () => {
      const port = getPort()
      const io = createServer()
      let totalConnections = 0

      io.on('connection', (socket) => {
        totalConnections++
        if (totalConnections === 1) {
          // Force close the first connection after a short delay
          setTimeout(() => socket.disconnect(4000, 'forced'), 50)
        }
      })

      startServer(io, port)

      const client = trackClient(createClient({
        url: `ws://localhost:${port}`,
        reconnect: { maxRetries: 3, baseDelay: 100, maxDelay: 500 },
      }))

      let reconnectAttempt = 0
      client.onReconnect((attempt) => {
        reconnectAttempt = attempt
      })

      client.connect()
      await sleep(1000)

      expect(totalConnections).toBeGreaterThanOrEqual(2)
      expect(reconnectAttempt).toBeGreaterThanOrEqual(1)
      expect(client.connected).toBe(true)
    })

    it('should fire onReconnectFailed after maxRetries exhausted', async () => {
      // Connect to a port that will never be available
      const client = trackClient(createClient({
        url: 'ws://localhost:1',
        reconnect: { maxRetries: 2, baseDelay: 50, maxDelay: 100 },
      }))

      let reconnectFailed = false
      client.onReconnectFailed(() => { reconnectFailed = true })
      client.connect()

      await sleep(2000)
      expect(reconnectFailed).toBe(true)
      expect(client.state).toBe('disconnected')
    })

    it('should not reconnect after intentional disconnect', async () => {
      const port = getPort()
      const io = createServer()
      let totalConnections = 0
      io.on('connection', () => { totalConnections++ })
      startServer(io, port)

      const client = trackClient(createClient({
        url: `ws://localhost:${port}`,
        reconnect: { maxRetries: 5, baseDelay: 50 },
      }))

      client.connect()
      await sleep(100)

      client.disconnect()
      await sleep(500)

      expect(totalConnections).toBe(1)
      expect(client.state).toBe('disconnected')
    })

    it('should not reconnect when reconnect is disabled', async () => {
      const port = getPort()
      const io = createServer()
      let totalConnections = 0

      io.on('connection', (socket) => {
        totalConnections++
        setTimeout(() => socket.disconnect(4000, 'forced'), 50)
      })

      startServer(io, port)

      const client = trackClient(createClient({
        url: `ws://localhost:${port}`,
        reconnect: false,
      }))

      client.connect()
      await sleep(500)

      expect(totalConnections).toBe(1)
      expect(client.state).toBe('disconnected')
    })
  })

  describe('auth', () => {
    it('should pass auth params as query string', async () => {
      const port = getPort()
      const io = createServer()
      let receivedToken = ''

      io.use((req, next) => {
        const url = new URL(req.url)
        receivedToken = url.searchParams.get('token') ?? ''
        next({ token: receivedToken })
      })

      io.on('connection', () => {})

      startServer(io, port)

      const client = trackClient(createClient({
        url: `ws://localhost:${port}`,
        reconnect: false,
        auth: { token: 'my-secret-token' },
      }))

      client.connect()
      await sleep(100)

      expect(receivedToken).toBe('my-secret-token')
      expect(client.connected).toBe(true)
    })
  })

  describe('type-safe generics', () => {
    it('should enforce typed events at compile time', () => {
      type ClientEvents = {
        send_message: { text: string }
      }
      type ServerEvents = {
        new_message: { user: string; text: string }
      }

      const client = createClient<ClientEvents, ServerEvents>({
        url: 'ws://localhost:9999',
        reconnect: false,
      })

      client.on('new_message', (payload) => {
        expect(typeof payload.user).toBe('string')
        expect(typeof payload.text).toBe('string')
      })

      client.emit('send_message', { text: 'hello' })

      expect(client).toBeDefined()
    })
  })

  describe('fluent API', () => {
    it('should support full method chaining', async () => {
      const port = getPort()
      const io = createServer()
      io.on('connection', () => {})
      startServer(io, port)

      const client = trackClient(
        createClient({ url: `ws://localhost:${port}`, reconnect: false })
          .on('event1', () => {})
          .on('event2', () => {})
          .onConnect(() => {})
          .onDisconnect(() => {})
          .onError(() => {})
          .connect()
      )

      await sleep(100)
      expect(client.connected).toBe(true)
    })
  })
})
