import type {
  HistoryAdapter,
  HistoryEntry,
  HistoryQuery,
  MemoryAdapterOptions,
} from '../types/history.types.ts'

const DEFAULT_MAX_PER_ROOM = 1000

export class MemoryAdapter implements HistoryAdapter {
  private readonly maxPerRoom: number
  private readonly storage: Map<string, HistoryEntry[]> = new Map()

  constructor(options: MemoryAdapterOptions = {}) {
    this.maxPerRoom = options.maxPerRoom ?? DEFAULT_MAX_PER_ROOM
  }

  store(room: string, event: string, payload: unknown): void {
    let entries = this.storage.get(room)
    if (!entries) {
      entries = []
      this.storage.set(room, entries)
    }

    entries.push({
      id: crypto.randomUUID(),
      room,
      event,
      payload,
      timestamp: Date.now(),
    })

    if (entries.length > this.maxPerRoom) {
      entries.splice(0, entries.length - this.maxPerRoom)
    }
  }

  getHistory(room: string, query: HistoryQuery = {}): HistoryEntry[] {
    const entries = this.storage.get(room)
    if (!entries || entries.length === 0) return []

    const limit = query.limit ?? 50
    const order = query.order ?? 'desc'
    const before = query.before ?? null
    const after = query.after ?? null
    const eventFilter = query.event ?? null

    let filtered = entries

    if (eventFilter) {
      filtered = filtered.filter((e) => e.event === eventFilter)
    }

    if (before !== null) {
      filtered = filtered.filter((e) => e.timestamp < before)
    }

    if (after !== null) {
      filtered = filtered.filter((e) => e.timestamp > after)
    }

    if (order === 'desc') {
      filtered = [...filtered].reverse()
    }

    return filtered.slice(0, limit)
  }

  clear(room: string): void {
    this.storage.delete(room)
  }

  clearAll(): void {
    this.storage.clear()
  }
}
