import type { TableOp } from '../iselan/play'
import type { InteractionResult } from '../iselan/interaction'

export interface ChatMsg { id: number; pid: string; name: string; text: string; t: number }

export interface RoomPlayer { id: string; name: string; pick: string | null; seat: string | null }

export interface RoomView {
  code: string
  version: number
  hostId: string
  status: 'lobby' | 'play'
  hook: string
  players: RoomPlayer[]
  /** The shared table, packed (`unpackTable`); null until the story begins. */
  table: string | null
  /** Achievement ids each player's character earned, once the ending is written. */
  judged: Record<string, string[]>
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
  create: (name: string, hook: string) => post<Seat>('api/room', { op: 'create', name, hook }),
  join: (code: string, name: string) => post<Seat>('api/room', { op: 'join', code, name }),
  poll: (seat: Seat, v: number) =>
    call<{ version: number; now: number; presence: Record<string, number>; room?: RoomView }>(`api/room?code=${encodeURIComponent(seat.code)}&v=${v}`, { token: seat.token }),
  pick: (seat: Seat, pick: string | null) => post<{ version: number }>('api/room', pick ? { op: 'pick', code: seat.code, pick } : { op: 'unpick', code: seat.code }, seat.token),
  hook: (seat: Seat, hook: string) => post<{ version: number }>('api/room', { op: 'hook', code: seat.code, hook }, seat.token),
  start: (seat: Seat) => post<{ version: number }>('api/room', { op: 'start', code: seat.code }, seat.token),
  chat: (seat: Seat, text: string) => post<{ version: number }>('api/room', { op: 'chat', code: seat.code, text }, seat.token),
  leave: (seat: Seat) => post<{ version: number }>('api/room', { op: 'leave', code: seat.code }, seat.token),
  /** `at` is the table length the action was chosen on; the server drops it if the table has moved since. */
  play: (seat: Seat, seatId: string, action: TableOp, at?: number) =>
    post<{ version: number; result: InteractionResult | null }>('api/room', { op: 'play', code: seat.code, seatId, action, ...(at === undefined ? {} : { at }) }, seat.token),
}

const SEAT_KEY = 'echo-well-seat'

export function loadSeat(): Seat | null {
  try { return JSON.parse(localStorage.getItem(SEAT_KEY) ?? 'null') } catch { return null }
}

export function saveSeat(s: Seat | null) {
  if (s) localStorage.setItem(SEAT_KEY, JSON.stringify(s))
  else localStorage.removeItem(SEAT_KEY)
}
