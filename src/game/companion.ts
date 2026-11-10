import type { ActionDef, Boost, Character, CostId, GameState, Pending } from './types.js'
import { actingCharId, availableActions, calcRoll } from './engine.js'
import { getChar } from './fx.js'
import { intentOwner, type Intent } from './session.js'

/** Party-level choices that a companion never makes; any human at the table may answer them. */
export const DECISIONS: Pending['type'][] = ['memory', 'bells', 'volunteer', 'deliver', 'farewell']
export const DECISION_INTENTS: Intent['t'][] = ['memory', 'bells', 'volunteer', 'deliver', 'dismissQueue']

export const isDecision = (s: GameState) => !!s.queue[0] && DECISIONS.includes(s.queue[0].type)

function itemBoost(a: ActionDef, c: Character): Boost {
  const item = (a.roll?.items ?? []).find((x) => c.items.includes(x) && !c.spentItems.includes(x))
  return item ? { kind: 'item', item } : { kind: 'none' }
}

function pickCost(s: GameState, p: Extract<Pending, { type: 'cost' }>): CostId | 'soften' {
  const c = getChar(s, p.actorId)
  if (p.canSoften && c && c.advantage > 0) return 'soften'
  const order: CostId[] = []
  if (c && c.stress < 2) order.push('stress')
  if (c && c.items.some((x) => !c.spentItems.includes(x))) order.push('item')
  if (s.pressure < 4) order.push('pressure')
  order.push('helper', 'beast', 'stress', 'pressure', 'item')
  return order.find((x) => p.options.includes(x)) ?? p.options[0]
}

function scoreAction(s: GameState, a: ActionDef, c: Character): number {
  if (a.locked?.(s)) return -Infinity
  if (a.group === 'final' || a.group === 'move') return -Infinity
  if (a.id === 'rest_short') return c.stress >= 2 || s.party.filter((x) => x.stress >= 2).length >= 2 ? 3.5 : -Infinity
  if (a.id === 'rest_long') return s.party.some((x) => x.stress >= 3) && s.pressure < 4 ? 2.5 : -Infinity
  if (a.id.startsWith('wake_')) return 6
  if (a.id.startsWith('aid_')) return 2.4 + c.stats.ins
  if (a.id.startsWith('cr_')) return 5 + calcRoll(s, a, c, itemBoost(a, c)).total
  if (a.repeatable) return -Infinity
  if (!a.roll) return 2.2
  return 1 + calcRoll(s, a, c, itemBoost(a, c)).total
}

/** What an AI-controlled companion does next, or null if it has nothing to decide. */
export function companionIntent(s: GameState, charId: string): Intent | null {
  const c = getChar(s, charId)
  if (!c) return null
  const p = s.queue[0]
  if (p?.type === 'cost') return p.actorId === charId ? { t: 'cost', choice: pickCost(s, p) } : null
  if (p?.type === 'overflow') return p.charId === charId ? { t: 'overflow', option: 'status' } : null
  if (p) return null
  if (s.rolling) return s.rolling.actorId === charId ? { t: 'rollCommit' } : null
  if (s.rollReq) {
    const rq = s.rollReq
    if ((rq.actorId ?? s.turns?.activeId) !== charId) return null
    return { t: 'rollStart', kind: rq.kind, actorId: charId, boost: { kind: 'none' }, stat: rq.stat }
  }
  if (s.turns?.activeId !== charId) return null
  const options = availableActions(s)
    .map((a) => ({ a, score: scoreAction(s, a, c) + Math.random() * 0.9 }))
    .filter((x) => Number.isFinite(x.score))
    .sort((x, y) => y.score - x.score)
  const best = options[0]?.a
  if (!best) return { t: 'pass' }
  if (best.roll) return { t: 'rollStart', kind: 'action', id: best.id, actorId: charId, boost: itemBoost(best, c) }
  return { t: 'perform', id: best.id }
}

export const AI = 'ai'

export interface Seating {
  owner: (charId: string) => string | undefined
  online: (pid: string) => boolean
}

/** A seated, online player controls their character; everyone else is played by a companion. */
export function controllerOf(seat: Seating, charId: string): string {
  const o = seat.owner(charId)
  return o && seat.online(o) ? o : AI
}

/** The server's rule for who may submit an intent; the client mirrors it to decide what to show. */
export function mayAct(s: GameState, i: Intent, pid: string, seat: Seating): boolean {
  const owner = intentOwner(s, i)
  if (!owner) return true
  const ctl = controllerOf(seat, owner)
  if (ctl === pid) return i.t !== 'rollStart' || controllerOf(seat, i.actorId) === pid
  return ctl === AI && DECISION_INTENTS.includes(i.t) && isDecision(s)
}

export interface CompanionMove { intent: Intent; delay: number }

/** The next move for whichever companion holds the table, paced so humans can follow it. */
export function nextCompanionMove(s: GameState, isAuto: (charId: string) => boolean): CompanionMove | null {
  if (!s.turns || s.phase !== 'play' || s.thinking || isDecision(s)) return null
  const id = actingCharId(s)
  if (!id || !isAuto(id)) return null
  const intent = companionIntent(s, id)
  if (!intent) return null
  return { intent, delay: intent.t === 'rollCommit' ? 2400 : intent.t === 'cost' || intent.t === 'overflow' ? 1000 : 1300 }
}