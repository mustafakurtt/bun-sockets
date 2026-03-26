import { describe, expect, it, beforeEach } from 'bun:test'
import { MemoryAdapter } from '../../src/history/memory-adapter.ts'

describe('MemoryAdapter', () => {
  let adapter: MemoryAdapter

  beforeEach(() => {
    adapter = new MemoryAdapter({ maxPerRoom: 100 })
  })

  it('should store and retrieve messages', () => {
    adapter.store('room-a', 'chat', { text: 'hello' })
    adapter.store('room-a', 'chat', { text: 'world' })

    const history = adapter.getHistory('room-a')

    expect(history.length).toBe(2)
    expect(history[0]!.event).toBe('chat')
    expect(history[0]!.room).toBe('room-a')
  })

  it('should return entries in descending order by default', () => {
    adapter.store('room-a', 'msg', { n: 1 })
    adapter.store('room-a', 'msg', { n: 2 })
    adapter.store('room-a', 'msg', { n: 3 })

    const history = adapter.getHistory('room-a')

    expect((history[0]!.payload as { n: number }).n).toBe(3)
    expect((history[2]!.payload as { n: number }).n).toBe(1)
  })

  it('should return entries in ascending order when specified', () => {
    adapter.store('room-a', 'msg', { n: 1 })
    adapter.store('room-a', 'msg', { n: 2 })
    adapter.store('room-a', 'msg', { n: 3 })

    const history = adapter.getHistory('room-a', { order: 'asc' })

    expect((history[0]!.payload as { n: number }).n).toBe(1)
    expect((history[2]!.payload as { n: number }).n).toBe(3)
  })

  it('should respect limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      adapter.store('room-a', 'msg', { n: i })
    }

    const history = adapter.getHistory('room-a', { limit: 3 })
    expect(history.length).toBe(3)
  })

  it('should filter by before timestamp', async () => {
    adapter.store('room-a', 'msg', { n: 1 })
    await new Promise((r) => setTimeout(r, 20))
    const midTime = Date.now()
    await new Promise((r) => setTimeout(r, 20))
    adapter.store('room-a', 'msg', { n: 2 })

    const history = adapter.getHistory('room-a', { before: midTime })

    expect(history.length).toBe(1)
    expect((history[0]!.payload as { n: number }).n).toBe(1)
  })

  it('should filter by after timestamp', async () => {
    adapter.store('room-a', 'msg', { n: 1 })
    await new Promise((r) => setTimeout(r, 20))
    const midTime = Date.now()
    await new Promise((r) => setTimeout(r, 20))
    adapter.store('room-a', 'msg', { n: 2 })

    const history = adapter.getHistory('room-a', { after: midTime })

    expect(history.length).toBe(1)
    expect((history[0]!.payload as { n: number }).n).toBe(2)
  })

  it('should filter by event name', () => {
    adapter.store('room-a', 'chat', { text: 'hi' })
    adapter.store('room-a', 'system', { info: 'joined' })
    adapter.store('room-a', 'chat', { text: 'bye' })

    const history = adapter.getHistory('room-a', { event: 'chat' })

    expect(history.length).toBe(2)
    expect(history.every((e) => e.event === 'chat')).toBe(true)
  })

  it('should enforce maxPerRoom limit', () => {
    const small = new MemoryAdapter({ maxPerRoom: 5 })

    for (let i = 0; i < 10; i++) {
      small.store('room-a', 'msg', { n: i })
    }

    const history = small.getHistory('room-a', { order: 'asc' })

    expect(history.length).toBe(5)
    // Oldest entries should have been evicted
    expect((history[0]!.payload as { n: number }).n).toBe(5)
  })

  it('should isolate rooms from each other', () => {
    adapter.store('room-a', 'msg', { text: 'a' })
    adapter.store('room-b', 'msg', { text: 'b' })

    expect(adapter.getHistory('room-a').length).toBe(1)
    expect(adapter.getHistory('room-b').length).toBe(1)
    expect(adapter.getHistory('room-c').length).toBe(0)
  })

  it('should clear a specific room', () => {
    adapter.store('room-a', 'msg', { n: 1 })
    adapter.store('room-b', 'msg', { n: 2 })

    adapter.clear('room-a')

    expect(adapter.getHistory('room-a').length).toBe(0)
    expect(adapter.getHistory('room-b').length).toBe(1)
  })

  it('should clear all rooms', () => {
    adapter.store('room-a', 'msg', { n: 1 })
    adapter.store('room-b', 'msg', { n: 2 })

    adapter.clearAll()

    expect(adapter.getHistory('room-a').length).toBe(0)
    expect(adapter.getHistory('room-b').length).toBe(0)
  })

  it('should generate unique ids for each entry', () => {
    adapter.store('room-a', 'msg', { n: 1 })
    adapter.store('room-a', 'msg', { n: 2 })

    const history = adapter.getHistory('room-a')

    expect(history[0]!.id).not.toBe(history[1]!.id)
    expect(history[0]!.id.length).toBeGreaterThan(0)
  })

  it('should support pagination with before cursor', async () => {
    for (let i = 0; i < 10; i++) {
      adapter.store('room-a', 'msg', { n: i })
      await new Promise((r) => setTimeout(r, 5))
    }

    // First page (newest 3)
    const page1 = adapter.getHistory('room-a', { limit: 3 })
    expect(page1.length).toBe(3)

    // Second page — entries before the oldest of page 1
    const cursor = page1[page1.length - 1]!
    const page2 = adapter.getHistory('room-a', { limit: 3, before: cursor.timestamp })
    expect(page2.length).toBe(3)

    // Pages should not overlap
    const ids1 = new Set(page1.map((e) => e.id))
    const overlap = page2.filter((e) => ids1.has(e.id))
    expect(overlap.length).toBe(0)
  })
})
