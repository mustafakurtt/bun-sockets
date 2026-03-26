import { Database } from 'bun:sqlite'
import type {
  HistoryAdapter,
  HistoryEntry,
  HistoryQuery,
  SqliteAdapterOptions,
} from '../types/history.types.ts'

const DEFAULT_MAX_PER_ROOM = 10000

export class SqliteAdapter implements HistoryAdapter {
  private readonly db: Database
  private readonly maxPerRoom: number
  private readonly insertStmt: ReturnType<Database['prepare']>

  constructor(options: SqliteAdapterOptions = {}) {
    this.maxPerRoom = options.maxPerRoom ?? DEFAULT_MAX_PER_ROOM
    this.db = new Database(options.path ?? ':memory:')

    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        room TEXT NOT NULL,
        event TEXT NOT NULL,
        payload TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_history_room_ts
      ON history (room, timestamp)
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_history_room_event
      ON history (room, event, timestamp)
    `)

    this.insertStmt = this.db.prepare(
      'INSERT INTO history (id, room, event, payload, timestamp) VALUES (?, ?, ?, ?, ?)',
    )
  }

  store(room: string, event: string, payload: unknown): void {
    this.insertStmt.run(crypto.randomUUID(), room, event, JSON.stringify(payload), Date.now())

    this.enforceLimit(room)
  }

  getHistory(room: string, query: HistoryQuery = {}): HistoryEntry[] {
    const limit = query.limit ?? 50
    const order = query.order ?? 'desc'
    const before = query.before ?? null
    const after = query.after ?? null
    const eventFilter = query.event ?? null

    const conditions: string[] = ['room = ?']
    const params: (string | number)[] = [room]

    if (eventFilter) {
      conditions.push('event = ?')
      params.push(eventFilter)
    }

    if (before !== null) {
      conditions.push('timestamp < ?')
      params.push(before)
    }

    if (after !== null) {
      conditions.push('timestamp > ?')
      params.push(after)
    }

    const where = conditions.join(' AND ')
    const dir = order === 'desc' ? 'DESC' : 'ASC'

    const sql = `SELECT id, room, event, payload, timestamp FROM history WHERE ${where} ORDER BY timestamp ${dir} LIMIT ?`
    params.push(limit)

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: string
      room: string
      event: string
      payload: string
      timestamp: number
    }>

    return rows.map((row) => ({
      id: row.id,
      room: row.room,
      event: row.event,
      payload: JSON.parse(row.payload),
      timestamp: row.timestamp,
    }))
  }

  clear(room: string): void {
    this.db.prepare('DELETE FROM history WHERE room = ?').run(room)
  }

  clearAll(): void {
    this.db.exec('DELETE FROM history')
  }

  close(): void {
    this.db.close()
  }

  private enforceLimit(room: string): void {
    const countRow = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM history WHERE room = ?',
    ).get(room) as { cnt: number } | null

    if (countRow && countRow.cnt > this.maxPerRoom) {
      const excess = countRow.cnt - this.maxPerRoom
      this.db.prepare(
        `DELETE FROM history WHERE id IN (
          SELECT id FROM history WHERE room = ? ORDER BY timestamp ASC LIMIT ?
        )`,
      ).run(room, excess)
    }
  }
}
