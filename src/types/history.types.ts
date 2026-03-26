export interface HistoryEntry {
  id: string
  room: string
  event: string
  payload: unknown
  timestamp: number
}

export interface HistoryQuery {
  limit?: number
  before?: number
  after?: number
  order?: 'asc' | 'desc'
  event?: string
}

export interface ResolvedHistoryQuery {
  limit: number
  before: number | null
  after: number | null
  order: 'asc' | 'desc'
  event: string | null
}

export interface HistoryAdapter {
  store(room: string, event: string, payload: unknown): void | Promise<void>
  getHistory(room: string, query?: HistoryQuery): HistoryEntry[] | Promise<HistoryEntry[]>
  clear(room: string): void | Promise<void>
  clearAll(): void | Promise<void>
  close?(): void | Promise<void>
}

export interface MemoryAdapterOptions {
  maxPerRoom?: number
}

export interface SqliteAdapterOptions {
  path?: string
  maxPerRoom?: number
}
