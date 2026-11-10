import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import type { Character, GameState } from '../src/game/types.js'
import { newGame } from '../src/game/engine.js'
import { makeCharacter } from '../src/game/data/characters.js'
import { parseIntent, runIntent } from '../src/game/session.js'
import { AI, controllerOf, mayAct, nextCompanionMove, type Seating } from '../src/game/companion.js'
import { HttpError, assertSameSite, fail, json, readJson } from './http.js'
import type { Player, RoomData, RoomRow, Store } from './store.js'
import { platform, type Viewer } from './platform.js'
import { serverGm } from './gm.js'

const MAX_PLAYERS = 6
const ONLINE_MS = 45_000
const ROOM_AI_LIMIT = 600
const ROOMS_PER_DAY = 20
const ROOMS_PER_IP_DAY = 40
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

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

function seating(row: RoomRow, now = Date.now()): Seating {
  return {
    owner: (charId) => row.data.players.find((p) => p.seats.includes(charId))?.id,
    online: (pid) => (row.presence[pid] ?? 0) > now - ONLINE_MS,
  }
}

function view(code: string, row: RoomRow) {
  const d = row.data
  return {
    code,
    version: row.version,
    hostId: d.hostId,
    status: d.status,
    players: d.players.map((p) => ({ id: p.id, name: p.name, seats: p.seats })),
    state: d.state,
    chat: d.chat,
    aiOn: !!serverGm() && d.aiCalls < ROOM_AI_LIMIT,
  }
}

const n = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)))
const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const list = (v: unknown, count: number, max: number) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, count).map((x: string) => x.slice(0, max)) : [])

function cleanParty(raw: unknown): Character[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 4) throw new HttpError(400, '队伍需要 1–4 名角色')
  const seen = new Set<string>()
  return raw.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>
    const st = (o.stats ?? {}) as Record<string, unknown>
    let id = s(o.id, 24).replace(/[^a-zA-Z0-9_-]/g, '') || `c${i}`
    if (seen.has(id)) id = `${id}${i}`
    seen.add(id)
    return makeCharacter({
      id,
      name: s(o.name, 12) || `旅人${i + 1}`,
      title: s(o.title, 24),
      sigil: s(o.sigil, 2) || '？',
      hue: n(o.hue, 0, 360),
      stats: { str: n(st.str, -1, 2), dex: n(st.dex, -1, 2), ins: n(st.ins, -1, 2), soc: n(st.soc, -1, 2) },
      specialties: list(o.specialties, 3, 8),
      items: list(o.items, 5, 16),
      motive: s(o.motive, 80),
      hook: s(o.hook, 80),
      memento: s(o.memento, 40),
      reason: s(o.reason, 120) || undefined,
      relation: s(o.relation, 80) || undefined,
    })
  })
}

async function mutate(store: Store, stage: string, code: string, request: Request, fn: (d: RoomData, me: Player, row: RoomRow) => void) {
  for (let i = 0; i < 4; i++) {
    const row = await store.get(stage, code)
    if (!row) throw new HttpError(404, '房间不存在或已过期')
    const me = authPlayer(row, request)
    fn(row.data, row.data.players.find((p) => p.id === me.id)!, row)
    if (await store.update(stage, code, row.version, row.data)) return { version: row.version + 1, me }
  }
  throw new HttpError(409, '房间正忙，请重试')
}

const progress = (st: GameState) =>
  `${st.seq}|${st.queue.length}|${!!st.rolling}|${!!st.rollReq}|${st.turns?.round}|${st.turns?.idx}|${st.location}|${st.phase}`

const usesGm = (st: GameState, t: string) =>
  t === 'free' || (t === 'rollCommit' && (st.rolling?.kind === 'ai' || st.rolling?.kind === 'final'))

async function roomGm(store: Store, v: Viewer, d: RoomData) {
  const gm = d.aiCalls < ROOM_AI_LIMIT ? serverGm() : null
  return gm && (await spendGlobalAi(store, v)) ? gm : null
}

/** Plays one step for an AI companion if one holds the table and the last step has had time to show. */
async function driveCompanion(store: Store, v: Viewer, code: string, row: RoomRow): Promise<RoomRow> {
  const d = row.data
  if (d.status !== 'play') return row
  const seat = seating(row)
  const move = nextCompanionMove(d.state, (id) => controllerOf(seat, id) === AI)
  if (!move || Date.now() - (d.lastAt ?? 0) < move.delay) return row
  const res = await runIntent(d.state, move.intent, usesGm(d.state, move.intent.t) ? await roomGm(store, v, d) : null)
  let state = res.state
  if (progress(state) === progress(d.state)) state = (await runIntent(d.state, { t: 'pass' }, null)).state
  if (progress(state) === progress(d.state)) return row
  const next: RoomData = { ...d, state, aiCalls: d.aiCalls + res.aiCalls, lastAt: Date.now() }
  if (await store.update(v.stage, code, row.version, next)) return { ...row, version: row.version + 1, data: next }
  return row
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
      if (!codeParam) return json({ me: { name: ident.name }, online: !!store, gm: !!serverGm(), open: ident.open })
      if (!store) throw new HttpError(503, '联机服务暂不可用')
      const code = cleanCode(codeParam)
      let row = await store.get(stage, code)
      if (!row) throw new HttpError(404, '房间不存在或已过期')
      const me = authPlayer(row, request)
      const now = Date.now()
      if ((row.presence[me.id] ?? 0) < now - 8000) {
        await store.touch(stage, code, me.id, now)
        row.presence[me.id] = now
      }
      row = await driveCompanion(store, ident, code, row)
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
      const party = cleanParty(body.party)
      const sf = (body.safety ?? {}) as Record<string, unknown>
      const state: GameState = newGame(party, { softMemory: sf.softMemory === true, softTrapped: sf.softTrapped === true }, { turns: true })
      const token = newToken()
      const host: Player = { id: newId(), name: cleanName(body.name, ident.name ?? ''), tokenHash: hash(token), user: ident.sub, seats: [], joinedAt: Date.now() }
      const data: RoomData = { hostId: host.id, status: 'lobby', players: [host], state, chat: [], chatSeq: 0, aiCalls: 0, createdAt: Date.now() }
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
        const row = await store.get(stage, code)
        if (!row) throw new HttpError(404, '房间不存在或已过期')
        const d = row.data
        const token = newToken()
        let me = ident.reuse ? d.players.find((p) => p.user === ident.sub) : undefined
        if (me) {
          me.tokenHash = hash(token)
          me.name = cleanName(body.name, me.name)
        } else {
          if (d.players.length >= MAX_PLAYERS) throw new HttpError(409, '房间已满（最多 6 人）')
          me = { id: newId(), name: cleanName(body.name, ident.name ?? ''), tokenHash: hash(token), user: ident.sub, seats: [], joinedAt: Date.now() }
          d.players.push(me)
          d.chatSeq += 1
          d.chat = [...d.chat, { id: d.chatSeq, pid: '', name: '', text: `${me.name} 加入了房间`, t: Date.now() }].slice(-60)
        }
        if (await store.update(stage, code, row.version, d)) {
          await store.touch(stage, code, me.id, Date.now())
          return json({ code, pid: me.id, token })
        }
      }
      throw new HttpError(409, '房间正忙，请重试')
    }

    if (op === 'claim' || op === 'release') {
      const charId = s(body.charId, 40)
      const r = await mutate(store, stage, code, request, (d, me) => {
        if (!d.state.party.some((c) => c.id === charId)) throw new HttpError(400, '没有这个角色')
        if (op === 'claim') {
          if (d.players.some((p) => p.id !== me.id && p.seats.includes(charId))) throw new HttpError(409, '这个角色已经有人了')
          me.seats = [charId]
        } else {
          me.seats = me.seats.filter((x) => x !== charId)
        }
      })
      return json({ ok: true, version: r.version })
    }

    if (op === 'start') {
      const r = await mutate(store, stage, code, request, (d, me) => {
        if (d.hostId !== me.id) throw new HttpError(403, '只有房主可以开始')
        d.status = 'play'
        d.lastAt = Date.now()
      })
      return json({ ok: true, version: r.version })
    }

    if (op === 'chat') {
      const text = stripControl(s(body.text, 200)).trim()
      if (!text) throw new HttpError(400, '说点什么吧')
      const r = await mutate(store, stage, code, request, (d, me) => {
        d.chatSeq += 1
        d.chat = [...d.chat, { id: d.chatSeq, pid: me.id, name: me.name, text, t: Date.now() }].slice(-60)
      })
      return json({ ok: true, version: r.version })
    }

    if (op === 'leave') {
      const r = await mutate(store, stage, code, request, (d, me) => {
        d.players = d.players.filter((p) => p.id !== me.id)
        if (d.hostId === me.id && d.players[0]) d.hostId = d.players[0].id
        d.chatSeq += 1
        d.chat = [...d.chat, { id: d.chatSeq, pid: '', name: '', text: `${me.name} 离开了房间`, t: Date.now() }].slice(-60)
      })
      return json({ ok: true, version: r.version })
    }

    if (op === 'act') {
      const intent = parseIntent(body.intent)
      if (!intent) throw new HttpError(400, '无效的行动')
      const row = await store.get(stage, code)
      if (!row) throw new HttpError(404, '房间不存在或已过期')
      const me = authPlayer(row, request)
      const d = row.data
      if (d.status !== 'play') throw new HttpError(409, '冒险还没有开始')
      if (!mayAct(d.state, intent, me.id, seating(row))) throw new HttpError(403, '现在不是你的回合')
      let cur = row.version
      const gm = usesGm(d.state, intent.t) ? await roomGm(store, ident, d) : null
      const res = await runIntent(d.state, intent, gm, {
        interim: async (st) => {
          if (await store.update(stage, code, cur, { ...d, state: st })) cur += 1
        },
      })
      d.state = res.state
      d.aiCalls += res.aiCalls
      d.lastAt = Date.now()
      if (!(await store.update(stage, code, cur, d))) throw new HttpError(409, '有人抢先一步行动了，已为你刷新')
      return json({ ok: true, version: cur + 1, error: res.error })
    }

    throw new HttpError(400, '未知操作')
  } catch (e) {
    if (e instanceof Response) return e
    return fail(e)
  }
}
