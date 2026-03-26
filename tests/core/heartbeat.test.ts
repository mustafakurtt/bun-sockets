import { describe, expect, it, afterEach } from 'bun:test'
import { createServer } from '../../src/index.ts'
import { createClient } from '../../src/client.ts'
import type { Server } from 'bun'
import type { InternalSocketData } from '../../src/index.ts'
import type { SocketClient } from '../../src/client/socket-client.ts'

const servers: Server<InternalSocketData>[] = []
const clients: SocketClient[] = []
let portCounter = 25000

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

describe('Heartbeat', () => {
  it('should send __system:ping to connected clients', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: { interval: 200, timeout: 500 } })
    io.on('connection', () => {})
    startServer(io, port)

    const pings: number[] = []
    let rawWs: WebSocket | null = null

    const connected = new Promise<void>((resolve) => {
      rawWs = new WebSocket(`ws://localhost:${port}/ws`)
      rawWs.onopen = () => { resolve() }
      rawWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.event === '__system:ping') {
            pings.push(data.payload)
            // Send pong back
            rawWs!.send(JSON.stringify({ event: '__system:pong', payload: data.payload }))
          }
        } catch {}
      }
    })

    await connected
    await sleep(500)

    expect(pings.length).toBeGreaterThanOrEqual(1)

    rawWs!.close()
    await sleep(50)
  })

  it('should close zombie sockets that do not respond to ping', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: { interval: 100, timeout: 100 } })

    let disconnectCode = 0
    io.on('disconnect', (_socket, code) => {
      disconnectCode = code
    })

    io.on('connection', () => {})
    startServer(io, port)

    // Connect a raw WS that does NOT respond to pings
    const rawWs = new WebSocket(`ws://localhost:${port}/ws`)
    await new Promise<void>((resolve) => { rawWs.onopen = () => { resolve() } })

    // Wait for heartbeat timeout to kick in
    await sleep(500)

    expect(disconnectCode).toBe(4000)
    expect(io.connectionCount).toBe(0)
  })

  it('should keep alive sockets that respond to pings (via client)', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: { interval: 150, timeout: 300 } })
    io.on('connection', () => {})
    startServer(io, port)

    // Client auto-responds to pings
    const client = trackClient(createClient({ url: `ws://localhost:${port}`, reconnect: false }))
    client.connect()
    await sleep(100)

    expect(client.connected).toBe(true)

    // Wait through several heartbeat cycles
    await sleep(600)

    // Client should still be connected
    expect(client.connected).toBe(true)
    expect(io.connectionCount).toBe(1)
  })

  it('should not send pings when heartbeat is disabled', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: false })
    io.on('connection', () => {})
    startServer(io, port)

    const pings: number[] = []
    const rawWs = new WebSocket(`ws://localhost:${port}/ws`)
    await new Promise<void>((resolve) => { rawWs.onopen = () => { resolve() } })

    rawWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.event === '__system:ping') {
          pings.push(data.payload)
        }
      } catch {}
    }

    await sleep(500)

    expect(pings.length).toBe(0)

    rawWs.close()
    await sleep(50)
  })

  it('should stop heartbeat timer when all sockets disconnect', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: { interval: 100, timeout: 200 } })
    io.on('connection', () => {})
    startServer(io, port)

    const client = trackClient(createClient({ url: `ws://localhost:${port}`, reconnect: false }))
    client.connect()
    await sleep(100)

    expect(io.connectionCount).toBe(1)

    client.disconnect()
    await sleep(100)

    expect(io.connectionCount).toBe(0)
  })
})
