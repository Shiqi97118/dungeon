import type { AnyEvent, Snapshot } from '../events'
import type { RunRecord } from './types'

/** One achievement earned in a run, attributed to the event that earned it. */
export interface Earned {
  readonly achievementId: string
  readonly eventId: string
}

/**
 * Achievement rules (ACH-01) plug in here. They run only on the server, on a log the server
 * has replayed itself; the client never reports its own unlocks.
 */
/**
 * `actorIds` are the characters one participant played in an online run; personal achievements
 * go only to them. Omitted for a solo run, where every achievement is the player's.
 */
export type AchievementJudge = (snapshot: Snapshot, events: readonly AnyEvent[], actorIds?: readonly string[]) => readonly Earned[]

export const noAchievements: AchievementJudge = () => []

/** Three-axis summary and chronicle for the run record; the ending page (UI-02) provides the real one. */
export type RunSummarizer = (snapshot: Snapshot, events: readonly AnyEvent[]) => Pick<RunRecord, 'axes' | 'chronicle'>

export const bareSummary: RunSummarizer = () => ({ axes: null, chronicle: [] })

/** Rejects ids a judge made up, so a buggy rule cannot attribute an unlock to an event outside the run. */
export function attributable(earned: readonly Earned[], events: readonly AnyEvent[]): Earned[] {
  const ids = new Set(events.map((e) => e.eventId))
  const seen = new Set<string>()
  return earned.filter((e) => ids.has(e.eventId) && !seen.has(e.achievementId) && seen.add(e.achievementId))
}
