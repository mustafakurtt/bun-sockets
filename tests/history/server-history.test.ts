import { describe, expect, it, afterEach } from 'bun:test'
import { createServer } from '../../src/index.ts'
import { MemoryAdapter } from '../../src/history/memory-adapter.ts'
import type { Server } from 'bun'
import type { InternalSocketData } from '../../src/index.ts'

const servers: Server<InternalSocketData>[] = []
let portCounter = 35000

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

function connectWs(port: number): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`)
    ws.onopen = () => { resolve(ws) }
  })
}

afterEach(() => {
  for (const s of servers) {
    s.stop(true)
  }
  servers.length = 0
})

describe('Server History Integration', () => {
  it('should store messages sent via io.to(room).emit()', async () => {
    const adapter = new MemoryAdapter()
    const port = getPort()
    const io = createServer({ heartbeat: false, history: adapter })

    io.on('connection', (socket) => {
      socket.join('chat')
    })

    startServer(io, port)
    const ws = await connectWs(port)
    await sleep(100)

    io.to('chat').emit('msg', { text: 'hello' })
    io.to('chat').emit('msg', { text: 'world' })
    await sleep(50)

    const history = adapter.getHistory('chat')

    expect(history.length).toBe(2)
    expect(history[0]!.event).toBe('msg')
    expect((history[0]!.payload as { text: string }).text).toBe('world')
    expect((history[1]!.payload as { text: string }).text).toBe('hello')

    ws.close()
    await sleep(50)
  })

  it('should store messages sent via socket.broadcast()', async () => {
    const adapter = new MemoryAdapter()
    const port = getPort()
    const io = createServer({ heartbeat: false, history: adapter })

    io.on('connection', (socket) => {
      socket.join('room-1')
      socket.on('send_broadcast', (payload) => {
        socket.broadcast('room-1', 'notification', payload as { text: string })
      })
    })

    startServer(io, port)
    const ws = await connectWs(port)
    await sleep(100)

    ws.send(JSON.stringify({ event: 'send_broadcast', payload: { text: 'broadcasted' } }))
    await sleep(100)

    const history = adapter.getHistory('room-1')

    expect(history.length).toBe(1)
    expect(history[0]!.event).toBe('notification')
    expect((history[0]!.payload as { text: string }).text).toBe('broadcasted')

    ws.close()
    await sleep(50)
  })

  it('should expose history via io.history()', async () => {
    const adapter = new MemoryAdapter()
    const port = getPort()
    const io = createServer({ heartbeat: false, history: adapter })

    io.on('connection', (socket) => {
      socket.join('lobby')
    })

    startServer(io, port)
    const ws = await connectWs(port)
    await sleep(100)

    io.to('lobby').emit('event1', { n: 1 })
    io.to('lobby').emit('event2', { n: 2 })
    io.to('lobby').emit('event1', { n: 3 })

    const allHistory = await io.history('lobby')
    expect(allHistory.length).toBe(3)

    const filtered = await io.history('lobby', { event: 'event1' })
    expect(filtered.length).toBe(2)

    const limited = await io.history('lobby', { limit: 1 })
    expect(limited.length).toBe(1)

    ws.close()
    await sleep(50)
  })

  it('should return empty array when no history adapter is set', async () => {
    const port = getPort()
    const io = createServer({ heartbeat: false })

    io.on('connection', () => {})
    startServer(io, port)

    const result = await io.history('any-room')
    expect(result).toEqual([])
  })

  it('should not interfere with normal message delivery', async () => {
    const adapter = new MemoryAdapter()
    const port = getPort()
    const io = createServer({ heartbeat: false, history: adapter })

    io.on('connection', (socket) => {
      socket.join('live')
    })

    startServer(io, port)
    const ws = await connectWs(port)
    await sleep(100)

    const received: unknown[] = []
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.event === 'update') {
          received.push(data.payload)
        }
      } catch {}
    }

    io.to('live').emit('update', { value: 42 })
    await sleep(100)

    // Message should be delivered AND stored
    expect(received.length).toBe(1)
    expect(adapter.getHistory('live').length).toBe(1)

    ws.close()
    await sleep(50)
  })
})
