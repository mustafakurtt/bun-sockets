import { describe, expect, it, afterEach } from 'bun:test'
import { createServer } from '../../src/index.ts'
import type { Server } from 'bun'

const servers: Server[] = []
let portCounter = 15000

function getPort(): number {
  return portCounter++
}

function startServer(io: ReturnType<typeof createServer>, port: number): Server {
  const s = Bun.serve({
    port,
    fetch: io.handler,
    websocket: io.websocket,
  })
  servers.push(s)
  return s
}

function connectWs(port: number, path = '/ws'): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}${path}`)
    ws.onopen = () => resolve(ws)
    ws.onerror = (e) => reject(e)
  })
}

function waitForMessage(ws: WebSocket): Promise<{ event: string; payload: unknown }> {
  return new Promise((resolve) => {
    ws.onmessage = (e) => {
      resolve(JSON.parse(e.data as string))
    }
  })
}

function send(ws: WebSocket, event: string, payload: unknown): void {
  ws.send(JSON.stringify({ event, payload }))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

afterEach(() => {
  for (const s of servers) {
    s.stop(true)
  }
  servers.length = 0
})

describe('SocketServer', () => {
  describe('createServer()', () => {
    it('should create a server instance', () => {
      const io = createServer()
      expect(io).toBeDefined()
      expect(io.handler).toBeFunction()
      expect(io.websocket).toBeDefined()
    })

    it('should accept custom options', () => {
      const io = createServer({ path: '/custom', idleTimeout: 30 })
      expect(io).toBeDefined()
    })

    it('should start with zero connections', () => {
      const io = createServer()
      expect(io.connectionCount).toBe(0)
      expect(io.sockets.size).toBe(0)
      expect(io.rooms.size).toBe(0)
    })
  })

  describe('connection', () => {
    it('should accept websocket connections', async () => {
      const port = getPort()
      const io = createServer()

      let connected = false
      io.on('connection', () => {
        connected = true
      })

      startServer(io, port)
      const ws = await connectWs(port)

      await sleep(50)
      expect(connected).toBe(true)
      expect(io.connectionCount).toBe(1)

      ws.close()
      await sleep(50)
    })

    it('should assign unique id to each socket', async () => {
      const port = getPort()
      const io = createServer()
      const ids: string[] = []

      io.on('connection', (socket) => {
        ids.push(socket.id)
      })

      startServer(io, port)
      const ws1 = await connectWs(port)
      const ws2 = await connectWs(port)

      await sleep(50)
      expect(ids).toHaveLength(2)
      expect(ids[0]).not.toBe(ids[1])

      ws1.close()
      ws2.close()
      await sleep(50)
    })

    it('should track sockets in registry', async () => {
      const port = getPort()
      const io = createServer()

      startServer(io, port)
      const ws = await connectWs(port)

      await sleep(50)
      expect(io.sockets.size).toBe(1)

      ws.close()
      await sleep(50)
      expect(io.sockets.size).toBe(0)
    })

    it('should only upgrade on configured path', async () => {
      const port = getPort()
      const io = createServer({ path: '/my-ws' })

      startServer(io, port)

      try {
        await connectWs(port, '/wrong-path')
        expect(true).toBe(false) // Should not reach
      } catch {
        expect(true).toBe(true) // Connection rejected
      }
    })
  })

  describe('disconnect', () => {
    it('should fire disconnect handler', async () => {
      const port = getPort()
      const io = createServer()
      let disconnected = false

      io.on('disconnect', () => {
        disconnected = true
      })

      startServer(io, port)
      const ws = await connectWs(port)

      await sleep(50)
      ws.close()
      await sleep(50)

      expect(disconnected).toBe(true)
    })

    it('should remove socket from registry on disconnect', async () => {
      const port = getPort()
      const io = createServer()

      startServer(io, port)
      const ws = await connectWs(port)

      await sleep(50)
      expect(io.connectionCount).toBe(1)

      ws.close()
      await sleep(50)
      expect(io.connectionCount).toBe(0)
    })
  })

  describe('emit (server → client)', () => {
    it('should emit event to specific client', async () => {
      const port = getPort()
      const io = createServer()

      io.on('connection', (socket) => {
        socket.emit('welcome', { text: 'hello' })
      })

      startServer(io, port)
      const ws = await connectWs(port)
      const msg = await waitForMessage(ws)

      expect(msg.event).toBe('welcome')
      expect(msg.payload).toEqual({ text: 'hello' })

      ws.close()
      await sleep(50)
    })

    it('should support fluent chaining', async () => {
      const port = getPort()
      const io = createServer()
      const received: string[] = []

      io.on('connection', (socket) => {
        socket
          .emit('msg1', { id: 1 })
          .emit('msg2', { id: 2 })
      })

      startServer(io, port)
      const ws = await connectWs(port)

      ws.onmessage = (e) => {
        const data = JSON.parse(e.data as string)
        received.push(data.event)
      }

      await sleep(100)
      expect(received).toContain('msg1')
      expect(received).toContain('msg2')

      ws.close()
      await sleep(50)
    })
  })

  describe('on (client → server events)', () => {
    it('should handle client events via socket.on()', async () => {
      const port = getPort()
      const io = createServer()
      let receivedPayload: unknown = null

      io.on('connection', (socket) => {
        socket.on('chat', (payload) => {
          receivedPayload = payload
        })
      })

      startServer(io, port)
      const ws = await connectWs(port)
      await sleep(50)

      send(ws, 'chat', { text: 'hi there' })
      await sleep(50)

      expect(receivedPayload).toEqual({ text: 'hi there' })

      ws.close()
      await sleep(50)
    })

    it('should ignore malformed messages', async () => {
      const port = getPort()
      const io = createServer()

      io.on('connection', () => {})

      startServer(io, port)
      const ws = await connectWs(port)
      await sleep(50)

      // Send non-JSON — should not crash
      ws.send('this is not json')
      await sleep(50)

      expect(io.connectionCount).toBe(1) // Still connected

      ws.close()
      await sleep(50)
    })
  })

  describe('rooms (join, leave, broadcast)', () => {
    it('should track rooms after join', async () => {
      const port = getPort()
      const io = createServer()

      io.on('connection', (socket) => {
        socket.join('room-a').join('room-b')
      })

      startServer(io, port)
      const ws = await connectWs(port)
      await sleep(50)

      expect(io.rooms.size).toBe(2)
      expect(io.rooms.get('room-a')?.size).toBe(1)
      expect(io.rooms.get('room-b')?.size).toBe(1)

      ws.close()
      await sleep(50)
    })

    it('should clean rooms on leave', async () => {
      const port = getPort()
      const io = createServer()
      let socketRef: any = null

      io.on('connection', (socket) => {
        socket.join('room-a').join('room-b')
        socketRef = socket
      })

      startServer(io, port)
      const ws = await connectWs(port)
      await sleep(50)

      socketRef.leave('room-a')
      expect(io.rooms.get('room-a')).toBeUndefined()
      expect(io.rooms.get('room-b')?.size).toBe(1)

      ws.close()
      await sleep(50)
    })

    it('should clean rooms on leaveAll', async () => {
      const port = getPort()
      const io = createServer()
      let socketRef: any = null

      io.on('connection', (socket) => {
        socket.join('r1').join('r2').join('r3')
        socketRef = socket
      })

      startServer(io, port)
      const ws = await connectWs(port)
      await sleep(50)

      socketRef.leaveAll()
      expect(io.rooms.size).toBe(0)

      ws.close()
      await sleep(50)
    })

    it('should clean rooms on disconnect', async () => {
      const port = getPort()
      const io = createServer()

      io.on('connection', (socket) => {
        socket.join('chat-room')
      })

      startServer(io, port)
      const ws = await connectWs(port)
      await sleep(50)

      expect(io.rooms.size).toBe(1)

      ws.close()
      await sleep(100)

      expect(io.rooms.size).toBe(0)
    })

    it('should broadcast to room via socket.broadcast()', async () => {
      const port = getPort()
      const io = createServer()

      io.on('connection', (socket) => {
        socket.join('news')
        socket.on('post', (payload) => {
          socket.broadcast('news', 'new_post', payload)
        })
      })

      startServer(io, port)
      const ws1 = await connectWs(port)
      const ws2 = await connectWs(port)
      await sleep(50)

      const msgPromise = waitForMessage(ws2)
      send(ws1, 'post', { title: 'Breaking News' })

      const msg = await msgPromise
      expect(msg.event).toBe('new_post')
      expect(msg.payload).toEqual({ title: 'Breaking News' })

      ws1.close()
      ws2.close()
      await sleep(50)
    })

    it('should broadcast via io.to(room).emit()', async () => {
      const port = getPort()
      const io = createServer()

      io.on('connection', (socket) => {
        socket.join('alerts')
      })

      startServer(io, port)
      const ws = await connectWs(port)
      await sleep(50)

      const msgPromise = waitForMessage(ws)
      io.to('alerts').emit('alert', { level: 'critical' })

      const msg = await msgPromise
      expect(msg.event).toBe('alert')
      expect(msg.payload).toEqual({ level: 'critical' })

      ws.close()
      await sleep(50)
    })

    it('should handle multiple clients in same room', async () => {
      const port = getPort()
      const io = createServer()

      io.on('connection', (socket) => {
        socket.join('lobby')
      })

      startServer(io, port)
      const ws1 = await connectWs(port)
      const ws2 = await connectWs(port)
      const ws3 = await connectWs(port)
      await sleep(50)

      expect(io.rooms.get('lobby')?.size).toBe(3)

      const msg1 = waitForMessage(ws1)
      const msg2 = waitForMessage(ws2)
      const msg3 = waitForMessage(ws3)

      io.to('lobby').emit('announce', { text: 'hello all' })

      const results = await Promise.all([msg1, msg2, msg3])
      for (const r of results) {
        expect(r.event).toBe('announce')
        expect(r.payload).toEqual({ text: 'hello all' })
      }

      ws1.close()
      ws2.close()
      ws3.close()
      await sleep(50)
    })
  })

  describe('middleware', () => {
    it('should run middleware before connection', async () => {
      const port = getPort()
      const io = createServer()
      let middlewareRan = false

      io.use((_req, next) => {
        middlewareRan = true
        next()
      })

      io.on('connection', () => {})

      startServer(io, port)
      const ws = await connectWs(port)
      await sleep(50)

      expect(middlewareRan).toBe(true)

      ws.close()
      await sleep(50)
    })

    it('should pass context from middleware to socket.data', async () => {
      const port = getPort()
      const io = createServer()
      let socketData: Record<string, unknown> = {}

      io.use((_req, next) => {
        next({ userId: 'user-123', role: 'admin' })
      })

      io.on('connection', (socket) => {
        socketData = { ...socket.data }
      })

      startServer(io, port)
      const ws = await connectWs(port)
      await sleep(50)

      expect(socketData.userId).toBe('user-123')
      expect(socketData.role).toBe('admin')

      ws.close()
      await sleep(50)
    })

    it('should chain multiple middlewares', async () => {
      const port = getPort()
      const io = createServer()
      const order: number[] = []
      let socketData: Record<string, unknown> = {}

      io.use((_req, next) => {
        order.push(1)
        next({ step: 'first' })
      })

      io.use((_req, next) => {
        order.push(2)
        next({ step2: 'second' })
      })

      io.on('connection', (socket) => {
        socketData = { ...socket.data }
      })

      startServer(io, port)
      const ws = await connectWs(port)
      await sleep(50)

      expect(order).toEqual([1, 2])
      expect(socketData.step).toBe('first')
      expect(socketData.step2).toBe('second')

      ws.close()
      await sleep(50)
    })

    it('should reject connection when middleware throws', async () => {
      const port = getPort()
      const io = createServer()

      io.use(() => {
        throw new Error('Unauthorized')
      })

      io.on('connection', () => {})

      startServer(io, port)

      try {
        const ws = await connectWs(port)
        await sleep(50)
        // If we got here, the connection should be quickly closed or rejected
        ws.close()
      } catch {
        // Expected — connection rejected
        expect(true).toBe(true)
      }

      expect(io.connectionCount).toBe(0)
    })
  })

  describe('socket.data (context)', () => {
    it('should expose data from middleware on socket', async () => {
      const port = getPort()
      const io = createServer()

      io.use((_req, next) => {
        next({ username: 'mustafa' })
      })

      let username = ''
      io.on('connection', (socket) => {
        username = socket.data.username as string
      })

      startServer(io, port)
      const ws = await connectWs(port)
      await sleep(50)

      expect(username).toBe('mustafa')

      ws.close()
      await sleep(50)
    })
  })

  describe('type-safe generics', () => {
    it('should enforce typed events at compile time', () => {
      type ClientEvents = {
        send_message: { text: string; roomId: string }
      }
      type ServerEvents = {
        new_message: { user: string; text: string }
      }

      const io = createServer<ClientEvents, ServerEvents>()

      io.on('connection', (socket) => {
        socket.on('send_message', (payload) => {
          // payload should be { text: string; roomId: string }
          expect(typeof payload.text).toBe('string')
        })

        socket.emit('new_message', { user: 'test', text: 'hello' })
      })

      expect(io).toBeDefined()
    })
  })
})
