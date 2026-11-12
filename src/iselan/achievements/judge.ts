import type { AnyEvent } from '../events'
import type { AchievementJudge, Earned } from '../profile'
import { CATALOG, V1_ACHIEVEMENTS } from './catalog'
import type { AchievementDef, AchievementRule } from './types'

function matches(rule: Extract<AchievementRule, { op: 'event' }>, e: AnyEvent): boolean {
  if (e.type !== rule.type) return false
  const payload = e.payload as unknown as Readonly<Record<string, unknown>>
  return Object.entries(rule.where).every(([k, v]) => payload[k] === v)
}

/**
 * The characters whose counted choice was committed in each intent. An event belongs to them;
 * an intent with no counted choice (round rules, the opening) belongs to the whole party.
 */
export function intentActors(events: readonly AnyEvent[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const e of events) {
    if (e.type !== 'choice_counted') continue
    const set = out.get(e.sourceIntentId) ?? new Set<string>()
    set.add(e.payload.actorId)
    out.set(e.sourceIntentId, set)
  }
  return out
}

/**
 * The first committed event that satisfies `def`, or null. With `actorIds` (one participant of an
 * online run), a `character` achievement only counts events from that participant's own actions
 * or from the whole party. An event's own `actorIds` win over the intent's counted choices.
 */
export function earningEvent(def: AchievementDef, events: readonly AnyEvent[], actorIds?: readonly string[], actors = intentActors(events)): AnyEvent | null {
  const rule = def.rule
  if (rule.op !== 'event') throw new Error(`${def.id}：首版只判定 event 规则，收到 ${rule.op}`)
  const mine = (e: AnyEvent) => {
    if (!actorIds || def.scope !== 'character') return true
    const by = e.actorIds.length ? e.actorIds : [...(actors.get(e.sourceIntentId) ?? [])]
    return !by.length || by.some((a) => actorIds.includes(a))
  }
  return events.find((e) => matches(rule, e) && mine(e)) ?? null
}

const JUDGED = CATALOG.filter((a) => V1_ACHIEVEMENTS.includes(a.id))

/**
 * 12 §6.1 v1 achievements over a log the server replayed itself, each attributed to the first
 * event that earned it, in log order. Deterministic: the same log always gives the same list.
 */
export const judgeAchievements: AchievementJudge = (_snapshot, events, actorIds) => {
  const earned: (Earned & { seq: number })[] = []
  const actors = intentActors(events)
  for (const def of JUDGED) {
    const e = earningEvent(def, events, actorIds, actors)
    if (e) earned.push({ achievementId: def.id, eventId: e.eventId, seq: e.seq })
  }
  return earned.sort((a, b) => a.seq - b.seq).map(({ achievementId, eventId }) => ({ achievementId, eventId }))
}
