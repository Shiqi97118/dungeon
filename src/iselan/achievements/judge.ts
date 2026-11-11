import type { AnyEvent } from '../events'
import type { AchievementJudge, Earned } from '../profile'
import { CATALOG, V1_ACHIEVEMENTS } from './catalog'
import type { AchievementDef, AchievementRule } from './types'

function matches(rule: Extract<AchievementRule, { op: 'event' }>, e: AnyEvent): boolean {
  if (e.type !== rule.type) return false
  const payload = e.payload as unknown as Readonly<Record<string, unknown>>
  return Object.entries(rule.where).every(([k, v]) => payload[k] === v)
}

/** The first committed event that satisfies `def`, or null. */
export function earningEvent(def: AchievementDef, events: readonly AnyEvent[]): AnyEvent | null {
  const rule = def.rule
  if (rule.op !== 'event') throw new Error(`${def.id}：首版只判定 event 规则，收到 ${rule.op}`)
  return events.find((e) => matches(rule, e)) ?? null
}

const JUDGED = CATALOG.filter((a) => V1_ACHIEVEMENTS.includes(a.id))

/**
 * 12 §6.1 v1 achievements over a log the server replayed itself, each attributed to the first
 * event that earned it, in log order. Deterministic: the same log always gives the same list.
 */
export const judgeAchievements: AchievementJudge = (_snapshot, events) => {
  const earned: (Earned & { seq: number })[] = []
  for (const def of JUDGED) {
    const e = earningEvent(def, events)
    if (e) earned.push({ achievementId: def.id, eventId: e.eventId, seq: e.seq })
  }
  return earned.sort((a, b) => a.seq - b.seq).map(({ achievementId, eventId }) => ({ achievementId, eventId }))
}
