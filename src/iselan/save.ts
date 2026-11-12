import { CONFIG } from './config'
import { reduceEvents, stableStringify, verifyLog, type AnyEvent, type Snapshot } from './events'

export const SAVE_VERSION = CONFIG.saveVersion
export const OUTDATED_SAVE_MESSAGE = '世界已更新，旧存档无法继续'
export const OUTDATED_SAVE_ACTION = '开始新的旅程'

/** Save v5 (12 §4.3). `snapshot` is a cache of `reduceEvents(events)` up to `snapshotSeq`. */
export interface SaveFile {
  readonly version: typeof SAVE_VERSION
  readonly runId: string
  readonly seed: string
  readonly createdAt: string
  readonly events: readonly AnyEvent[]
  readonly snapshot: Snapshot
  readonly snapshotSeq: number
  readonly profileId?: string
  /** Every AI response of the run, for the server to match against its receipts on upload (12 §8.4). */
  readonly aiResponses?: readonly { readonly seq: number; readonly text: string }[]
  /** What the table shows and where it can rewind to. Presentation only: rules always replay `events`. */
  readonly table?: Readonly<Record<string, unknown>>
}

export type LoadResult =
  | {
      readonly status: 'ok'
      readonly save: SaveFile
      readonly snapshot: Snapshot
      /** The stored snapshot disagreed with the log and was rebuilt; the caller should log this. */
      readonly snapshotRebuilt: boolean
    }
  | { readonly status: 'outdated'; readonly version: number | null; readonly message: typeof OUTDATED_SAVE_MESSAGE; readonly action: typeof OUTDATED_SAVE_ACTION }
  | { readonly status: 'corrupt'; readonly problems: readonly string[] }

export function createSave(input: {
  runId: string
  seed: string
  createdAt: string
  events: readonly AnyEvent[]
  profileId?: string
  aiResponses?: SaveFile['aiResponses']
  table?: SaveFile['table']
  /** Already reduced from exactly these events, to skip replaying them again. */
  snapshot?: Snapshot
}): SaveFile {
  const snapshot = input.snapshot ?? reduceEvents(input.runId, input.events)
  return {
    version: SAVE_VERSION,
    runId: input.runId,
    seed: input.seed,
    createdAt: input.createdAt,
    events: input.events,
    snapshot,
    snapshotSeq: snapshot.seq,
    ...(input.profileId === undefined ? {} : { profileId: input.profileId }),
    ...(input.aiResponses === undefined ? {} : { aiResponses: input.aiResponses }),
    ...(input.table === undefined ? {} : { table: input.table }),
  }
}

export const serializeSave = (save: SaveFile): string => JSON.stringify(save)

const outdated = (version: number | null): LoadResult => ({ status: 'outdated', version, message: OUTDATED_SAVE_MESSAGE, action: OUTDATED_SAVE_ACTION })

/** Never throws: any unreadable input comes back as `corrupt` or `outdated`. */
export function loadSave(raw: string): LoadResult {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { status: 'corrupt', problems: ['存档不是有效的 JSON'] }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { status: 'corrupt', problems: ['存档不是对象'] }
  const s = data as Record<string, unknown>
  const version = typeof s.version === 'number' ? s.version : null
  if (version === null || version < SAVE_VERSION) return outdated(version)
  if (version > SAVE_VERSION) return { status: 'corrupt', problems: [`存档版本 ${version} 比游戏新`] }

  const problems: string[] = []
  if (typeof s.runId !== 'string' || !s.runId) problems.push('缺少 runId')
  if (typeof s.seed !== 'string') problems.push('缺少 seed')
  if (typeof s.createdAt !== 'string') problems.push('缺少 createdAt')
  if (!Array.isArray(s.events)) problems.push('缺少事件日志')
  if (s.profileId !== undefined && typeof s.profileId !== 'string') problems.push('profileId 不是字符串')
  const responses = s.aiResponses
  if (responses !== undefined && (!Array.isArray(responses) || !responses.every((r) => r && Number.isInteger(r.seq) && typeof r.text === 'string'))) {
    problems.push('AI 回应记录格式错误')
  }
  if (s.table !== undefined && (!s.table || typeof s.table !== 'object' || Array.isArray(s.table))) problems.push('桌面记录格式错误')
  if (problems.length) return { status: 'corrupt', problems }

  const runId = s.runId as string
  const events = s.events as AnyEvent[]
  const logProblems = verifyLog(runId, events)
  if (logProblems.length) return { status: 'corrupt', problems: logProblems }

  const snapshot = reduceEvents(runId, events)
  const snapshotRebuilt = s.snapshotSeq !== snapshot.seq || stableStringify(s.snapshot) !== stableStringify(snapshot)
  const save: SaveFile = {
    version: SAVE_VERSION,
    runId,
    seed: s.seed as string,
    createdAt: s.createdAt as string,
    events,
    snapshot,
    snapshotSeq: snapshot.seq,
    ...(s.profileId === undefined ? {} : { profileId: s.profileId as string }),
    ...(responses === undefined ? {} : { aiResponses: responses as SaveFile['aiResponses'] }),
    ...(s.table === undefined ? {} : { table: s.table as SaveFile['table'] }),
  }
  return { status: 'ok', save, snapshot, snapshotRebuilt }
}
