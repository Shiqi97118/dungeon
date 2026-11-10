import { describe, expect, it } from 'vitest'
import { PREGENS, makeCharacter } from './data/characters.js'
import { availableActions, newGame, reduce } from './engine.js'
import { addCond, initiativeOf } from './conds.js'
import { runIntent, type Gm, type Intent } from './session.js'
import type { GameState } from './types.js'
import { produce } from 'immer'

const party = (ids: string[]) => ids.map((id) => makeCharacter(PREGENS.find((p) => p.id === id)!))

function settle(s: GameState): GameState {
  for (let g = 0; g < 30 && s.queue.length; g++) {
    const p = s.queue[0]
    if (p.type === 'cost') s = reduce(s, { type: 'cost', choice: p.options[0] })
    else if (p.type === 'overflow') s = reduce(s, { type: 'overflow', option: 'status' })
    else if (p.type === 'memory') s = reduce(s, { type: 'memory', charId: s.party[0].id, text: '雨声' })
    else if (p.type === 'bells') s = reduce(s, { type: 'bells', success: true, mistakes: 0 })
    else if (p.type === 'volunteer') s = reduce(s, { type: 'volunteer', who: s.party[0].id, text: '雨声' })
    else if (p.type === 'deliver') s = reduce(s, { type: 'deliver', variant: 'split' })
    else s = reduce(s, { type: 'dismissQueue' })
  }
  return s
}

describe('turn order', () => {
  it('starts round 1 with the highest initiative acting first', () => {
    const s = newGame(party(['helan', 'qilan', 'meijia']), { softMemory: false, softTrapped: false }, { turns: true })
    expect(s.turns?.round).toBe(1)
    const totals = s.turns!.order.map((e) => e.total)
    expect([...totals].sort((a, b) => b - a)).toEqual(totals)
    expect(s.turns!.activeId).toBe(s.turns!.order[0].id)
  })

  it('advances to the next character after an action and starts a new round at the end', () => {
    let s = newGame(party(['helan', 'qilan']), { softMemory: false, softTrapped: false }, { turns: true })
    const first = s.turns!.activeId
    s = reduce(s, { type: 'perform', id: 'gate_enter' })
    s = settle(s)
    expect(s.turns!.activeId).not.toBe(first)
    s = reduce(s, { type: 'pass' })
    expect(s.turns!.round).toBe(2)
  })

  it('rejects rolls from a character whose turn it is not', () => {
    let s = newGame(party(['helan', 'qilan']), { softMemory: false, softTrapped: false }, { turns: true })
    s = settle(reduce(s, { type: 'perform', id: 'gate_enter' }))
    const other = s.party.find((c) => c.id !== s.turns!.activeId)!
    const rollAct = availableActions(s).find((a) => a.roll)!
    const after = reduce(s, { type: 'rollStart', kind: 'action', id: rollAct.id, actorId: other.id, boost: { kind: 'none' } })
    expect(after.rolling).toBeFalsy()
  })

  it('runs the server-side roll lifecycle with reroll', () => {
    let s = newGame(party(['helan']), { softMemory: false, softTrapped: false }, { turns: true })
    s = settle(reduce(s, { type: 'perform', id: 'gate_enter' }))
    const me = s.turns!.activeId!
    const rollAct = availableActions(s).find((a) => a.roll)!
    s = reduce(s, { type: 'rollStart', kind: 'action', id: rollAct.id, actorId: me, boost: { kind: 'none' } })
    expect(s.rolling?.dice.every((d) => d >= 1 && d <= 6)).toBe(true)
    expect(reduce(s, { type: 'perform', id: 'go_B' }).rolling).toBeTruthy()
    s = produce(s, (d) => { d.rolling!.dice = [1, 1] })
    const adv = s.party[0].advantage
    s = reduce(s, { type: 'rollReroll' })
    expect(s.party[0].advantage).toBe(adv - 1)
    expect(s.rolling!.rerolled).toBe(true)
    const logLen = s.log.length
    s = reduce(s, { type: 'rollCommit' })
    expect(s.rolling).toBeNull()
    expect(s.log.length).toBeGreaterThan(logLen)
  })

  it('skips stunned characters and applies initiative penalties', () => {
    let s = newGame(party(['helan', 'qilan', 'luocen']), { softMemory: false, softTrapped: false }, { turns: true })
    const victim = s.turns!.order[s.turns!.order.length - 1].id
    s = produce(s, (d) => { addCond(d, victim, 'stun') })
    const seen: string[] = []
    while (s.turns!.round === 1) s = reduce(s, { type: 'pass' })
    expect(s.turns!.order.map((e) => e.id)).not.toContain(victim)
    while (s.turns!.round === 2) { seen.push(s.turns!.activeId!); s = reduce(s, { type: 'pass' }) }
    expect(seen).not.toContain(victim)
    expect(s.turns!.order.map((e) => e.id)).toContain(victim)

    const c = makeCharacter(PREGENS[0])
    const base = initiativeOf(c, 3).total
    c.conds = [{ id: 'poison', rounds: 2 }]
    expect(initiativeOf(c, 3).total).toBe(base - 2)
  })

  it('offers a wake action for an unconscious ally and it removes the condition', () => {
    let s = newGame(party(['helan', 'qilan']), { softMemory: false, softTrapped: false }, { turns: true })
    const victim = s.party.find((c) => c.id !== s.turns!.activeId)!.id
    s = produce(s, (d) => { addCond(d, victim, 'stun') })
    const wake = availableActions(s).find((a) => a.id === `wake_${victim}`)
    expect(wake).toBeTruthy()
    s = reduce(s, { type: 'perform', id: `wake_${victim}` })
    expect(s.party.find((c) => c.id === victim)!.conds?.some((x) => x.id === 'stun')).toBe(false)
  })
})

describe('intents', () => {
  const fakeGm: Gm = {
    propose: async (s) => ({ narration: '你听见水声。', roll: { actorId: s.party[0].id, stat: 'ins', risk: '会迷路' } }),
    resolve: async () => ({ narration: '你找到了出口。', effects: { conds: [{ charId: 'helan', id: 'poison' }] } }),
    ending: async () => ['甲', '乙', '丙'],
  }

  it('AI free action asks for a roll, then narrates the result and passes the turn', async () => {
    let s = newGame(party(['helan', 'qilan']), { softMemory: false, softTrapped: false }, { turns: true })
    s = settle(reduce(s, { type: 'perform', id: 'gate_enter' }))
    const actor = s.turns!.activeId!
    const mark = { round: s.turns!.round, idx: s.turns!.idx }
    s = (await runIntent(s, { t: 'free', text: '摸索墙壁' }, fakeGm)).state
    expect(s.rollReq?.kind).toBe('ai')
    s = (await runIntent(s, { t: 'rollStart', kind: 'ai', actorId: actor, boost: { kind: 'none' } }, fakeGm)).state
    expect(s.rolling).toBeTruthy()
    s = (await runIntent(s, { t: 'rollCommit' }, fakeGm)).state
    expect(s.log.some((e) => e.kind === 'ai' && e.text.includes('出口'))).toBe(true)
    s = settle(s)
    expect(s.turns!.round > mark.round || s.turns!.idx > mark.idx).toBe(true)
  })

  it('falls back to offline rules when the AI fails', async () => {
    const broken: Gm = { ...fakeGm, propose: async () => { throw new Error('boom') } }
    let s = newGame(party(['helan']), { softMemory: false, softTrapped: false }, { turns: true })
    const r = await runIntent(s, { t: 'free', text: '推开门' }, broken)
    expect(r.error).toContain('离线')
    s = r.state
    expect(s.rollReq?.kind).toBe('free')
    expect(s.rollReq?.stat).toBe('str')
  })

  it('random turn-based playthroughs never get stuck', async () => {
    let endings = 0
    for (let g = 0; g < 150; g++) {
      let s = newGame(party(['helan', 'qilan', 'meijia', 'dawei'].slice(0, 1 + (g % 4))), { softMemory: false, softTrapped: false }, { turns: true })
      for (let step = 0; step < 500 && s.phase === 'play'; step++) {
        s = settle(s)
        if (s.phase !== 'play') break
        const actor = s.turns!.activeId!
        expect(actor).toBeTruthy()
        let intent: Intent
        if (s.rolling) intent = Math.random() < 0.2 ? { t: 'rollReroll' } : { t: 'rollCommit' }
        else if (s.rollReq) intent = { t: 'rollStart', kind: s.rollReq.kind, actorId: actor, boost: { kind: 'none' }, stat: 'dex' }
        else {
          const acts = availableActions(s).filter((a) => !a.locked?.(s))
          const finals = acts.filter((a) => a.group === 'final')
          const roll = Math.random()
          if (roll < 0.05) intent = { t: 'pass' }
          else if (roll < 0.1) intent = { t: 'free', text: '四处摸索' }
          else if (!acts.length) intent = { t: 'pass' }
          else {
            const a = finals.length && Math.random() < 0.2 ? finals[Math.floor(Math.random() * finals.length)] : acts[Math.floor(Math.random() * acts.length)]
            intent = a.roll ? { t: 'rollStart', kind: 'action', id: a.id, actorId: actor, boost: { kind: 'none' } } : { t: 'perform', id: a.id }
          }
        }
        const before = s
        s = (await runIntent(s, intent, null)).state
        if (intent.t === 'rollStart') expect(s.rolling || s.phase !== 'play' || before.rollReq === null).toBeTruthy()
        for (const c of s.party) expect(c.stress).toBeLessThanOrEqual(3)
      }
      if (s.phase === 'ending') endings++
    }
    expect(endings).toBeGreaterThan(110)
  })
})
