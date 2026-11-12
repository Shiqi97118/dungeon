import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyOp, canWrapUp, packTable, snapshotOf, unpackTable, wrapUp, type Table } from '../src/iselan/play/index.js'
import { fakeModel } from '../src/iselan/ai/fake.js'
import { anonymousViewer, setPlatform } from './platform.js'
import { configureProfileRules } from './profile.js'
import { judgeAchievements } from '../src/iselan/achievements/index.js'
import { MemoryProfileStore } from './profileStore.js'
import { MemoryBudgetStore } from './budget.js'
import { setIselanModel } from './iselanTurn.js'
import { handleRoom } from './rooms.js'
import { MemoryStore } from './store.js'

type Json = Record<string, unknown>
interface Seat { code: string; pid: string; token: string; uid: string }

async function call(uid: string, method: 'GET' | 'POST', body?: Json, token?: string, query = ''): Promise<{ status: number; data: Json }> {
  const headers: Record<string, string> = { 'x-echo-client': '1', 'x-echo-uid': uid, 'content-type': 'application/json' }
  if (token) headers['x-echo-token'] = token
  const res = await handleRoom(new Request(`http://localhost/api/room${query}`, { method, headers, body: body ? JSON.stringify(body) : undefined }))
  return { status: res.status, data: (await res.json()) as Json }
}

const post = (s: Seat, body: Json) => call(s.uid, 'POST', { code: s.code, ...body }, s.token)

interface RoomJson { status: string; hostId: string; hook: string; players: { id: string; pick: string | null; seat: string | null }[]; table: string | null; chat: { text: string }[] }
async function poll(s: Seat) {
  const r = await call(s.uid, 'GET', undefined, s.token, `?code=${s.code}&v=0`)
  return r.data.room as RoomJson
}
async function tableOf(s: Seat): Promise<Table> {
  const raw = (await poll(s)).table
  const r = await unpackTable(raw!)
  if (r.status !== 'ok') throw new Error('table did not load')
  return r.table
}

async function open(names: readonly string[]): Promise<Seat[]> {
  const uid = (i: number) => `device-room-${i}-0123456789`
  const created = await call(uid(0), 'POST', { op: 'create', name: names[0], hook: 'memento' })
  expect(created.status).toBe(200)
  const host = { ...(created.data as Omit<Seat, 'uid'>), uid: uid(0) }
  const out = [host]
  for (let i = 1; i < names.length; i++) {
    const j = await call(uid(i), 'POST', { op: 'join', code: host.code, name: names[i] })
    out.push({ ...(j.data as Omit<Seat, 'uid'>), uid: uid(i) })
  }
  for (const s of out) await poll(s)
  return out
}

const reply = JSON.stringify({ narration: '罗莎擦着杯子，抬眼看了你一会儿。「雨这么大，你不是来喝酒的。」', intents: ['交谈'], emotion: '谨慎', suggestions: ['问她潮井的事'], proposals: [] })

describe('room api on the new engine', () => {
  let calls: string[]
  let store: MemoryStore
  beforeEach(() => {
    calls = []
    store = new MemoryStore()
    const profiles = new MemoryProfileStore()
    const budget = new MemoryBudgetStore()
    setPlatform({ viewer: async (r) => anonymousViewer(r), store: () => store, profiles: () => profiles, budget: () => budget })
    setIselanModel(null)
    configureProfileRules({ judge: judgeAchievements })
  })
  afterEach(() => setIselanModel(undefined))

  it('picks characters in the lobby, starts one shared table and keeps turn order', async () => {
    const [host, guest] = await open(['阿岚', '小周'])
    const room = await poll(host)
    expect(room.status).toBe('lobby')
    expect(JSON.stringify(room)).not.toContain('tokenHash')

    expect((await post(host, { op: 'pick', pick: 'helan' })).status).toBe(200)
    expect((await post(guest, { op: 'pick', pick: 'helan' })).status).toBe(409)
    expect((await post(guest, { op: 'pick', pick: 'nobody' })).status).toBe(400)
    expect((await post(guest, { op: 'pick', pick: 'qilan' })).status).toBe(200)
    expect((await post(guest, { op: 'hook', hook: 'guild_contract' })).status).toBe(403)
    expect((await post(host, { op: 'hook', hook: 'guild_contract' })).status).toBe(200)
    expect((await post(guest, { op: 'start' })).status).toBe(403)
    expect((await post(host, { op: 'start' })).status).toBe(200)
    expect((await post(guest, { op: 'pick', pick: 'fuhe' })).status).toBe(409)

    const started = await poll(host)
    expect(started.players.map((p) => p.seat)).toEqual(['s1', 's2'])
    let t = await tableOf(host)
    expect(t.party.map((m) => m.actorId)).toEqual(['helan', 'qilan'])
    expect(snapshotOf(t).mode).toBe('online')
    expect(t.responses).toEqual([])

    const act = { op: 'play', seatId: 's1', action: { t: 'act', text: '四处看看墙上的寻人启事' } }
    expect((await post(guest, act)).status).toBe(403)
    expect((await post(guest, { ...act, seatId: 's2' })).status).toBe(403)
    expect((await post(host, act)).status).toBe(200)
    t = await tableOf(guest)
    expect(t.turn).toBe(1)
    expect((await post(host, act)).status).toBe(403)
    expect((await post(guest, { op: 'play', seatId: 's2', action: { t: 'move', placeId: 'gray_harbor.docks' } })).status).toBe(200)
    t = await tableOf(host)
    expect(snapshotOf(t).location?.placeId).toBe('gray_harbor.docks')

    expect((await post(guest, { op: 'chat', text: '去码头看看' })).status).toBe(200)
    expect((await poll(host)).chat.some((m) => m.text === '去码头看看')).toBe(true)
  })

  it('rewinds only when everyone at the table agrees', async () => {
    const [host, guest] = await open(['阿岚', '小周'])
    await post(host, { op: 'pick', pick: 'helan' })
    await post(guest, { op: 'pick', pick: 'qilan' })
    await post(host, { op: 'start' })
    await post(host, { op: 'play', seatId: 's1', action: { t: 'act', text: '四处看看' } })
    let t = await tableOf(host)
    const cp = t.checkpoints[0].id
    expect((await post(host, { op: 'play', seatId: 's1', action: { t: 'rewind', checkpointId: cp } })).status).toBe(409)
    expect((await post(host, { op: 'play', seatId: 's1', action: { t: 'propose', checkpointId: cp } })).status).toBe(200)
    expect((await post(guest, { op: 'play', seatId: 's2', action: { t: 'act', text: '趁机溜走' } })).status).toBe(409)
    expect((await post(guest, { op: 'play', seatId: 's1', action: { t: 'vote', agree: true } })).status).toBe(403)
    expect((await post(guest, { op: 'play', seatId: 's2', action: { t: 'vote', agree: true } })).status).toBe(200)
    t = await tableOf(host)
    expect(t.pending).toBeNull()
    expect(t.turn).toBe(0)
    expect(t.checkpoints).toEqual([])
  })

  it('empties the seat of a player who leaves and skips its turns', async () => {
    const [host, guest] = await open(['阿岚', '小周'])
    await post(host, { op: 'pick', pick: 'helan' })
    await post(guest, { op: 'pick', pick: 'qilan' })
    await post(host, { op: 'start' })
    await post(host, { op: 'play', seatId: 's1', action: { t: 'act', text: '四处看看' } })
    expect((await post(guest, { op: 'leave' })).status).toBe(200)
    const t = await tableOf(host)
    expect(snapshotOf(t).seats.s2.controller).toBe('empty')
    expect(t.turn).toBe(0)
    expect((await post(host, { op: 'play', seatId: 's1', action: { t: 'act', text: '再看看' } })).status).toBe(200)
    expect((await tableOf(host)).turn).toBe(0)
  })

  it('lets watchers follow but not act', async () => {
    const [host, watcher] = await open(['阿岚', '旁观者'])
    await post(host, { op: 'pick', pick: 'helan' })
    await post(host, { op: 'start' })
    expect((await poll(watcher)).table).toBeTruthy()
    expect((await post(watcher, { op: 'play', seatId: 's1', action: { t: 'act', text: '看看' } })).status).toBe(403)
  })

  it('runs free actions through the server-side AI host with receipts', async () => {
    setIselanModel(async (req) => {
      calls.push(req.content)
      return { text: reply, model: 'fake', usage: null }
    })
    const [host] = await open(['阿岚'])
    await post(host, { op: 'pick', pick: 'helan' })
    await post(host, { op: 'start' })
    expect((await post(host, { op: 'play', seatId: 's1', action: { t: 'act', text: '问罗莎最近的怪事' } })).status).toBe(200)
    expect(calls).toHaveLength(1)
    const t = await tableOf(host)
    expect(t.screens.some((s) => s.paragraphs.some((p) => p.includes('你不是来喝酒的')))).toBe(true)
    expect(t.events.some((e) => e.sourceIntentId === 'ai:1')).toBe(true)
  })

  it('judges the run for each player when the ending is written', async () => {
    const [host] = await open(['阿岚'])
    await post(host, { op: 'pick', pick: 'helan' })
    await post(host, { op: 'start' })
    // Play the run to its wrap-up outside the room, then seat it in the room's row.
    const row = (await store.get('production', host.code))!
    let t = await unpackTable(row.data.table!, true).then((r) => (r.status === 'ok' ? r.table : null))
    const model = fakeModel({ seed: 'room', strayRate: 0 })
    const places = ['gray_harbor.seven_lamps', 'gray_harbor.low_tide_street', 'gray_harbor.council_hall', 'gray_harbor.docks'] as const
    for (let i = 0; t && !canWrapUp(t) && i < 300; i++) {
      if (t.pending?.kind === 'interaction') t = (await applyOp(t, { t: 'interact', req: { requestId: `ix-${i}`, instanceId: t.pending.instanceId, action: 'skip', params: { inspected: [] } } }, 's1', { turn: model, ending: null })).table
      else if (t.pending?.kind === 'check') t = (await applyOp(t, { t: 'roll' }, 's1', { turn: model, ending: null })).table
      else if (i % 5 === 4) t = (await applyOp(t, { t: 'move', placeId: places[(i / 5 | 0) % 4] === snapshotOf(t).location?.placeId ? places[((i / 5 | 0) + 1) % 4] : places[(i / 5 | 0) % 4] }, 's1', { turn: model, ending: null })).table
      else t = (await applyOp(t, { t: 'act', text: `${['四处打听消息', '帮人搬货', '和老板讨价还价', '把见闻记下来', '偷偷跟着一个陌生人'][i % 5]}（第 ${i} 件小事）` }, 's1', { turn: model, ending: null })).table
    }
    expect(t && canWrapUp(t)).toBe(true)
    await store.update('production', host.code, row.version, { ...row.data, table: await packTable(wrapUp(t!)) })
    expect((await post(host, { op: 'play', seatId: 's1', action: { t: 'adjudicate' } })).status).toBe(200)
    const room = (await call(host.uid, 'GET', undefined, host.token, `?code=${host.code}&v=0`)).data.room as { judged: Record<string, string[]> }
    expect(room.judged[host.pid]).toContain('ST01')
    expect(snapshotOf(await tableOf(host)).ending).toBeTruthy()
  })

  it('rejects malformed ops', async () => {
    const [host] = await open(['阿岚'])
    expect((await post(host, { op: 'start' })).status).toBe(400)
    await post(host, { op: 'pick', pick: 'helan' })
    await post(host, { op: 'start' })
    for (const action of [{ t: 'ai', narration: 'hack' }, { t: 'move', placeId: 'nowhere' }, { t: 'act', text: '' }, { t: 'resolve', outcomes: ['everything'] }]) {
      expect((await post(host, { op: 'play', seatId: 's1', action })).status).toBe(400)
    }
  })

  it('a watcher joins the running story with a free character (R1a), up to four seats', async () => {
    const [host, guest, late] = await open(['阿岚', '小周', '老王'])
    await post(host, { op: 'pick', pick: 'helan' })
    await post(guest, { op: 'pick', pick: 'qilan' })
    await post(host, { op: 'start' })
    await post(host, { op: 'play', seatId: 's1', action: { t: 'act', text: '四处看看' } })
    expect((await post(late, { op: 'pick', pick: 'helan' })).status).toBe(409)
    expect((await post(late, { op: 'pick', pick: 'fuhe' })).status).toBe(200)
    expect((await post(late, { op: 'pick', pick: 'dawei' })).status).toBe(409)
    const room = await poll(host)
    expect(room.players.find((p) => p.id === late.pid)?.seat).toBe('s3')
    const t = await tableOf(late)
    expect(t.party.map((m) => m.actorId)).toEqual(['helan', 'qilan', 'fuhe'])
    expect(snapshotOf(t).seats.s3).toMatchObject({ controller: 'human', mustOwn: true, ownChoices: 0 })
    expect(room.chat.some((m) => m.text.includes('加入了这一局'))).toBe(true)
  })

  it('drops a resent action made against an older table (A8)', async () => {
    const [host] = await open(['阿岚'])
    await post(host, { op: 'pick', pick: 'helan' })
    await post(host, { op: 'start' })
    const at = (await tableOf(host)).events.length
    const act = { op: 'play', seatId: 's1', at, action: { t: 'act', text: '四处看看墙上的寻人启事' } }
    expect((await post(host, act)).status).toBe(200)
    const after = (await tableOf(host)).events.length
    expect((await post(host, act)).status).toBe(409)
    expect((await tableOf(host)).events.length).toBe(after)
  })
})

