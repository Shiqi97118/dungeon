import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CATALOG, V1_ACHIEVEMENTS, judgeAchievements, type CatalogView } from '../src/iselan/achievements/index.js'
import { grayportRun } from '../src/iselan/achievements/sampleRun.js'
import { draft, type AnyEvent } from '../src/iselan/events/index.js'
import { responseHash, type ProfileView } from '../src/iselan/profile/index.js'
import { choiceDraft } from '../src/iselan/rules/index.js'
import { TestRun } from '../src/iselan/rules/testRun.js'
import { createSave, serializeSave } from '../src/iselan/save.js'
import { anonymousViewer, setPlatform } from './platform.js'
import { configureProfileRules, handleProfile, judgeRoomRun, recordRoomRun } from './profile.js'
import { MemoryProfileStore, SqlProfileStore, type ProfileStore } from './profileStore.js'
import { sqliteD1 } from './sqliteD1.js'

type Json = Record<string, unknown>
const UID_A = 'device-a-0123456789abcdef'
const UID_B = 'device-b-0123456789abcdef'

async function call(uid: string, body?: Json): Promise<{ status: number; data: Json; text: string }> {
  const headers: Record<string, string> = { 'x-echo-client': '1', 'content-type': 'application/json', 'x-echo-uid': uid }
  const res = await handleProfile(new Request('http://localhost/api/profile', body ? { method: 'POST', headers, body: JSON.stringify(body) } : { headers }))
  const text = await res.text()
  return { status: res.status, data: JSON.parse(text) as Json, text }
}
const me = async (uid: string) => (await call(uid)).data as unknown as ProfileView
const gallery = async (uid: string) => (await call(uid, { op: 'achievements' })).data as unknown as CatalogView

const withRunId = (runId: string, events: readonly AnyEvent[]) => events.map((e) => ({ ...e, runId, eventId: `${runId}:${e.seq}` }))
const saveOf = (runId: string, run: TestRun) => createSave({ runId, seed: 'seed-1', createdAt: '2026-11-11T00:00:00.000Z', events: withRunId(runId, run.events) })

/** Uploads a solo run whose two AI responses have server receipts (12 §8.4). */
async function upload(uid: string, store: ProfileStore, runId: string, run: TestRun) {
  const responses = [{ seq: 1, text: `${runId} 的第一段回应` }, { seq: 2, text: `${runId} 的第二段回应` }]
  for (const r of responses) await store.putReceipt(runId, r.seq, await responseHash(r.text), Date.now())
  return call(uid, { op: 'upload_run', save: serializeSave(saveOf(runId, run)), responses })
}

const hidden = CATALOG.filter((a) => a.visibility !== 'public')
const leaked = (text: string, except: readonly string[] = []) =>
  hidden.filter((a) => !except.includes(a.id)).flatMap((a) => [a.name, a.description, a.flavor].filter((s) => text.includes(s)))

function suite(name: string, make: () => ProfileStore) {
  describe(`成就端到端（${name}）`, () => {
    let store: ProfileStore
    beforeEach(() => {
      store = make()
      setPlatform({ viewer: async (r) => anonymousViewer(r), store: () => null, profiles: () => store })
      configureProfileRules({ judge: judgeAchievements })
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-11T08:00:00Z'))
    })
    afterEach(() => vi.useRealTimers())

    it('一局灰港上传后首版 10 项全部解锁，来源是这一局里达成它的事件', async () => {
      const run = grayportRun()
      const r = await upload(UID_A, store, 'gh-1', run)
      expect(r.status).toBe(200)
      expect(r.data.verified).toBe(true)
      expect([...(r.data.unlocked as string[])].sort()).toEqual([...V1_ACHIEVEMENTS].sort())
      expect([...(r.data.earned as string[])].sort()).toEqual([...V1_ACHIEVEMENTS].sort())
      expect(r.data.achievements).toMatchObject({ v1Unlocked: 10, v1Total: 10, unlocked: 10, total: 50 })

      const events = withRunId('gh-1', run.events)
      const view = await me(UID_A)
      expect(view.unlocks).toHaveLength(10)
      for (const u of view.unlocks) {
        const rule = CATALOG.find((a) => a.id === u.achievementId)!.rule
        expect(u).toMatchObject({ runId: 'gh-1', notified: false })
        expect(events.find((e) => e.eventId === u.eventId)?.type).toBe(rule.type)
      }
    })

    it('重试上传：不重复解锁，解锁时间与“已提示”状态保持不变', async () => {
      const run = grayportRun()
      await upload(UID_A, store, 'gh-2', run)
      await call(UID_A, { op: 'notified', ids: [...V1_ACHIEVEMENTS] })
      const before = (await me(UID_A)).unlocks
      vi.setSystemTime(Date.now() + 60_000)
      const again = await upload(UID_A, store, 'gh-2', run)
      expect(again.data).toMatchObject({ verified: true, unlocked: [] })
      expect((again.data.earned as string[]).length).toBe(10)
      const after = (await me(UID_A)).unlocks
      expect(after).toEqual(before)
      expect(after.every((u) => u.notified)).toBe(true)
      expect((await gallery(UID_A)).cards.filter((c) => c.unlock && !c.unlock.notified)).toEqual([])
    })

    it('另一局再次达成已有成就：不重复解锁，结局页仍能看到本局达成', async () => {
      await upload(UID_A, store, 'gh-3', grayportRun())
      const second = await upload(UID_A, store, 'gh-4', new TestRun())
      expect(second.data).toMatchObject({ verified: true, unlocked: [], earned: ['ST01'] })
      expect((await me(UID_A)).unlocks.find((u) => u.achievementId === 'ST01')?.runId).toBe('gh-3')
    })

    it('没有回执的单人局不解锁任何成就', async () => {
      const r = await call(UID_A, { op: 'upload_run', save: serializeSave(saveOf('gh-5', grayportRun())) })
      expect(r.data).toMatchObject({ verified: false, unlocked: [], earned: [] })
      expect((await gallery(UID_A)).unlocked).toBe(0)
    })

    it('秘密成就不泄露：解锁前接口里没有名称与说明，解锁后只露出已解锁的那项', async () => {
      const empty = await call(UID_A, { op: 'achievements' })
      expect(leaked(empty.text)).toEqual([])
      expect(leaked((await call(UID_A)).text)).toEqual([])

      const r = await upload(UID_A, store, 'gh-6', grayportRun())
      expect(leaked(r.text, ['LG07'])).toEqual([])
      const after = await call(UID_A, { op: 'achievements' })
      expect(leaked(after.text, ['LG07'])).toEqual([])
      expect(after.text).toContain('真相无价')
      // Another profile still sees LG07 hidden.
      expect(leaked((await call(UID_B, { op: 'achievements' })).text)).toEqual([])
    })

    it('联机局由房间服务端判定：每份档案各自解锁一次，重复判定不重复', async () => {
      const profileA = (await me(UID_A)).profile.id
      const profileB = (await me(UID_B)).profile.id
      const room = new TestRun([{ seatId: 's1', actorId: 'helan', controller: 'human' }, { seatId: 's2', actorId: 'qilan', controller: 'human' }])
      room.settle([draft('npc_met', { npcId: 'rosa' })])
      const events = withRunId('room-1', room.events)
      expect(await judgeRoomRun(store, profileA, 'room-1', events, ['helan'])).toEqual({ earned: ['ST01', 'RE01'], unlocked: ['ST01', 'RE01'] })
      expect(await judgeRoomRun(store, profileB, 'room-1', events, ['qilan'])).toEqual({ earned: ['ST01', 'RE01'], unlocked: ['ST01', 'RE01'] })
      expect(await judgeRoomRun(store, profileA, 'room-1', events, ['helan'])).toEqual({ earned: ['ST01', 'RE01'], unlocked: [] })
      expect((await me(UID_A)).unlocks.map((u) => u.achievementId).sort()).toEqual(['RE01', 'ST01'])
      expect((await gallery(UID_B)).v1Unlocked).toBe(2)
    })

    it('联机局结束时房间为每位玩家记下这一局：档案里有记录，没有浏览器编号的不记', async () => {
      const events = withRunId('room-3', grayportRun().events)
      const r = await recordRoomRun(store, { stage: 'production', sub: `anon:${UID_A}`, name: '阿岚', seatId: 's1' }, 'room-3', events, ['helan'])
      expect(r?.earned.length).toBeGreaterThan(0)
      const view = await me(UID_A)
      expect(view.runs.map((x) => [x.runId, x.verified])).toEqual([['room-3:s1', true]])
      expect(view.unlocks.length).toBe(r?.unlocked.length)
      expect(await recordRoomRun(store, { stage: 'production', sub: 'ip:1.2.3.4', name: '路人', seatId: 's2' }, 'room-3', events, ['qilan'])).toBeNull()
    })

    it('联机局的个人成就只给行动的那位角色；队伍成就人人都有', async () => {
      const profileA = (await me(UID_A)).profile.id
      const profileB = (await me(UID_B)).profile.id
      const room = new TestRun([{ seatId: 's1', actorId: 'helan', controller: 'human' }, { seatId: 's2', actorId: 'qilan', controller: 'human' }])
      const met = draft('npc_met', { npcId: 'rosa' })
      room.settle([met, choiceDraft(room.s, {
        seatId: 's1', actorId: 'helan', kind: 'act', sceneId: 'tavern', target: 'rosa', method: 'talk', drafts: [met], settled: ['relation'],
      })!])
      const events = withRunId('room-2', room.events)
      expect((await judgeRoomRun(store, profileA, 'room-2', events, ['helan'])).earned).toEqual(['ST01', 'RE01'])
      expect((await judgeRoomRun(store, profileB, 'room-2', events, ['qilan'])).earned).toEqual(['ST01'])
    })
  })
}

suite('内存', () => new MemoryProfileStore())
suite('SQLite / D1', () => new SqlProfileStore(sqliteD1()))
