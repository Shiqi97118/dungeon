import type { RoomData, RoomRow, Store } from './store.js'

const SCHEMA = [
  `create table if not exists rooms (
    stage text not null, code text not null, version integer not null default 1, host_user text not null,
    data text not null, presence text not null default '{}',
    created_at integer not null, updated_at integer not null,
    primary key (stage, code)
  )`,
  'create index if not exists rooms_host_idx on rooms (stage, host_user, created_at)',
  'create index if not exists rooms_updated_idx on rooms (updated_at)',
  `create table if not exists gm_usage (
    stage text not null, user_key text not null, day text not null, count integer not null default 0,
    primary key (stage, user_key, day)
  )`,
]

const RETAIN_MS = 14 * 86_400_000

export class D1Store implements Store {
  private ready: Promise<void> | null = null

  constructor(private db: D1Database) {}

  private async init() {
    this.ready ??= this.db.batch(SCHEMA.map((q) => this.db.prepare(q))).then(() => undefined).catch((e) => { this.ready = null; throw e })
    await this.ready
  }

  async get(stage: string, code: string): Promise<RoomRow | null> {
    await this.init()
    const r = await this.db.prepare('select version, data, presence from rooms where stage = ?1 and code = ?2').bind(stage, code)
      .first<{ version: number; data: string; presence: string }>()
    return r ? { version: r.version, data: JSON.parse(r.data) as RoomData, presence: JSON.parse(r.presence) as Record<string, number> } : null
  }

  async create(stage: string, code: string, hostUser: string, data: RoomData) {
    await this.init()
    const now = Date.now()
    await this.db.prepare('delete from rooms where updated_at < ?1').bind(now - RETAIN_MS).run()
    const r = await this.db.prepare('insert into rooms (stage, code, host_user, data, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5) on conflict do nothing')
      .bind(stage, code, hostUser, JSON.stringify(data), now).run()
    return r.meta.changes > 0
  }

  async update(stage: string, code: string, version: number, data: RoomData) {
    await this.init()
    const r = await this.db.prepare('update rooms set data = ?4, version = version + 1, updated_at = ?5 where stage = ?1 and code = ?2 and version = ?3')
      .bind(stage, code, version, JSON.stringify(data), Date.now()).run()
    return r.meta.changes > 0
  }

  async touch(stage: string, code: string, pid: string, t: number) {
    await this.init()
    await this.db.prepare(`update rooms set presence = json_set(presence, '$.' || ?3, ?4) where stage = ?1 and code = ?2`)
      .bind(stage, code, pid, t).run()
  }

  async recentByHost(stage: string, user: string, sinceMs: number) {
    await this.init()
    const r = await this.db.prepare('select count(*) as n from rooms where stage = ?1 and host_user = ?2 and created_at > ?3').bind(stage, user, sinceMs)
      .first<{ n: number }>()
    return Number(r?.n ?? 0)
  }

  async useQuota(stage: string, user: string, limit: number) {
    await this.init()
    const r = await this.db.prepare(
      `insert into gm_usage (stage, user_key, day, count) values (?1, ?2, ?3, 1)
       on conflict (stage, user_key, day) do update set count = count + 1
       returning count`).bind(stage, user, new Date().toISOString().slice(0, 10)).first<{ count: number }>()
    return (r?.count ?? 0) <= limit
  }
}
