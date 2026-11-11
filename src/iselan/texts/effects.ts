import { CONFIG } from '../config'
import type { ArcId, BeatId, DarkLineStateId, NpcId } from '../data'
import { VOCAB } from '../data'
import { draft, type AnyDraft, type Snapshot } from '../events'
import { darkLineStateOf, hasFact, type SceneContext } from '../rules/conditions'
import { textShownDraft } from '../rules/clock'
import type { Pick } from './select'

const DARK_ORDER: readonly DarkLineStateId[] = ['untouched', 'clue', 'revealed', 'erupted']
const KNOWLEDGE = new Set<string>(VOCAB.facts.filter((f) => f.kind === 'knowledge').map((f) => f.id))

export interface ShownResult {
  readonly drafts: AnyDraft[]
  /** 12 §3.4: a reveal without two pieces of evidence is kept at 有线索 and logged here. */
  readonly gaps: readonly string[]
}

/**
 * Events to commit once a pick is on screen: `text_shown` plus the 后置 items written after
 * display (knowledge facts, dark lines, evidence, beats, impressions, contacts). World changes
 * are never written here; they had to be settled before the text was eligible.
 */
export function shownDrafts(s: Snapshot, pick: Pick, ctx: SceneContext = {}): ShownResult {
  const drafts: AnyDraft[] = [textShownDraft(s, pick.unit.id)]
  const gaps: string[] = []
  const evidence = new Map<string, Set<string>>()
  const evidenceOf = (dl: keyof Snapshot['darkLines']) => {
    if (!evidence.has(dl)) evidence.set(dl, new Set((s.darkLines[dl]?.evidence ?? []).map((e) => e.id)))
    return evidence.get(dl)!
  }

  for (const e of pick.unit.effects) {
    if (e.phase !== 'after') continue
    if ('evidence' in e) {
      if (evidenceOf(e.darkLine).has(e.evidence)) continue
      evidenceOf(e.darkLine).add(e.evidence)
      drafts.push(draft('truth_evidence_added', { darkLineId: e.darkLine, evidenceId: e.evidence, reliable: true }))
    } else if ('impression' in e) {
      drafts.push(draft('npc_impression_added', { npcId: e.impression as NpcId, text: e.text, milestone: false }))
    } else if ('contact' in e) {
      if (!s.factions[e.contact]?.contacted) drafts.push(draft('faction_contacted', { factionId: e.contact }))
    }
  }
  for (const e of pick.unit.effects) {
    if (e.phase !== 'after') continue
    if ('darkLine' in e && 'value' in e) {
      let target = e.value
      if (target === 'revealed' && evidenceOf(e.darkLine).size < CONFIG.darkLineRevealEvidence) {
        gaps.push(`${pick.unit.id}：${e.darkLine} 证据不足 ${CONFIG.darkLineRevealEvidence} 条，降为有线索`)
        target = 'clue'
      }
      if (DARK_ORDER.indexOf(target) <= DARK_ORDER.indexOf(darkLineStateOf(s, e.darkLine))) continue
      drafts.push(draft('dark_line_changed', { darkLineId: e.darkLine, state: target }))
      const truthId = VOCAB.darkLines.find((d) => d.id === e.darkLine)!.truthId
      if (target === 'revealed') drafts.push(draft('truth_verified', { truthId, layer: 0 }))
    } else if ('fact' in e) {
      if (!KNOWLEDGE.has(e.fact)) gaps.push(`${pick.unit.id}：${e.fact} 不是知情类事实，不能在展示后写入`)
      else if (!hasFact(s, e.fact)) drafts.push(draft('fact_established', { factId: e.fact, source: pick.unit.id }))
    } else if ('var' in e && e.var === 'beat') {
      const arc = (pick.unit.requires.find((c) => 'var' in c && c.var === 'arc' && c.op === 'eq') as { value?: string } | undefined)?.value ?? ctx.vars?.arc
      if (arc && !s.arcs[arc as ArcId]?.beats.includes(e.value as BeatId)) {
        drafts.push(draft('arc_beat_reached', { arcId: arc as ArcId, beat: e.value as BeatId }))
      }
    }
  }
  return { drafts, gaps }
}
