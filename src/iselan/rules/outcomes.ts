import type { ArcId, Atom, Cond, NpcId, OutcomeId } from '../data'
import { TEXTS } from '../data'
import { draft, type AnyDraft, type Snapshot } from '../events'
import { attitudeOf, relationOf } from './conditions'
import { directionDraft } from './directions'
import { hungerDraft } from './hunger'
import { preview } from './settle'
import { stagedDrafts } from './staged'

const RANGE = 3
const clamp = (n: number) => Math.max(-RANGE, Math.min(RANGE, n))
const atoms = (conds: readonly Cond[]) => conds.flatMap((c) => ('any' in c ? c.any : [c]))
const varEq = (conds: readonly Cond[], name: string) =>
  atoms(conds)
    .filter((a): a is Extract<Atom, { var: unknown }> => 'var' in a && a.var === name && a.op === 'eq')
    .map((a) => a.value)

/**
 * 12 §3.4: the ±n world changes in a result beat's 后置 (relations, directions, attitudes,
 * hunger) are settled by the resolution itself, before the beat can be shown.
 */
export function outcomeDrafts(s: Snapshot, arcId: ArcId, outcomes: readonly OutcomeId[]): AnyDraft[] {
  const out: AnyDraft[] = []
  let cur = s
  const push = (d: AnyDraft | null) => {
    if (!d) return
    out.push(d)
    cur = preview(cur, [d])
  }
  for (const t of TEXTS) {
    if (t.kind !== 'BEAT' || !t.requires) continue
    if (!varEq(t.requires, 'arc').includes(arcId)) continue
    if (!varEq(t.requires, 'outcome').some((o) => outcomes.includes(o as OutcomeId))) continue
    for (const d of stagedDrafts(cur, t.effects ?? [], t.id)) push(d)
    for (const e of t.effects ?? []) {
      if (e.phase !== 'before' || !('delta' in e)) continue
      if ('direction' in e) push(directionDraft(cur, e.direction, e.delta))
      else if ('relation' in e) {
        const value = clamp(relationOf(cur, e.relation) + e.delta)
        push(draft('faction_relation_changed', { factionId: e.relation, towardsFactionId: 'party', delta: value - relationOf(cur, e.relation), value }))
      } else if ('attitude' in e) {
        const npcId = e.attitude as NpcId
        const value = clamp(attitudeOf(cur, npcId) + e.delta)
        push(draft('npc_attitude_changed', { npcId, towardsId: 'party', delta: value - attitudeOf(cur, npcId), value }))
      } else push(hungerDraft(cur, e.delta, 'other'))
    }
  }
  return out
}
