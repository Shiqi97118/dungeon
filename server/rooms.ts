import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { HttpError, assertSameSite, fail, json, readJson } from './http.js'
import type { Player, RoomData, RoomRow, Store } from './store.js'
import { platform, type Viewer } from './platform.js'
import { guarded } from './budget.js'
import { iselanModel, iselanModelId, iselanTurn, type IselanModel } from './iselanTurn.js'
import { recordRoomRun } from './profile.js'
import { CONFIG } from '../src/iselan/config.js'
import { VOCAB, type OpeningHookId } from '../src/iselan/data/index.js'
import { estimateTokens } from '../src/iselan/ai/tokens.js'
import { ModelUnavailable, type AiResponse } from '../src/iselan/ai/turn.js'
import { InteractionRejected } from '../src/iselan/interaction/index.js'
import {
  applyOp, byOwnSeat, joinTable, leaveSeat, openTable, packTable, parseOp, PREGENS, seatsFor, snapshotOf, soloMember, unpackTable, type Models, type Table,
} from '../src/iselan/play/index.js'

const MAX_PLAYERS = 6
/** A shared table seats up to four characters; anyone else in the room watches. */
const MAX_SEATS = 4
const ONLINE_MS = 45_000
const ROOM_AI_LIMIT = 600
const ROOMS_PER_DAY = 20
const ROOMS_PER_IP_DAY = 40
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const HOOKS = Object.values(VOCAB.openingHooks) as readonly OpeningHookId[]

const stripControl = (t: string) => Array.from(t).map((ch) => (ch.charCodeAt(0) < 32 ? ' ' : ch)).join('')
const hash = (t: string) => createHash('sha256').update(t).digest('hex')
const newToken = () => randomBytes(24).toString('base64url')
const newId = () => randomBytes(6).toString('hex')
const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')

export const globalAiLimit = () => Math.max(0, Number(process.env.GM_DAILY_LIMIT) || 3000)

/** Counts one AI call against the deployment-wide daily cap that protects the operator's API key. */
export async function spendGlobalAi(store: Store, v: Viewer) {
  return !v.open || store.useQuota(v.stage, 'gm-all', globalAiLimit())
}

function cleanCode(v: unknown) {
  const c = typeof v === 'string' ? v.trim().toUpperCase() : ''
  if (!/^[A-Z0-9]{6}$/.test(c)) throw new HttpError(400, '房间码应为 6 位字母或数字')
  return c
}

function cleanName(v: unknown, fallback: string) {
  const n = stripControl(typeof v === 'string' ? v : '').trim().slice(0, 12)
  return n || fallback.slice(0, 12) || '旅人'
}

const cleanHook = (v: unknown): OpeningHookId => (HOOKS.includes(v as OpeningHookId) ? (v as OpeningHookId) : 'memento')

function sameToken(p: Player, token: string) {
  const a = Buffer.from(p.tokenHash, 'hex')
  const b = Buffer.from(hash(token), 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

function authPlayer(row: RoomRow, request: Request): Player {
  const token = request.headers.get('x-echo-token') ?? ''
  const p = token ? row.data.players.find((x) => sameToken(x, token)) : undefined
  if (!p) throw new HttpError(403, '你不在这个房间里，请重新加入')
  return p
}

/**
 * The last tables this isolate packed or read, keyed by their packed form: the next op on the
 * same room usually lands here and skips the gzip and parse. Tables are immutable, so sharing is safe.
 */
const recent = new Map<string, Table>()
const remember = (packed: string, t: Table) => {
  recent.delete(packed)
  recent.set(packed, t)
  if (recent.size > 8) recent.delete(recent.keys().next().value!)
}

async function pack(t: Table): Promise<string> {
  const packed = await packTable(t)
  remember(packed, t)
  return packed
}

async function unpack(packed: string): Promise<Table> {
  const hit = recent.get(packed)
  if (hit) return hit
  const r = await unpackTable(packed, true)
  if (r.status !== 'ok') throw new HttpError(500, '房间里的进度读不出来')
  remember(packed, r.table)
  return r.table
}

function view(code: string, row: RoomRow) {
  const d = row.data
  const p = platform()
  return {
    code,
    version: row.version,
    hostId: d.hostId,
    status: d.status,
    hook: d.hook,
    players: d.players.map((x) => ({ id: x.id, name: x.name, pick: x.pick ?? null, seat: x.seat ?? null })),
    table: d.table ?? null,
    judged: d.judged ?? {},
    chat: d.chat,
    aiOn: !!iselanModel() && !!p.profiles?.() && !!p.budget?.() && d.aiCalls < ROOM_AI_LIMIT,
  }
}

/** Rooms from the earlier chapter have no hook and no table; they cannot be played any more. */
async function getRoom(store: Store, stage: string, code: string): Promise<RoomRow> {
  const row = await store.get(stage, code)
  if (!row) throw new HttpError(404, '房间不存在或已过期')
  if (typeof row.data.hook !== 'string') throw new HttpError(404, '这个房间来自旧版本，已经关闭，请新开一个房间')
  return row
}

async function mutate(store: Store, stage: string, code: string, request: Request, fn: (d: RoomData, me: Player, row: RoomRow) => void) {
  for (let i = 0; i < 4; i++) {
    const row = await getRoom(store, stage, code)
    const me = authPlayer(row, request)
    fn(row.data, row.data.players.find((p) => p.id === me.id)!, row)
    if (await store.update(stage, code, row.version, row.data)) return { version: row.version + 1, me }
  }
  throw new HttpError(409, '房间正忙，请重试')
}

const online = (row: RoomRow, pid: string, now = Date.now()) => (row.presence[pid] ?? 0) > now - ONLINE_MS

/**
 * A seat is played by the player who took it; while that player is away (or gone), anyone in the
 * room may play it so the table does not stall.
 */
function mayPlay(row: RoomRow, me: Player, seatId: string) {
  const owner = row.data.players.find((p) => p.seat === seatId)
  return !owner || owner.id === me.id || !online(row, owner.id)
}

/** The built-in host for a room: the same model, receipts and cost guard as solo, metered per room. */
function roomModels(store: Store, v: Viewer, code: string, t: Table, d: RoomData, spent: { n: number }): Models {
  const p = platform()
  const receipts = p.profiles?.()
  const budget = p.budget?.()
  if (!receipts || !budget || d.aiCalls >= ROOM_AI_LIMIT) return { turn: null, ending: null }
  let next = t.responses.reduce((m, r) => Math.max(m, r.seq), 0) + 1
  const call = (kind: 'turn' | 'ending') => {
    const model = iselanModel(kind)
    const modelId = iselanModelId(kind)
    if (!model || !modelId) return null
    return async ({ content }: { readonly content: string }): Promise<AiResponse> => {
      if (!(await spendGlobalAi(store, v))) throw new ModelUnavailable(429, '今天的 AI 主持次数已用完')
      const metered: IselanModel = (r) =>
        guarded(budget, {
          stage: v.stage, kind, model: modelId, now: Date.now(), counts: [{ key: `room:${code}`, limit: CONFIG.cost.dailyLimits.room }],
          inputTokens: estimateTokens(r.system) + estimateTokens(r.content),
        }, async () => {
          const reply = await model(r)
          return { value: reply, usage: reply.usage }
        })
      try {
        const { seq, text } = await iselanTurn(metered, receipts, { runId: t.runId, seq: next++, content }, Date.now(), kind)
        spent.n += 1
        return { seq, text }
      } catch (e) {
        throw new ModelUnavailable(e instanceof HttpError ? e.status : 502, (e as Error).message)
      }
    }
  }
  return { turn: call('turn'), ending: call('ending') }
}

/** R1a: a watcher takes a free pre-made character into the running story, up to the table's limit. */
async function joinMidRun(store: Store, stage: string, code: string, request: Request, pick: string) {
  const gen = PREGENS.find((x) => x.id === pick)
  if (!gen) throw new HttpError(400, '没有这个角色')
  for (let i = 0; i < 4; i++) {
    const row = await getRoom(store, stage, code)
    const me = authPlayer(row, request)
    const d = row.data
    if (me.seat) throw new HttpError(409, '你已经在桌上了')
    const t = await unpack(d.table!)
    if (t.party.filter((m) => snapshotOf(t).seats[m.seatId]?.controller !== 'empty').length >= MAX_SEATS) throw new HttpError(409, `一桌最多 ${MAX_SEATS} 名角色，其余的人可以旁观`)
    if (t.party.some((m) => m.actorId === pick)) throw new HttpError(409, '这个角色已经在故事里了')
    const seatId = `s${t.party.length + 1}`
    let joined: Table
    try {
      joined = joinTable(t, { ...soloMember(gen), seatId }, {})
    } catch (e) {
      throw new HttpError(409, (e as Error).message)
    }
    me.pick = pick
    me.seat = seatId
    d.table = await pack(joined)
    d.chatSeq += 1
    d.chat = [...d.chat, { id: d.chatSeq, pid: '', name: '', text: `${me.name} 带着${gen.name}加入了这一局`, t: Date.now() }].slice(-60)
    if (await store.update(stage, code, row.version, d)) return { ok: true, version: row.version + 1 }
  }
  throw new HttpError(409, '房间正忙，请重试')
}

/** 12 §10.3: an ended online run is judged here on the room's own log, once per player at the table. */
async function judge(stage: string, d: RoomData, t: Table) {
  const store = platform().profiles?.()
  if (!store || !snapshotOf(t).ending) return d.judged
  const judged: Record<string, string[]> = {}
  for (const p of d.players) {
    const m = p.seat ? t.party.find((x) => x.seatId === p.seat) : undefined
    if (!m) continue
    const r = await recordRoomRun(store, { stage, sub: p.user, name: p.name, seatId: m.seatId }, t.runId, t.events, [m.actorId])
    if (r) judged[p.id] = [...r.earned]
  }
  return judged
}

export async function handleRoom(request: Request): Promise<Response> {
  try {
    const p = platform()
    const ident = await p.viewer(request)
    if (ident instanceof Response) return ident
    const store = p.store()
    const stage = ident.stage
    const url = new URL(request.url)

    if (request.method === 'GET') {
      const codeParam = url.searchParams.get('code')
      if (!codeParam) return json({ me: { name: ident.name }, online: !!store, gm: !!iselanModel() && !!p.profiles?.() && !!p.budget?.(), open: ident.open })
      if (!store) throw new HttpError(503, '联机服务暂不可用')
      const code = cleanCode(codeParam)
      const row = await getRoom(store, stage, code)
      const me = authPlayer(row, request)
      const now = Date.now()
      if ((row.presence[me.id] ?? 0) < now - 8000) {
        await store.touch(stage, code, me.id, now)
        row.presence[me.id] = now
      }
      const known = Number(url.searchParams.get('v') ?? 0)
      return json({ version: row.version, now, presence: row.presence, room: known === row.version ? undefined : view(code, row) })
    }

    if (request.method !== 'POST') return json({ error: '不支持的请求' }, 405)
    assertSameSite(request)
    if (!store) throw new HttpError(503, '联机服务需要数据库，当前不可用')
    const body = await readJson(request, 64_000)
    const op = body.op

    if (op === 'create') {
      if ((await store.recentByHost(stage, ident.sub, Date.now() - 86_400_000)) >= ROOMS_PER_DAY) throw new HttpError(429, '今天开的房间太多了，明天再来吧')
      if (ident.open && !(await store.useQuota(stage, `rooms-ip:${ident.ip ?? 'unknown'}`, ROOMS_PER_IP_DAY))) throw new HttpError(429, '今天开的房间太多了，明天再来吧')
      const token = newToken()
      const host: Player = { id: newId(), name: cleanName(body.name, ident.name ?? ''), tokenHash: hash(token), user: ident.sub, joinedAt: Date.now() }
      const data: RoomData = { hostId: host.id, status: 'lobby', players: [host], hook: cleanHook(body.hook), chat: [], chatSeq: 0, aiCalls: 0, createdAt: Date.now() }
      for (let i = 0; i < 6; i++) {
        const code = newCode()
        if (await store.create(stage, code, ident.sub, data)) {
          await store.touch(stage, code, host.id, Date.now())
          return json({ code, pid: host.id, token })
        }
      }
      throw new HttpError(500, '没能生成房间码，请重试')
    }

    const code = cleanCode(body.code)

    if (op === 'join') {
      for (let i = 0; i < 4; i++) {
        const row = await getRoom(store, stage, code)
        const d = row.data
        const token = newToken()
        let me = ident.reuse ? d.players.find((x) => x.user === ident.sub) : undefined
        if (me) {
          me.tokenHash = hash(token)
          me.name = cleanName(body.name, me.name)
        } else {
          if (d.players.length >= MAX_PLAYERS) throw new HttpError(409, '房间已满（最多 6 人）')
          me = { id: newId(), name: cleanName(body.name, ident.name ?? ''), tokenHash: hash(token), user: ident.sub, joinedAt: Date.now() }
          d.players.push(me)
          d.chatSeq += 1
          d.chat = [...d.chat, { id: d.chatSeq, pid: '', name: '', text: `${me.name} 加入了房间${d.status === 'play' ? '（旁观）' : ''}`, t: Date.now() }].slice(-60)
        }
        if (await store.update(stage, code, row.version, d)) {
          await store.touch(stage, code, me.id, Date.now())
          return json({ code, pid: me.id, token })
        }
      }
      throw new HttpError(409, '房间正忙，请重试')
    }

    if (op === 'pick' && typeof body.pick === 'string') {
      const row0 = await getRoom(store, stage, code)
      if (row0.data.status === 'play') return json(await joinMidRun(store, stage, code, request, body.pick))
    }

    if (op === 'pick' || op === 'unpick') {
      const pick = typeof body.pick === 'string' ? body.pick : ''
      const r = await mutate(store, stage, code, request, (d, me) => {
        if (d.status !== 'lobby') throw new HttpError(409, '故事已经开始，不能再换角色')
        if (op === 'unpick') { delete me.pick; return }
        if (!PREGENS.some((x) => x.id === pick)) throw new HttpError(400, '没有这个角色')
        if (d.players.some((x) => x.id !== me.id && x.pick === pick)) throw new HttpError(409, '这个角色已经有人了')
        if (!me.pick && d.players.filter((x) => x.pick).length >= MAX_SEATS) throw new HttpError(409, `一桌最多 ${MAX_SEATS} 名角色，其余的人可以旁观`)
        me.pick = pick
      })
      return json({ ok: true, version: r.version })
    }

    if (op === 'hook') {
      const r = await mutate(store, stage, code, request, (d, me) => {
        if (d.hostId !== me.id) throw new HttpError(403, '只有房主可以选开场')
        if (d.status !== 'lobby') throw new HttpError(409, '故事已经开始')
        d.hook = cleanHook(body.hook)
      })
      return json({ ok: true, version: r.version })
    }

    if (op === 'start') {
      const row = await getRoom(store, stage, code)
      const me = authPlayer(row, request)
      const d = row.data
      if (d.hostId !== me.id) throw new HttpError(403, '只有房主可以开始')
      if (d.status !== 'lobby') throw new HttpError(409, '故事已经开始')
      const seated = d.players.filter((x) => x.pick)
      if (!seated.length) throw new HttpError(400, '至少要有一人选好角色')
      const party = seated.map((x, i) => ({ ...soloMember(PREGENS.find((g) => g.id === x.pick)!), seatId: `s${i + 1}` }))
      seated.forEach((x, i) => { x.seat = `s${i + 1}` })
      const runId = randomUUID()
      d.table = await pack(openTable({ runId, seed: runId.slice(0, 8), party, openingHook: d.hook as OpeningHookId, mode: 'online' }))
      d.status = 'play'
      if (!(await store.update(stage, code, row.version, d))) throw new HttpError(409, '房间正忙，请重试')
      return json({ ok: true, version: row.version + 1 })
    }

    if (op === 'chat') {
      const text = stripControl(typeof body.text === 'string' ? body.text.slice(0, 200) : '').trim()
      if (!text) throw new HttpError(400, '说点什么吧')
      const r = await mutate(store, stage, code, request, (d, me) => {
        d.chatSeq += 1
        d.chat = [...d.chat, { id: d.chatSeq, pid: me.id, name: me.name, text, t: Date.now() }].slice(-60)
      })
      return json({ ok: true, version: r.version })
    }

    if (op === 'leave') {
      for (let i = 0; i < 4; i++) {
        const row = await getRoom(store, stage, code)
        const me = authPlayer(row, request)
        const d = row.data
        if (d.table && me.seat) d.table = await pack(leaveSeat(await unpack(d.table), me.seat))
        d.players = d.players.filter((x) => x.id !== me.id)
        if (d.hostId === me.id && d.players[0]) d.hostId = d.players[0].id
        d.chatSeq += 1
        d.chat = [...d.chat, { id: d.chatSeq, pid: '', name: '', text: `${me.name} 离开了房间`, t: Date.now() }].slice(-60)
        if (await store.update(stage, code, row.version, d)) return json({ ok: true, version: row.version + 1 })
      }
      throw new HttpError(409, '房间正忙，请重试')
    }

    if (op === 'play') {
      const action = parseOp(body.action)
      if (!action) throw new HttpError(400, '无效的行动')
      const seatId = typeof body.seatId === 'string' ? body.seatId : ''
      const row = await getRoom(store, stage, code)
      const me = authPlayer(row, request)
      const d = row.data
      if (d.status !== 'play' || !d.table) throw new HttpError(409, '冒险还没有开始')
      const before = d.table
      const t = await unpack(before)
      // A resent request (lost response, double tap) was made against an older table: drop it.
      if (typeof body.at === 'number' && body.at !== t.events.length) throw new HttpError(409, '这一步已经有了结果，已为你刷新')
      // Watchers follow along; only players with a character at the table act.
      if (!me.seat) throw new HttpError(403, '你在旁观这一局')
      const allowed = seatsFor(t, action)
      const own = byOwnSeat(t, action) || allowed === 'any' ? seatId === me.seat : mayPlay(row, me, seatId)
      if (!own || (allowed !== 'any' && !allowed.includes(seatId))) throw new HttpError(403, '现在不是你的回合')
      const spent = { n: 0 }
      let out
      try {
        out = await applyOp(t, action, seatId, roomModels(store, ident, code, t, d, spent))
      } catch (e) {
        if (e instanceof HttpError) throw e
        throw new HttpError(e instanceof InteractionRejected ? 422 : 409, (e as Error).message)
      }
      const ended = !snapshotOf(t).ending && !!snapshotOf(out.table).ending
      const packed = await pack(out.table)
      // Chat and presence may have moved the row meanwhile; the table itself must not have.
      for (let i = 0; i < 4; i++) {
        const cur = i === 0 ? row : await store.get(stage, code)
        if (!cur || cur.data.table !== before) throw new HttpError(409, '有人抢先一步行动了，已为你刷新')
        const next: RoomData = { ...cur.data, table: packed, aiCalls: cur.data.aiCalls + spent.n }
        if (ended) next.judged = await judge(stage, next, out.table)
        if (await store.update(stage, code, cur.version, next)) return json({ ok: true, version: cur.version + 1, result: out.result ?? null })
      }
      throw new HttpError(409, '房间正忙，请重试')
    }

    throw new HttpError(400, '未知操作')
  } catch (e) {
    if (e instanceof Response) return e
    return fail(e)
  }
}
