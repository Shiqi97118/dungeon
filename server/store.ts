import type { CharacterDraft } from '../src/iselan/play/characterDraft.js'

export interface Player {
  id: string
  name: string
  tokenHash: string
  user: string
  /** Selected pre-made or custom character id. */
  pick?: string
  draft?: CharacterDraft
  /** The seat that character took when the story began. */
  seat?: string
  joinedAt: number
}

export interface ChatMsg {
  id: number
  pid: string
  name: string
  text: string
  t: number
}

export interface RoomData {
  hostId: string
  status: 'lobby' | 'play'
  players: Player[]
  hook: string
  /** The shared table (gzip, base64) once the story has begun. */
  table?: string
  /** Achievements each player's characters earned, written when the ending is committed. */
  judged?: Record<string, string[]>
  chat: ChatMsg[]
  chatSeq: number
  aiCalls: number
  createdAt: number
}

export interface RoomRow {
  version: number
  data: RoomData
  presence: Record<string, number>
}

export interface Store {
  get(stage: string, code: string): Promise<RoomRow | null>
  create(stage: string, code: string, hostUser: string, data: RoomData): Promise<boolean>
  update(stage: string, code: string, version: number, data: RoomData): Promise<boolean>
  touch(stage: string, code: string, pid: string, t: number): Promise<void>
  recentByHost(stage: string, user: string, sinceMs: number): Promise<number>
  useQuota(stage: string, user: string, limit: number): Promise<boolean>
}

interface MemRoom extends RoomRow { host: string; createdAt: number }

export class MemoryStore implements Store {
  private rooms = new Map<string, MemRoom>()
  private quota = new Map<string, number>()
  private k = (stage: string, code: string) => `${stage}:${code}`

  async get(stage: string, code: string) {
    const r = this.rooms.get(this.k(stage, code))
    return r ? structuredClone({ version: r.version, data: r.data, presence: r.presence }) : null
  }

  async create(stage: string, code: string, hostUser: string, data: RoomData) {
    if (this.rooms.has(this.k(stage, code))) return false
    this.rooms.set(this.k(stage, code), { version: 1, data: structuredClone(data), presence: {}, host: hostUser, createdAt: Date.now() })
    return true
  }

  async update(stage: string, code: string, version: number, data: RoomData) {
    const r = this.rooms.get(this.k(stage, code))
    if (!r || r.version !== version) return false
    r.version += 1
    r.data = structuredClone(data)
    return true
  }

  async touch(stage: string, code: string, pid: string, t: number) {
    const r = this.rooms.get(this.k(stage, code))
    if (r) r.presence[pid] = t
  }

  async recentByHost(stage: string, user: string, sinceMs: number) {
    let n = 0
    for (const [key, r] of this.rooms) if (key.startsWith(`${stage}:`) && r.host === user && r.createdAt > sinceMs) n++
    return n
  }

  async useQuota(stage: string, user: string, limit: number) {
    const key = `${stage}:${user}:${new Date().toISOString().slice(0, 10)}`
    const n = (this.quota.get(key) ?? 0) + 1
    this.quota.set(key, n)
    return n <= limit
  }
}
