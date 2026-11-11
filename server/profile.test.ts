import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { draft, stableStringify } from '../src/iselan/events/index.js'
import {
  LINK_CODE_ALPHABET, LINK_CODE_LENGTH, LINK_CODE_TTL_MS, newLinkCode, normalizeLinkCode, openExport, responseHash, sha256Hex,
  type ProfileExport, type ProfileView,
} from '../src/iselan/profile/index.js'
import { TestRun } from '../src/iselan/rules/testRun.js'
import { createSave, serializeSave } from '../src/iselan/save.js'
import { anonymousViewer, setPlatform } from './platform.js'
import { configureProfileRules, handleProfile } from './profile.js'
import { MemoryProfileStore, RECEIPT_RETAIN_MS, SqlProfileStore, type ProfileStore, type SqlDatabase, type SqlStatement } from './profileStore.js'

type Json = Record<string, unknown>

/** Wraps node:sqlite in the slice of the D1 API that SqlProfileStore uses, so the real SQL runs in tests. */
function sqliteD1(): SqlDatabase {
  const db = new DatabaseSync(':memory:')
  const stmt = (sql: string, values: unknown[] = []): SqlStatement & { exec(): void } => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    first: async <T,>() => (db.prepare(sql).get(...(values as never[])) as T | undefined) ?? null,
    all: async <T,>() => ({ results: db.prepare(sql).all(...(values as never[])) as T[] }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(values as never[])).changes) } }),
    exec: () => void db.prepare(sql).run(...(values as never[])),
  })
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      db.exec('begin')
      try {
        for (const s of list) (s as ReturnType<typeof stmt>).exec()
        db.exec('commit')
      } catch (e) {
        db.exec('rollback')
        throw e
      }
      return []
    },
  }
}

const UID_A = 'device-a-0123456789abcdef'
const UID_B = 'device-b-0123456789abcdef'
const UID_C = 'device-c-0123456789abcdef'

async function call(uid: string | null, body?: Json): Promise<{ status: number; data: Json }> {
  const headers: Record<string, string> = { 'x-echo-client': '1', 'content-type': 'application/json' }
  if (uid) headers['x-echo-uid'] = uid
  const res = await handleProfile(new Request('http://localhost/api/profile', body ? { method: 'POST', headers, body: JSON.stringify(body) } : { headers }))
  return { status: res.status, data: (await res.json()) as Json }
}
const me = async (uid: string) => (await call(uid)).data as unknown as ProfileView

function soloRun(runId: string, ended = true, mode: 'solo' | 'online' = 'solo') {
  const run = new TestRun(mode === 'solo' ? undefined : [{ seatId: 's1', actorId: 'helan', controller: 'human' }, { seatId: 's2', actorId: 'qilan', controller: 'human' }])
  if (ended) run.commit([draft('ending_committed', { directionId: 'D07', secondaryDirectionId: 'D03', variant: 'none', worldResolution: 'resolved' })])
  const events = run.events.map((e) => ({ ...e, runId, eventId: `${runId}:${e.seq}` }))
  return createSave({ runId, seed: 'seed-1', createdAt: '2026-11-11T00:00:00.000Z', events })
}

function suite(name: string, make: () => ProfileStore) {
  describe(`档案接口（${name}）`, () => {
    let store: ProfileStore
    beforeEach(() => {
      store = make()
      setPlatform({ viewer: async (r) => anonymousViewer(r), store: () => null, profiles: () => store })
      configureProfileRules({
        judge: (s, events) => (s.ending ? [{ achievementId: 'ACH-TEST', eventId: events.at(-1)!.eventId }, { achievementId: 'ACH-FAKE', eventId: 'other:1' }] : []),
      })
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-11T08:00:00Z'))
    })
    afterEach(() => vi.useRealTimers())

    it('第一次访问建档；同一浏览器编号回到同一份档案；只有 IP 时不建档', async () => {
      const a = await me(UID_A)
      expect(a.profile.displayName).toBe('旅人')
      expect((await me(UID_A)).profile.id).toBe(a.profile.id)
      expect((await me(UID_B)).profile.id).not.toBe(a.profile.id)
      expect((await call(null)).status).toBe(400)
    })

    it('同一网络每天新建档案有上限，已有档案不受影响', async () => {
      const ip = { 'x-echo-client': '1', 'x-real-ip': '203.0.113.9' }
      const get = (uid: string) => handleProfile(new Request('http://localhost/api/profile', { headers: { ...ip, 'x-echo-uid': uid } }))
      for (let i = 0; i < 30; i++) expect((await get(`flood-${String(i).padStart(16, '0')}`)).status).toBe(200)
      expect((await get('flood-new-0000000000000')).status).toBe(429)
      expect((await get(`flood-${'0'.repeat(16)}`)).status).toBe(200)
    })

    it('改名，名字去掉控制字符并截短', async () => {
      const r = await call(UID_A, { op: 'rename', name: '  雨\u0007中的旅人很长很长很长很长很长很长很长  ' })
      expect((r.data as unknown as ProfileView).profile.displayName).toBe('雨中的旅人很长很长很长很长很长很')
      expect((await me(UID_A)).profile.displayName).toBe('雨中的旅人很长很长很长很长很长很')
    })

    it('写操作必须来自本站页面', async () => {
      const res = await handleProfile(new Request('http://localhost/api/profile', {
        method: 'POST', headers: { 'x-echo-uid': UID_A, 'content-type': 'application/json' }, body: '{"op":"export"}',
      }))
      expect(res.status).toBe(403)
    })

    it('绑定码：另一台设备输入后共用同一份档案；只能用一次', async () => {
      const a = await me(UID_A)
      const { code } = (await call(UID_A, { op: 'link_create' })).data as { code: string }
      expect(code).toHaveLength(LINK_CODE_LENGTH)
      const typed = `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`
      const b = await call(UID_B, { op: 'link_redeem', code: typed })
      expect(b.status).toBe(200)
      expect((await me(UID_B)).profile.id).toBe(a.profile.id)
      const again = await call(UID_C, { op: 'link_redeem', code })
      expect(again.status).toBe(400)
      expect((await me(UID_C)).profile.id).not.toBe(a.profile.id)
    })

    it('绑定码 10 分钟后过期', async () => {
      const { code } = (await call(UID_A, { op: 'link_create' })).data as { code: string }
      vi.setSystemTime(Date.now() + LINK_CODE_TTL_MS)
      expect((await call(UID_B, { op: 'link_redeem', code })).status).toBe(400)
    })

    it('绑定码猜测次数有上限', async () => {
      for (let i = 0; i < 20; i++) expect((await call(UID_B, { op: 'link_redeem', code: 'AAAAAAAA' })).status).toBe(400)
      expect((await call(UID_B, { op: 'link_redeem', code: 'AAAAAAAA' })).status).toBe(429)
    })

    it('单人局上传：没有回执时记为未验证，照常记录但不解锁', async () => {
      const save = soloRun('run-1')
      const r = await call(UID_A, { op: 'upload_run', save: serializeSave(save) })
      expect(r.data).toMatchObject({ verified: false, unlocked: [] })
      const view = await me(UID_A)
      expect(view.unlocks).toEqual([])
      expect(view.runs).toEqual([expect.objectContaining({ runId: 'run-1', directionId: 'D07', verified: false })])
    })

    it('回执全部对得上才重放判定；同一成就不重复解锁；判定器编造的事件不算', async () => {
      const save = soloRun('run-2')
      await store.putReceipt('run-2', 1, await responseHash('第一段回应'), Date.now())
      await store.putReceipt('run-2', 2, await responseHash('第二段回应'), Date.now())
      const responses = [{ seq: 1, text: '第一段回应' }, { seq: 2, text: '第二段回应' }]
      const first = await call(UID_A, { op: 'upload_run', save: serializeSave(save), responses })
      expect(first.data).toMatchObject({ verified: true, unlocked: ['ACH-TEST'] })
      const second = await call(UID_A, { op: 'upload_run', save: serializeSave(save), responses })
      expect(second.data).toMatchObject({ verified: true, unlocked: [] })
      const view = await me(UID_A)
      expect(view.unlocks.map((u) => u.achievementId)).toEqual(['ACH-TEST'])
      expect(view.unlocks[0]).toMatchObject({ runId: 'run-2', eventId: save.events.at(-1)!.eventId, notified: false })
      expect(view.runs).toHaveLength(1)
    })

    it('有一条回应与回执不符，或回执超过 30 天，这一局记为未验证', async () => {
      const save = soloRun('run-3')
      await store.putReceipt('run-3', 1, await responseHash('原文'), Date.now())
      const bad = await call(UID_A, { op: 'upload_run', save: serializeSave(save), responses: [{ seq: 1, text: '被改过的原文' }] })
      expect(bad.data).toMatchObject({ verified: false })
      vi.setSystemTime(Date.now() + RECEIPT_RETAIN_MS + 1)
      const old = await call(UID_A, { op: 'upload_run', save: serializeSave(save), responses: [{ seq: 1, text: '原文' }] })
      expect(old.data).toMatchObject({ verified: false, reason: '回执已超过 30 天' })
      expect((await me(UID_A)).unlocks).toEqual([])
    })

    it('一局只属于第一次上传它的档案；联机局和旧存档不能上传', async () => {
      await call(UID_A, { op: 'upload_run', save: serializeSave(soloRun('run-4')) })
      expect((await call(UID_B, { op: 'upload_run', save: serializeSave(soloRun('run-4')) })).status).toBe(409)
      expect((await call(UID_A, { op: 'upload_run', save: serializeSave(soloRun('run-5', true, 'online')) })).status).toBe(400)
      const old = await call(UID_A, { op: 'upload_run', save: JSON.stringify({ version: 4 }) })
      expect(old).toMatchObject({ status: 400, data: { error: '世界已更新，旧存档无法继续' } })
    })

    it('云存档：一个槽位，存了能原样取回', async () => {
      const save = soloRun('run-6', false)
      await call(UID_A, { op: 'save_put', save: serializeSave(save) })
      const got = (await call(UID_A, { op: 'save_get' })).data as { save: string; meta: { runId: string } }
      expect(got.meta.runId).toBe('run-6')
      expect(JSON.parse(got.save).events).toHaveLength(save.events.length)
      await call(UID_A, { op: 'save_put', save: serializeSave(soloRun('run-7', false)) })
      expect((await me(UID_A)).save?.runId).toBe('run-7')
    })

    it('解锁提示看过后不再提示', async () => {
      const save = soloRun('run-8')
      await store.putReceipt('run-8', 1, await responseHash('x'), Date.now())
      await call(UID_A, { op: 'upload_run', save: serializeSave(save), responses: [{ seq: 1, text: 'x' }] })
      const view = (await call(UID_A, { op: 'notified', ids: ['ACH-TEST'] })).data as unknown as ProfileView
      expect(view.unlocks[0].notified).toBe(true)
    })

    describe('导出与导入', () => {
      async function exported() {
        const save = soloRun('run-9')
        await store.putReceipt('run-9', 1, await responseHash('x'), Date.now())
        await call(UID_A, { op: 'upload_run', save: serializeSave(save), responses: [{ seq: 1, text: 'x' }] })
        return (await call(UID_A, { op: 'export' })).data as unknown as ProfileExport
      }

      it('导出再在新设备导入：回到同一份档案，成就不重复', async () => {
        const file = await exported()
        const r = await call(UID_B, { op: 'import', file: JSON.stringify(file) })
        expect(r.status).toBe(200)
        const b = await me(UID_B)
        expect(b.profile.id).toBe(file.profile.id)
        expect(b.unlocks.map((u) => u.achievementId)).toEqual(['ACH-TEST'])
        await call(UID_B, { op: 'import', file: JSON.stringify(file) })
        expect((await me(UID_B)).unlocks).toHaveLength(1)
      })

      it('改过的导出文件被拒', async () => {
        const file = await exported()
        const edited = { ...file, unlocks: [...file.unlocks, { ...file.unlocks[0], achievementId: 'ACH-STOLEN' }] }
        expect(await call(UID_B, { op: 'import', file: JSON.stringify(edited) })).toMatchObject({ status: 400, data: { error: '档案文件被改动过' } })
        // Recomputing the digest does not help: the server compares the contents with its own records.
        const { digest: _, ...body } = edited
        const resealed = { ...body, digest: await sha256Hex(stableStringify(body)) }
        expect((await call(UID_B, { op: 'import', file: JSON.stringify(resealed) })).data).toMatchObject({ error: '档案文件与服务端记录不一致，已拒绝' })
        const otherKey = { ...file, restoreKey: 'guessed-key' }
        const { digest: __, ...keyBody } = otherKey
        expect((await call(UID_B, { op: 'import', file: JSON.stringify({ ...keyBody, digest: await sha256Hex(stableStringify(keyBody)) }) })).status).toBe(400)
        expect((await me(UID_B)).profile.id).not.toBe(file.profile.id)
      })
    })
  })
}

suite('内存', () => new MemoryProfileStore())
suite('SQLite / D1', () => new SqlProfileStore(sqliteD1()))

describe('绑定码与导出文件格式', () => {
  it('绑定码 8 位，只用不易混淆的字符；输入时容忍小写、空格和横线', () => {
    for (let i = 0; i < 200; i++) {
      const c = newLinkCode()
      expect(c).toHaveLength(LINK_CODE_LENGTH)
      expect([...c].every((ch) => LINK_CODE_ALPHABET.includes(ch))).toBe(true)
    }
    expect(normalizeLinkCode('abcd efgh')).toBe('ABCDEFGH')
    expect(normalizeLinkCode('ABCD0OIL')).toBeNull()
    expect(normalizeLinkCode('ABC')).toBeNull()
  })

  it('导出文件格式不对时说明原因', async () => {
    expect(await openExport('not json')).toEqual({ ok: false, problem: '文件不是有效的 JSON' })
    expect(await openExport('{"format":"other"}')).toEqual({ ok: false, problem: '不是伊瑟兰的档案文件' })
  })

  it('回执 (局, 序号) 唯一', async () => {
    const store = new SqlProfileStore(sqliteD1())
    expect(await store.putReceipt('r', 1, 'h', 1)).toBe(true)
    expect(await store.putReceipt('r', 1, 'h2', 2)).toBe(false)
    expect(await store.receipt('r', 1)).toEqual({ hash: 'h', createdAt: 1 })
  })
})
