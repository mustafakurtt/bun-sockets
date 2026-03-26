import { describe, expect, it, afterEach } from 'bun:test'
import { createServer } from '../../src/index.ts'
import { createClient } from '../../src/client.ts'
import type { Server } from 'bun'
import type { InternalSocketData } from '../../src/index.ts'
import type { SocketClient } from '../../src/client/socket-client.ts'

const servers: Server<InternalSocketData>[] = []
const clients: SocketClient[] = []
let portCounter = 45000

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

describe('Binary Messages', () => {
  it('should send binary from server to client', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: false })

    io.on('connection', (socket) => {
      const data = new Uint8Array([1, 2, 3, 4, 5])
      socket.emitBinary('binary_data', data)
    })

    startServer(io, port)

    let received: ArrayBuffer | null = null
    const c = track(createClient({ url: `ws://localhost:${port}`, reconnect: false }))
    c.onBinary('binary_data', (data) => { received = data })
    c.connect()
    await sleep(200)

    expect(received).not.toBeNull()
    const bytes = new Uint8Array(received!)
    expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
  })

  it('should send binary from client to server', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: false })

    let received: ArrayBuffer | null = null
    io.on('connection', (socket) => {
      socket.onBinary('upload', (data) => { received = data })
    })

    startServer(io, port)

    const c = track(createClient({ url: `ws://localhost:${port}`, reconnect: false }))
    c.connect()
    await sleep(100)

    c.emitBinary('upload', new Uint8Array([10, 20, 30]))
    await sleep(200)

    expect(received).not.toBeNull()
    const bytes = new Uint8Array(received!)
    expect(bytes).toEqual(new Uint8Array([10, 20, 30]))
  })

  it('should handle large binary payloads', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: false })

    io.on('connection', (socket) => {
      const big = new Uint8Array(64 * 1024)
      for (let i = 0; i < big.length; i++) big[i] = i % 256
      socket.emitBinary('big', big)
    })

    startServer(io, port)

    let receivedSize = 0
    const c = track(createClient({ url: `ws://localhost:${port}`, reconnect: false }))
    c.onBinary('big', (data) => { receivedSize = data.byteLength })
    c.connect()
    await sleep(200)

    expect(receivedSize).toBe(64 * 1024)
  })

  it('should not interfere with JSON messages', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: false })

    io.on('connection', (socket) => {
      socket.emit('json_msg', { text: 'hello' })
      socket.emitBinary('bin_msg', new Uint8Array([42]))
    })

    startServer(io, port)

    let jsonReceived = false
    let binaryReceived = false

    const c = track(createClient({ url: `ws://localhost:${port}`, reconnect: false }))
    c.on('json_msg', () => { jsonReceived = true })
    c.onBinary('bin_msg', () => { binaryReceived = true })
    c.connect()
    await sleep(200)

    expect(jsonReceived).toBe(true)
    expect(binaryReceived).toBe(true)
  })

  it('should support ArrayBuffer as input', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: false })

    let received: ArrayBuffer | null = null
    io.on('connection', (socket) => {
      socket.onBinary('raw', (data) => { received = data })
    })

    startServer(io, port)

    const c = track(createClient({ url: `ws://localhost:${port}`, reconnect: false }))
    c.connect()
    await sleep(100)

    const buf = new ArrayBuffer(3)
    new Uint8Array(buf).set([7, 8, 9])
    c.emitBinary('raw', buf)
    await sleep(200)

    expect(received).not.toBeNull()
    expect(new Uint8Array(received!)).toEqual(new Uint8Array([7, 8, 9]))
  })

  it('should support fluent chaining on emitBinary and onBinary', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: false })
    io.on('connection', () => {})
    startServer(io, port)

    const c = track(createClient({ url: `ws://localhost:${port}`, reconnect: false }))

    // Fluent chaining
    const result = c
      .onBinary('a', () => {})
      .onBinary('b', () => {})

    expect(result).toBe(c)

    c.connect()
    await sleep(100)

    const emitResult = c.emitBinary('a', new Uint8Array([1]))
    expect(emitResult).toBe(c)
  })
})
