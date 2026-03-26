import { describe, expect, it, afterEach } from 'bun:test'
import { createServer } from '../../src/index.ts'
import { createClient } from '../../src/client.ts'
import type { Server } from 'bun'
import type { InternalSocketData } from '../../src/index.ts'
import type { SocketClient } from '../../src/client/socket-client.ts'

const servers: Server<InternalSocketData>[] = []
const clients: SocketClient[] = []
let portCounter = 40000

function getPort() { return portCounter++ }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

function startServer(io: ReturnType<typeof createServer>, port: number) {
  const s = Bun.serve({ port, fetch: io.handler, websocket: io.websocket })
  servers.push(s)
  return s
}

function track(c: SocketClient) { clients.push(c); return c }

afterEach(() => {
  for (const c of clients) if (c.connected) c.disconnect()
  clients.length = 0
  for (const s of servers) s.stop(true)
  servers.length = 0
})

describe('Namespace', () => {
  it('should route connections to the correct namespace', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: false })

    let defaultConnected = false
    let chatConnected = false

    io.on('connection', () => { defaultConnected = true })
    io.of('/chat').on('connection', () => { chatConnected = true })

    startServer(io, port)

    // Connect to /chat namespace
    const chatClient = track(createClient({ url: `ws://localhost:${port}`, path: '/chat', reconnect: false }))
    chatClient.connect()
    await sleep(150)

    expect(chatConnected).toBe(true)
    expect(defaultConnected).toBe(false)
  })

  it('should isolate sockets between namespaces', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: false })

    io.on('connection', () => {})
    const chat = io.of('/chat')
    chat.on('connection', () => {})

    startServer(io, port)

    const defaultClient = track(createClient({ url: `ws://localhost:${port}`, reconnect: false }))
    defaultClient.connect()
    await sleep(100)

    const chatClient = track(createClient({ url: `ws://localhost:${port}`, path: '/chat', reconnect: false }))
    chatClient.connect()
    await sleep(100)

    expect(io.connectionCount).toBe(1)
    expect(chat.connectionCount).toBe(1)
  })

  it('should support rooms within a namespace', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: false })

    const chat = io.of('/chat')
    chat.on('connection', (socket) => {
      socket.join('general')
    })

    startServer(io, port)

    const c1 = track(createClient({ url: `ws://localhost:${port}`, path: '/chat', reconnect: false }))
    c1.connect()
    await sleep(100)

    expect(chat.rooms.get('general')?.size).toBe(1)
  })

  it('should broadcast within namespace rooms', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: false })

    const chat = io.of('/chat')
    chat.on('connection', (socket) => {
      socket.join('room-1')
    })

    startServer(io, port)

    const received: unknown[] = []
    const c = track(createClient({ url: `ws://localhost:${port}`, path: '/chat', reconnect: false }))
    c.on('msg', (payload) => { received.push(payload) })
    c.connect()
    await sleep(100)

    chat.to('room-1').emit('msg', { text: 'hi' })
    await sleep(100)

    expect(received.length).toBe(1)
    expect((received[0] as { text: string }).text).toBe('hi')
  })

  it('should support namespace-level middleware', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: false })

    const admin = io.of('/admin')
    let middlewareRan = false
    admin.use((_req, next) => {
      middlewareRan = true
      next({ role: 'admin' })
    })

    admin.on('connection', (socket) => {
      expect(socket.data.role).toBe('admin')
    })

    startServer(io, port)

    const c = track(createClient({ url: `ws://localhost:${port}`, path: '/admin', reconnect: false }))
    c.connect()
    await sleep(150)

    expect(middlewareRan).toBe(true)
    expect(admin.connectionCount).toBe(1)
  })

  it('should fire disconnect on namespace', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: false })

    let disconnected = false
    const ns = io.of('/ns1')
    ns.on('connection', () => {})
    ns.on('disconnect', () => { disconnected = true })

    startServer(io, port)

    const c = track(createClient({ url: `ws://localhost:${port}`, path: '/ns1', reconnect: false }))
    c.connect()
    await sleep(100)

    c.disconnect()
    await sleep(100)

    expect(disconnected).toBe(true)
    expect(ns.connectionCount).toBe(0)
  })

  it('should return the same namespace for the same path', () => {
    const io = createServer({ heartbeat: false })
    const ns1 = io.of('/test')
    const ns2 = io.of('/test')
    expect(ns1).toBe(ns2)
  })
})
