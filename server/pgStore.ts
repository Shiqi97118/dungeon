import pg from 'pg'
import type { RoomData, Store } from './store.js'

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

export class PgStore implements Store {
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
