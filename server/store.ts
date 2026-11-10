import pg from 'pg'
import type { GameState } from '../src/game/types.js'

export interface Player {
  id: string
  name: string
  tokenHash: string
  user: string
  seats: string[]
  joinedAt: number
}

export interface ChatMsg {
  id: number
  pid: string
  name: string
  text: string
  t: number
}

export interface RoomData {
  hostId: string
  status: 'lobby' | 'play'
  players: Player[]
  state: GameState
  chat: ChatMsg[]
  chatSeq: number
  aiCalls: number
  createdAt: number
}

export interface RoomRow {
  version: number
  data: RoomData
  presence: Record<string, number>
}

export interface Store {
  get(stage: string, code: string): Promise<RoomRow | null>
  create(stage: string, code: string, hostUser: string, data: RoomData): Promise<boolean>
  update(stage: string, code: string, version: number, data: RoomData): Promise<boolean>
  touch(stage: string, code: string, pid: string, t: number): Promise<void>
  recentByHost(stage: string, user: string, sinceMs: number): Promise<number>
  useQuota(stage: string, user: string, limit: number): Promise<boolean>
}

const SCHEMA = `
create table if not exists rooms (
  stage text not null, code text not null, version integer not null default 1, host_user text not null,
  data jsonb not null, presence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (stage, code)
);
create index if not exists rooms_host_idx on rooms (stage, host_user, created_at);
create index if not exists rooms_updated_idx on rooms (updated_at);
create table if not exists gm_usage (
  stage text not null, user_key text not null, day date not null, count integer not null default 0,
  primary key (stage, user_key, day)
);`

class PgStore implements Store {
  private pool: pg.Pool
  private ready: Promise<void> | null = null

  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000 })
  }

  private async q<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
    this.ready ??= this.pool.query(SCHEMA).then(() => undefined).catch((e) => { this.ready = null; throw e })
    await this.ready
    return this.pool.query<T>(sql, params)
  }

  async get(stage: string, code: string) {
    const r = await this.q<{ version: number; data: RoomData; presence: Record<string, number> }>(
      'select version, data, presence from rooms where stage = $1 and code = $2', [stage, code])
    return r.rows[0] ?? null
  }

  async create(stage: string, code: string, hostUser: string, data: RoomData) {
    await this.q("delete from rooms where updated_at < now() - interval '14 days'")
    const r = await this.q('insert into rooms (stage, code, host_user, data) values ($1, $2, $3, $4) on conflict do nothing', [stage, code, hostUser, JSON.stringify(data)])
    return (r.rowCount ?? 0) > 0
  }

  async update(stage: string, code: string, version: number, data: RoomData) {
    const r = await this.q(
      'update rooms set data = $4, version = version + 1, updated_at = now() where stage = $1 and code = $2 and version = $3',
      [stage, code, version, JSON.stringify(data)])
    return (r.rowCount ?? 0) > 0
  }

  async touch(stage: string, code: string, pid: string, t: number) {
    await this.q('update rooms set presence = presence || jsonb_build_object($3::text, $4::bigint) where stage = $1 and code = $2', [stage, code, pid, t])
  }

  async recentByHost(stage: string, user: string, sinceMs: number) {
    const r = await this.q<{ n: string }>(
      'select count(*) as n from rooms where stage = $1 and host_user = $2 and created_at > to_timestamp($3 / 1000.0)', [stage, user, sinceMs])
    return Number(r.rows[0]?.n ?? 0)
  }

  async useQuota(stage: string, user: string, limit: number) {
    const r = await this.q<{ count: number }>(
      `insert into gm_usage (stage, user_key, day, count) values ($1, $2, current_date, 1)
       on conflict (stage, user_key, day) do update set count = gm_usage.count + 1
       returning count`, [stage, user])
    return (r.rows[0]?.count ?? 0) <= limit
  }
}

interface MemRoom extends RoomRow { host: string; createdAt: number }

class MemoryStore implements Store {
  private rooms = new Map<string, MemRoom>()
  private quota = new Map<string, number>()
  private k = (stage: string, code: string) => `${stage}:${code}`

  async get(stage: string, code: string) {
    const r = this.rooms.get(this.k(stage, code))
    return r ? structuredClone({ version: r.version, data: r.data, presence: r.presence }) : null
  }

  async create(stage: string, code: string, hostUser: string, data: RoomData) {
    if (this.rooms.has(this.k(stage, code))) return false
    this.rooms.set(this.k(stage, code), { version: 1, data: structuredClone(data), presence: {}, host: hostUser, createdAt: Date.now() })
    return true
  }

  async update(stage: string, code: string, version: number, data: RoomData) {
    const r = this.rooms.get(this.k(stage, code))
    if (!r || r.version !== version) return false
    r.version += 1
    r.data = structuredClone(data)
    return true
  }

  async touch(stage: string, code: string, pid: string, t: number) {
    const r = this.rooms.get(this.k(stage, code))
    if (r) r.presence[pid] = t
  }

  async recentByHost(stage: string, user: string, sinceMs: number) {
    let n = 0
    for (const [key, r] of this.rooms) if (key.startsWith(`${stage}:`) && r.host === user && r.createdAt > sinceMs) n++
    return n
  }

  async useQuota(stage: string, user: string, limit: number) {
    const key = `${stage}:${user}:${new Date().toISOString().slice(0, 10)}`
    const n = (this.quota.get(key) ?? 0) + 1
    this.quota.set(key, n)
    return n <= limit
  }
}

const g = globalThis as unknown as { __echoStore?: Store | null }

export const isDeployed = () => !!(process.env.VERCEL || process.env.CURSOR_APP_ID)

export function getStore(): Store | null {
  if (g.__echoStore !== undefined) return g.__echoStore
  const url = process.env.DATABASE_URL
  g.__echoStore = url ? new PgStore(url) : isDeployed() ? null : new MemoryStore()
  return g.__echoStore
}
