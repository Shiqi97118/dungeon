import type { Character, GameState, Stat, Tier } from '../game/types'
import type { Gm, Intent } from '../game/session'
import type { AiTurn } from '../game/ai'

export interface ChatMsg { id: number; pid: string; name: string; text: string; t: number }

export interface RoomView {
  code: string
  version: number
  hostId: string
  status: 'lobby' | 'play'
  players: { id: string; name: string; seats: string[] }[]
  state: GameState
  chat: ChatMsg[]
  aiOn: boolean
}

export interface Seat { code: string; pid: string; token: string }

export interface ServerInfo { me: { name: string | null }; online: boolean; gm: boolean; open?: boolean }

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const UID_KEY = 'echo-well-uid'

/** A random per-browser id; public deployments use it in place of a sign-in to recognise returning players. */
function browserId() {
  let id = localStorage.getItem(UID_KEY)
  if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    id = crypto.randomUUID().replace(/-/g, '')
    localStorage.setItem(UID_KEY, id)
  }
  return id
}

export async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-echo-client': '1', 'x-echo-uid': browserId() }
  if (init.body) headers['content-type'] = 'application/json'
  if (init.token) headers['x-echo-token'] = init.token
  let res: Response
  try {
    res = await fetch(path, { ...init, headers, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, '网络连接失败')
  }
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { /* not json */ }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error
    throw new ApiError(res.status, msg ?? (res.status === 401 ? '需要登录' : res.status === 404 ? '联机服务不可用（当前是纯静态页面）' : `请求失败（${res.status}）`))
  }
  return data as T
}

export const post = <T>(path: string, body: unknown, token?: string) => call<T>(path, { method: 'POST', body: JSON.stringify(body), token })

let infoCache: Promise<ServerInfo | null> | null = null

export function serverInfo(): Promise<ServerInfo | null> {
  infoCache ??= call<ServerInfo>('api/room').catch(() => null)
  return infoCache
}

export const api = {
  create: (name: string, party: Character[], safety: GameState['safety']) => post<Seat>('api/room', { op: 'create', name, party, safety }),
  join: (code: string, name: string) => post<Seat>('api/room', { op: 'join', code, name }),
  poll: (seat: Seat, v: number) =>
    call<{ version: number; now: number; presence: Record<string, number>; room?: RoomView }>(`api/room?code=${encodeURIComponent(seat.code)}&v=${v}`, { token: seat.token }),
  claim: (seat: Seat, charId: string) => post<{ version: number }>('api/room', { op: 'claim', code: seat.code, charId }, seat.token),
  release: (seat: Seat, charId: string) => post<{ version: number }>('api/room', { op: 'release', code: seat.code, charId }, seat.token),
  start: (seat: Seat) => post<{ version: number }>('api/room', { op: 'start', code: seat.code }, seat.token),
  chat: (seat: Seat, text: string) => post<{ version: number }>('api/room', { op: 'chat', code: seat.code, text }, seat.token),
  leave: (seat: Seat) => post<{ version: number }>('api/room', { op: 'leave', code: seat.code }, seat.token),
  act: (seat: Seat, intent: Intent) => post<{ version: number; error?: string }>('api/room', { op: 'act', code: seat.code, intent }, seat.token),
}

const SEAT_KEY = 'echo-well-seat'

export function loadSeat(): Seat | null {
  try { return JSON.parse(localStorage.getItem(SEAT_KEY) ?? 'null') } catch { return null }
}

export function saveSeat(s: Seat | null) {
  if (s) localStorage.setItem(SEAT_KEY, JSON.stringify(s))
  else localStorage.removeItem(SEAT_KEY)
}

const slim = (s: GameState) => ({ ...s, log: s.log.slice(-30) })

/** The built-in AI host, reached through the app's own server so the key never leaves it. */
export const proxyGm: Gm = {
  propose: (s: GameState, text: string, actorName?: string) => post<AiTurn>('api/gm', { op: 'propose', state: slim(s), text, actorName }),
  resolve: (s: GameState, text: string, r: { actorName: string; stat: Stat; dice: [number, number]; total: number; tier: Tier; risk: string }) =>
    post<AiTurn>('api/gm', { op: 'resolve', state: slim(s), text, r }),
  ending: async (s: GameState, plan: string, tier: Tier) => (await post<{ paragraphs: string[] }>('api/gm', { op: 'ending', state: slim(s), plan, tier })).paragraphs,
}
