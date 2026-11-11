import type { AnyDraft, AnyEvent } from './types'
import { validateEvent } from './validate'

export class EventRejectedError extends Error {
  readonly problems: readonly string[]
  constructor(problems: readonly string[]) {
    super(`事件被拒绝：${problems.join('；')}`)
    this.problems = problems
    this.name = 'EventRejectedError'
  }
}

export interface CommitContext {
  readonly runId: string
  /** Supplied by the caller so that replaying the same intents gives the same log. */
  readonly committedAt: string
  readonly accountIds?: readonly string[]
  readonly partyId?: string | null
}

export interface CommitResult {
  readonly events: readonly AnyEvent[]
  readonly committed: readonly AnyEvent[]
  /** The intent was already in the log; nothing was appended. */
  readonly duplicate: boolean
}

export const eventIdOf = (runId: string, seq: number) => `${runId}:${seq}`

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) freeze(v)
    Object.freeze(value)
  }
  return value
}

/**
 * Appends every event of one intent as a single transaction: all drafts are validated
 * first and either all are appended or none is. An intent id already present in the log
 * is a retry and changes nothing.
 */
export function commitIntent(events: readonly AnyEvent[], intentId: string, drafts: readonly AnyDraft[], ctx: CommitContext): CommitResult {
  if (!intentId) throw new EventRejectedError(['意图编号为空'])
  if (events.some((e) => e.sourceIntentId === intentId)) return { events, committed: [], duplicate: true }

  const problems = drafts.flatMap((d, i) => validateEvent(d.type, d.payload, d.regionId).map((p) => `第 ${i + 1} 个事件 ${p}`))
  if (problems.length) throw new EventRejectedError(problems)

  const last = events.length ? events[events.length - 1].seq : 0
  const committed = drafts.map(
    (d, i) =>
      freeze({
        schemaVersion: 1,
        eventId: eventIdOf(ctx.runId, last + i + 1),
        runId: ctx.runId,
        seq: last + i + 1,
        type: d.type,
        actorIds: [...(d.actorIds ?? [])],
        accountIds: [...(ctx.accountIds ?? [])],
        partyId: ctx.partyId ?? null,
        ...(d.regionId === undefined ? {} : { regionId: d.regionId }),
        ...(d.subjectId === undefined ? {} : { subjectId: d.subjectId }),
        payload: structuredClone(d.payload),
        sourceIntentId: intentId,
        committedAt: ctx.committedAt,
        visibility: d.visibility ?? 'party',
      }) as AnyEvent,
  )
  return { events: Object.freeze([...events, ...committed]), committed, duplicate: false }
}

/** Structural checks for a log read from storage. Returns problems; empty means the log is usable. */
export function verifyLog(runId: string, events: readonly unknown[]): string[] {
  const problems: string[] = []
  const closedIntents = new Set<string>()
  let prevIntent: string | null = null
  events.forEach((raw, i) => {
    const e = raw as Partial<AnyEvent> | null
    const at = `第 ${i + 1} 个事件`
    if (!e || typeof e !== 'object') return problems.push(`${at}不是对象`)
    if (e.schemaVersion !== 1) problems.push(`${at} schemaVersion 不是 1`)
    if (e.runId !== runId) problems.push(`${at}属于另一局（${e.runId}）`)
    if (e.seq !== i + 1) problems.push(`${at}的 seq 应为 ${i + 1}，实际是 ${e.seq}`)
    if (e.eventId !== eventIdOf(runId, i + 1)) problems.push(`${at}的 eventId 不符`)
    if (typeof e.sourceIntentId !== 'string' || !e.sourceIntentId) problems.push(`${at}缺少 sourceIntentId`)
    else if (e.sourceIntentId !== prevIntent) {
      if (closedIntents.has(e.sourceIntentId)) problems.push(`${at}的意图 ${e.sourceIntentId} 不连续，同一意图只能是一次提交`)
      if (prevIntent) closedIntents.add(prevIntent)
      prevIntent = e.sourceIntentId
    }
    for (const p of validateEvent(String(e.type), e.payload, e.regionId)) problems.push(`${at} ${p}`)
  })
  return problems
}
