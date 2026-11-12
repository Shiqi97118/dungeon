import type { CloudSaveMeta, Profile, RunRecord, UnlockRecord } from '../src/iselan/profile/index.js'

export interface Receipt {
  readonly hash: string
  readonly createdAt: number
}

/** Storage for 12 §10.3. Every write that must happen once is atomic in the store itself. */
export interface ProfileStore {
  profileByDevice(deviceHash: string): Promise<Profile | null>
  getProfile(id: string): Promise<Profile | null>
  createProfile(profile: Profile, deviceHash: string): Promise<void>
  bindDevice(deviceHash: string, profileId: string, t: number): Promise<void>
  renameProfile(id: string, displayName: string): Promise<void>

  putLinkCode(codeHash: string, profileId: string, expiresAt: number): Promise<void>
  /** Marks the code used and returns its profile, or null when unknown, used or expired. */
  redeemLinkCode(codeHash: string, now: number): Promise<string | null>
  /** Counts one attempt; false once `limit` is passed for `key` today (UTC). */
  countAttempt(key: string, limit: number, now: number): Promise<boolean>

  putExportKey(keyHash: string, profileId: string, t: number): Promise<void>
  profileByExportKey(keyHash: string): Promise<string | null>

  /** True when newly unlocked; an existing `(profile, achievement)` row is left untouched. */
  unlock(profileId: string, u: UnlockRecord): Promise<boolean>
  unlocks(profileId: string): Promise<UnlockRecord[]>
  markNotified(profileId: string, achievementIds: readonly string[]): Promise<void>

  runOwner(runId: string): Promise<string | null>
  putRun(profileId: string, r: RunRecord): Promise<void>
  runs(profileId: string): Promise<RunRecord[]>

  putSave(profileId: string, meta: CloudSaveMeta, data: string): Promise<void>
  getSave(profileId: string): Promise<{ meta: CloudSaveMeta; data: string } | null>

  /** Written by the AI proxy (ENG-05) for each response; false when `(runId, seq)` already has one. */
  putReceipt(runId: string, seq: number, hash: string, t: number): Promise<boolean>
  receipt(runId: string, seq: number): Promise<Receipt | null>
}

export const RECEIPT_RETAIN_MS = 30 * 86_400_000
const day = (t: number) => new Date(t).toISOString().slice(0, 10)

export class MemoryProfileStore implements ProfileStore {
  private profiles = new Map<string, Profile>()
  private devices = new Map<string, string>()
  private codes = new Map<string, { profileId: string; expiresAt: number; used: boolean }>()
  private attempts = new Map<string, number>()
  private exportKeys = new Map<string, string>()
  private unlockRows = new Map<string, Map<string, UnlockRecord>>()
  private runRows = new Map<string, { profileId: string; r: RunRecord }>()
  private saves = new Map<string, { meta: CloudSaveMeta; data: string }>()
  private receipts = new Map<string, Receipt>()

  async profileByDevice(deviceHash: string) {
    const id = this.devices.get(deviceHash)
    return id ? (this.profiles.get(id) ?? null) : null
  }
  async getProfile(id: string) {
    return this.profiles.get(id) ?? null
  }
  async createProfile(profile: Profile, deviceHash: string) {
    this.profiles.set(profile.id, profile)
    this.devices.set(deviceHash, profile.id)
  }
  async bindDevice(deviceHash: string, profileId: string) {
    this.devices.set(deviceHash, profileId)
  }
  async renameProfile(id: string, displayName: string) {
    const p = this.profiles.get(id)
    if (p) this.profiles.set(id, { ...p, displayName })
  }

  async putLinkCode(codeHash: string, profileId: string, expiresAt: number) {
    this.codes.set(codeHash, { profileId, expiresAt, used: false })
  }
  async redeemLinkCode(codeHash: string, now: number) {
    const c = this.codes.get(codeHash)
    if (!c || c.used || c.expiresAt <= now) return null
    c.used = true
    return c.profileId
  }
  async countAttempt(key: string, limit: number, now: number) {
    const k = `${key}:${day(now)}`
    const n = (this.attempts.get(k) ?? 0) + 1
    this.attempts.set(k, n)
    return n <= limit
  }

  async putExportKey(keyHash: string, profileId: string) {
    this.exportKeys.set(keyHash, profileId)
  }
  async profileByExportKey(keyHash: string) {
    return this.exportKeys.get(keyHash) ?? null
  }

  async unlock(profileId: string, u: UnlockRecord) {
    const rows = this.unlockRows.get(profileId) ?? new Map<string, UnlockRecord>()
    this.unlockRows.set(profileId, rows)
    if (rows.has(u.achievementId)) return false
    rows.set(u.achievementId, u)
    return true
  }
  async unlocks(profileId: string) {
    return [...(this.unlockRows.get(profileId)?.values() ?? [])].sort((a, b) => a.unlockedAt - b.unlockedAt || (a.achievementId < b.achievementId ? -1 : 1))
  }
  async markNotified(profileId: string, achievementIds: readonly string[]) {
    const rows = this.unlockRows.get(profileId)
    for (const id of achievementIds) {
      const u = rows?.get(id)
      if (u) rows!.set(id, { ...u, notified: true })
    }
  }

  async runOwner(runId: string) {
    return this.runRows.get(runId)?.profileId ?? null
  }
  async putRun(profileId: string, r: RunRecord) {
    const cur = this.runRows.get(r.runId)
    if (cur && cur.profileId !== profileId) return
    this.runRows.set(r.runId, { profileId, r })
  }
  async runs(profileId: string) {
    return [...this.runRows.values()].filter((x) => x.profileId === profileId).map((x) => x.r).sort((a, b) => a.endedAt - b.endedAt)
  }

  async putSave(profileId: string, meta: CloudSaveMeta, data: string) {
    this.saves.set(profileId, { meta, data })
  }
  async getSave(profileId: string) {
    return this.saves.get(profileId) ?? null
  }

  async putReceipt(runId: string, seq: number, hash: string, t: number) {
    const k = `${runId}:${seq}`
    if (this.receipts.has(k)) return false
    this.receipts.set(k, { hash, createdAt: t })
    return true
  }
  async receipt(runId: string, seq: number) {
    return this.receipts.get(`${runId}:${seq}`) ?? null
  }
}

/** The part of Cloudflare D1's API this store uses; `node:sqlite` can be wrapped to match it in tests. */
export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ meta: { changes: number } }>
}

export interface SqlDatabase {
  prepare(query: string): SqlStatement
  batch(statements: SqlStatement[]): Promise<unknown[]>
}

const SCHEMA = [
  'create table if not exists profiles (id text primary key, display_name text not null, created_at integer not null)',
  'create table if not exists profile_devices (device_hash text primary key, profile_id text not null, bound_at integer not null)',
  'create table if not exists link_codes (code_hash text primary key, profile_id text not null, expires_at integer not null, used integer not null default 0)',
  'create table if not exists profile_exports (key_hash text primary key, profile_id text not null, created_at integer not null)',
  'create table if not exists profile_attempts (key text not null, day text not null, count integer not null default 0, primary key (key, day))',
  `create table if not exists unlocks (
    profile_id text not null, achievement_id text not null, run_id text not null, event_id text not null,
    unlocked_at integer not null, notified integer not null default 0, primary key (profile_id, achievement_id)
  )`,
  `create table if not exists run_records (
    run_id text primary key, profile_id text not null, direction_id text, axes text, chronicle text not null,
    ended_at integer not null, verified integer not null
  )`,
  'create index if not exists run_records_profile_idx on run_records (profile_id, ended_at)',
  'create table if not exists cloud_saves (profile_id text primary key, run_id text not null, version integer not null, data text not null, updated_at integer not null)',
  'create table if not exists gm_receipts (run_id text not null, seq integer not null, hash text not null, created_at integer not null, primary key (run_id, seq))',
  'create index if not exists gm_receipts_created_idx on gm_receipts (created_at)',
]

type UnlockRow = { achievement_id: string; run_id: string; event_id: string; unlocked_at: number; notified: number }
type RunRow = { run_id: string; direction_id: string | null; axes: string | null; chronicle: string; ended_at: number; verified: number }

/** D1 (and any SQLite with the same API). */
export class SqlProfileStore implements ProfileStore {
  private ready: Promise<void> | null = null

  constructor(private db: SqlDatabase) {}

  private async q(sql: string, ...values: unknown[]) {
    this.ready ??= this.db.batch(SCHEMA.map((s) => this.db.prepare(s))).then(() => undefined).catch((e) => { this.ready = null; throw e })
    await this.ready
    return this.db.prepare(sql).bind(...values)
  }

  async profileByDevice(deviceHash: string) {
    const r = await (await this.q(
      'select p.id, p.display_name, p.created_at from profile_devices d join profiles p on p.id = d.profile_id where d.device_hash = ?1', deviceHash,
    )).first<{ id: string; display_name: string; created_at: number }>()
    return r ? { id: r.id, displayName: r.display_name, createdAt: r.created_at } : null
  }
  async getProfile(id: string) {
    const r = await (await this.q('select id, display_name, created_at from profiles where id = ?1', id)).first<{ id: string; display_name: string; created_at: number }>()
    return r ? { id: r.id, displayName: r.display_name, createdAt: r.created_at } : null
  }
  async createProfile(p: Profile, deviceHash: string) {
    await this.q('select 1')
    await this.db.batch([
      this.db.prepare('insert into profiles (id, display_name, created_at) values (?1, ?2, ?3)').bind(p.id, p.displayName, p.createdAt),
      this.db.prepare('insert into profile_devices (device_hash, profile_id, bound_at) values (?1, ?2, ?3) on conflict (device_hash) do update set profile_id = ?2, bound_at = ?3')
        .bind(deviceHash, p.id, p.createdAt),
    ])
  }
  async bindDevice(deviceHash: string, profileId: string, t: number) {
    await (await this.q(
      'insert into profile_devices (device_hash, profile_id, bound_at) values (?1, ?2, ?3) on conflict (device_hash) do update set profile_id = ?2, bound_at = ?3',
      deviceHash, profileId, t,
    )).run()
  }
  async renameProfile(id: string, displayName: string) {
    await (await this.q('update profiles set display_name = ?2 where id = ?1', id, displayName)).run()
  }

  async putLinkCode(codeHash: string, profileId: string, expiresAt: number) {
    await (await this.q('delete from link_codes where expires_at < ?1', expiresAt - 86_400_000)).run()
    await (await this.q('insert into link_codes (code_hash, profile_id, expires_at) values (?1, ?2, ?3)', codeHash, profileId, expiresAt)).run()
  }
  async redeemLinkCode(codeHash: string, now: number) {
    const r = await (await this.q(
      'update link_codes set used = 1 where code_hash = ?1 and used = 0 and expires_at > ?2 returning profile_id', codeHash, now,
    )).first<{ profile_id: string }>()
    return r?.profile_id ?? null
  }
  async countAttempt(key: string, limit: number, now: number) {
    const r = await (await this.q(
      `insert into profile_attempts (key, day, count) values (?1, ?2, 1)
       on conflict (key, day) do update set count = count + 1 returning count`, key, day(now),
    )).first<{ count: number }>()
    return (r?.count ?? 0) <= limit
  }

  async putExportKey(keyHash: string, profileId: string, t: number) {
    await (await this.q('insert into profile_exports (key_hash, profile_id, created_at) values (?1, ?2, ?3)', keyHash, profileId, t)).run()
  }
  async profileByExportKey(keyHash: string) {
    const r = await (await this.q('select profile_id from profile_exports where key_hash = ?1', keyHash)).first<{ profile_id: string }>()
    return r?.profile_id ?? null
  }

  async unlock(profileId: string, u: UnlockRecord) {
    const r = await (await this.q(
      `insert into unlocks (profile_id, achievement_id, run_id, event_id, unlocked_at, notified) values (?1, ?2, ?3, ?4, ?5, ?6)
       on conflict (profile_id, achievement_id) do nothing`,
      profileId, u.achievementId, u.runId, u.eventId, u.unlockedAt, u.notified ? 1 : 0,
    )).run()
    return r.meta.changes > 0
  }
  async unlocks(profileId: string) {
    const { results } = await (await this.q(
      'select achievement_id, run_id, event_id, unlocked_at, notified from unlocks where profile_id = ?1 order by unlocked_at, achievement_id', profileId,
    )).all<UnlockRow>()
    return results.map((r) => ({ achievementId: r.achievement_id, runId: r.run_id, eventId: r.event_id, unlockedAt: r.unlocked_at, notified: !!r.notified }))
  }
  async markNotified(profileId: string, achievementIds: readonly string[]) {
    if (!achievementIds.length) return
    await this.q('select 1')
    await this.db.batch(achievementIds.map((id) => this.db.prepare('update unlocks set notified = 1 where profile_id = ?1 and achievement_id = ?2').bind(profileId, id)))
  }

  async runOwner(runId: string) {
    const r = await (await this.q('select profile_id from run_records where run_id = ?1', runId)).first<{ profile_id: string }>()
    return r?.profile_id ?? null
  }
  async putRun(profileId: string, r: RunRecord) {
    await (await this.q(
      `insert into run_records (run_id, profile_id, direction_id, axes, chronicle, ended_at, verified) values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       on conflict (run_id) do update set direction_id = ?3, axes = ?4, chronicle = ?5, ended_at = ?6, verified = ?7 where run_records.profile_id = ?2`,
      r.runId, profileId, r.directionId, r.axes ? JSON.stringify(r.axes) : null, JSON.stringify(r.chronicle), r.endedAt, r.verified ? 1 : 0,
    )).run()
  }
  async runs(profileId: string) {
    const { results } = await (await this.q(
      'select run_id, direction_id, axes, chronicle, ended_at, verified from run_records where profile_id = ?1 order by ended_at', profileId,
    )).all<RunRow>()
    return results.map((r) => ({
      runId: r.run_id,
      directionId: r.direction_id as RunRecord['directionId'],
      axes: r.axes ? (JSON.parse(r.axes) as RunRecord['axes']) : null,
      chronicle: JSON.parse(r.chronicle) as string[],
      endedAt: r.ended_at,
      verified: !!r.verified,
    }))
  }

  async putSave(profileId: string, meta: CloudSaveMeta, data: string) {
    await (await this.q(
      `insert into cloud_saves (profile_id, run_id, version, data, updated_at) values (?1, ?2, ?3, ?4, ?5)
       on conflict (profile_id) do update set run_id = ?2, version = ?3, data = ?4, updated_at = ?5`,
      profileId, meta.runId, meta.version, data, meta.updatedAt,
    )).run()
  }
  async getSave(profileId: string) {
    const r = await (await this.q('select run_id, version, data, updated_at from cloud_saves where profile_id = ?1', profileId))
      .first<{ run_id: string; version: number; data: string; updated_at: number }>()
    return r ? { meta: { runId: r.run_id, version: r.version, updatedAt: r.updated_at }, data: r.data } : null
  }

  async putReceipt(runId: string, seq: number, hash: string, t: number) {
    await (await this.q('delete from gm_receipts where created_at < ?1', t - RECEIPT_RETAIN_MS)).run()
    const r = await (await this.q(
      'insert into gm_receipts (run_id, seq, hash, created_at) values (?1, ?2, ?3, ?4) on conflict (run_id, seq) do nothing', runId, seq, hash, t,
    )).run()
    return r.meta.changes > 0
  }
  async receipt(runId: string, seq: number) {
    const r = await (await this.q('select hash, created_at from gm_receipts where run_id = ?1 and seq = ?2', runId, seq)).first<{ hash: string; created_at: number }>()
    return r ? { hash: r.hash, createdAt: r.created_at } : null
  }
}
