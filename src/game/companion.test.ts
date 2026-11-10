import { describe, expect, it } from 'vitest'
import { PREGENS, makeCharacter } from './data/characters.js'
import { availableActions, newGame, reduce } from './engine.js'
import { addCond } from './conds.js'
import { companionIntent, isDecision, mayAct, nextCompanionMove, type Seating } from './companion.js'
import { runIntent } from './session.js'
import type { GameState } from './types.js'
import { produce } from 'immer'

const party = (ids: string[]) => ids.map((id) => makeCharacter(PREGENS.find((p) => p.id === id)!))
const fresh = (ids: string[]) => newGame(party(ids), { softMemory: false, softTrapped: false }, { turns: true })

function decide(s: GameState): GameState {
  const p = s.queue[0]
  if (p?.type === 'memory') return reduce(s, { type: 'memory', charId: p.charId, text: '雨声' })
  if (p?.type === 'bells') return reduce(s, { type: 'bells', success: true, mistakes: 0 })
  if (p?.type === 'volunteer') return reduce(s, { type: 'volunteer', who: s.party[0].id, text: '雨声' })
  if (p?.type === 'deliver') return reduce(s, { type: 'deliver', variant: 'split' })
  return reduce(s, { type: 'dismissQueue' })
}

describe('AI companions', () => {
  it('play whole rounds on their own without stalling, and never pick an ending or move the party', async () => {
    for (let game = 0; game < 40; game++) {
      let s = fresh(['helan', 'qilan', 'meijia'])
      s = reduce(s, { type: 'perform', id: 'gate_enter' })
      const startLoc = s.location
      const startRound = s.turns!.round
      for (let step = 0; step < 400 && s.phase === 'play'; step++) {
        if (isDecision(s)) { s = decide(s); continue }
        const move = nextCompanionMove(s, () => true)
        expect(move, `stalled at step ${step}`).not.toBeNull()
        if (move!.intent.t === 'perform') {
          const a = availableActions(s).find((x) => x.id === (move!.intent as { id: string }).id)
          expect(a?.group).not.toBe('final')
          expect(a?.group).not.toBe('move')
        }
        s = (await runIntent(s, move!.intent, null)).state
      }
      expect(s.location).toBe(startLoc)
      expect(s.turns!.round).toBeGreaterThan(startRound + 3)
      expect(s.log.some((e) => e.kind === 'roll')).toBe(true)
    }
  })

  it('wakes a stunned friend before doing anything else', () => {
    let s = fresh(['helan', 'qilan'])
    s = reduce(s, { type: 'perform', id: 'gate_enter' })
    const me = s.turns!.activeId!
    const other = s.party.find((c) => c.id !== me)!.id
    s = produce(s, (d) => { addCond(d, other, 'stun') })
    expect(companionIntent(s, me)).toEqual({ t: 'perform', id: `wake_${other}` })
  })

  it('leaves party decisions to humans', () => {
    const s = produce(fresh(['helan', 'qilan']), (d) => { d.queue.push({ type: 'volunteer' }) })
    expect(nextCompanionMove(s, () => true)).toBeNull()
  })

  it('only lets a player act for their own online seat, and lets anyone answer for a companion', () => {
    const s = reduce(fresh(['helan', 'qilan']), { type: 'perform', id: 'gate_enter' })
    const active = s.turns!.activeId!
    const other = s.party.find((c) => c.id !== active)!.id
    const online = new Set(['p1', 'p2'])
    const seat: Seating = { owner: (id) => (id === active ? 'p1' : undefined), online: (pid) => online.has(pid) }
    expect(mayAct(s, { t: 'pass' }, 'p1', seat)).toBe(true)
    expect(mayAct(s, { t: 'pass' }, 'p2', seat)).toBe(false)
    expect(mayAct(s, { t: 'rollStart', kind: 'action', id: 'x', actorId: other, boost: { kind: 'none' } }, 'p1', seat)).toBe(false)
    online.delete('p1')
    expect(mayAct(s, { t: 'pass' }, 'p1', seat)).toBe(false)
    expect(mayAct(s, { t: 'pass' }, 'p2', seat)).toBe(false)
    const asking = produce(s, (d) => { d.queue.push({ type: 'volunteer' }) })
    expect(mayAct(asking, { t: 'volunteer', who: active, text: '雨' }, 'p2', seat)).toBe(true)
  })
})
