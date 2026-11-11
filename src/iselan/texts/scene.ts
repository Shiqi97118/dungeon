import { CONFIG } from '../config'
import type { Snapshot } from '../events'
import type { SceneContext } from '../rules/conditions'
import { selectText, type Gap, type Pick, type TextRequest, type TextUnit, ALL_UNITS } from './select'

/** 09 §3.3a: a screen needs at least two paragraphs and `screenMinChars` characters. */
export function screenProblems(paragraphs: readonly string[]): string[] {
  const problems: string[] = []
  const text = paragraphs.filter((p) => p.trim())
  if (text.length < 2) problems.push(`每屏至少两段，现在 ${text.length} 段`)
  const chars = [...text.join('')].length
  if (chars < CONFIG.screenMinChars) problems.push(`每屏不少于 ${CONFIG.screenMinChars} 字，现在 ${chars} 字`)
  return problems
}

/** 09 §3.3a: a scene lasts at least `sceneMinRounds` rounds unless the players leave or are driven out. */
export const mayLeaveScene = (s: Snapshot, sceneStartRound: number, chosenOrForced: boolean) =>
  chosenOrForced || s.round - sceneStartRound >= CONFIG.sceneMinRounds

export interface SceneChangeRequest {
  /** 收尾: what lingers from the scene being left. Written by the AI or the caller. */
  readonly closing: readonly string[]
  /** Leaving the region (旅途 TRV) rather than moving within it (承上启下 BRG). */
  readonly travel: boolean
  /** Context at the destination, for the arrival text. */
  readonly arrival: SceneContext
  /** Context while under way. Defaults to the arrival context without people present. */
  readonly transit?: SceneContext
  readonly sceneInstanceSince?: number
}

export interface SceneChange {
  readonly closing: readonly string[]
  readonly transition: Pick | null
  readonly arrival: Pick | null
  readonly gaps: readonly Gap[]
  readonly problems: readonly string[]
}

/**
 * 09 §3.3a three-part scene change: closing → transition (BRG or TRV) → arrival (ENV or SCN).
 * Never collapses to one sentence: a missing part is a problem for the caller to fill (the AI
 * writes it, 09 §3.3) rather than being skipped. The parts may span two screens.
 */
export function sceneChange(s: Snapshot, req: SceneChangeRequest, units: readonly TextUnit[] = ALL_UNITS): SceneChange {
  const gaps: Gap[] = []
  const problems: string[] = []
  if (!req.closing.some((p) => p.trim())) problems.push('缺少收尾')

  const transitReq: TextRequest = {
    kinds: req.travel ? ['TRV', 'BRG'] : ['BRG', 'TRV'],
    ctx: req.transit ?? { ...req.arrival, present: [], factionsPresent: [] },
    salt: 'scene:transition',
  }
  const preferred = selectText(s, { ...transitReq, kinds: [transitReq.kinds[0]] }, units)
  const transition = preferred.pick && !preferred.pick.fallback ? preferred : selectText(s, transitReq, units)
  if (transition.gap) gaps.push(transition.gap)
  if (!transition.pick) problems.push('缺少过渡')

  const arrival = selectText(s, { kinds: ['SCN', 'ENV'], ctx: req.arrival, sceneInstanceSince: req.sceneInstanceSince, salt: 'scene:arrival' }, units)
  if (arrival.gap) gaps.push(arrival.gap)
  if (!arrival.pick) problems.push('缺少进入')

  return { closing: req.closing, transition: transition.pick, arrival: arrival.pick, gaps, problems }
}
