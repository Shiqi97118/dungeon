import { describe, expect, it } from 'vitest'
import { PREGENS, makeCharacter } from './data/characters.js'
import { availableActions, newGame, reduce, type GameAction } from './engine.js'
import type { EndingId, GameState } from './types.js'

const d6 = () => 1 + Math.floor(Math.random() * 6)

function party(ids: string[]) {
  return ids.map((id) => makeCharacter(PREGENS.find((p) => p.id === id)!))
}

function settle(s: GameState): GameState {
  let guard = 0
  while (s.queue.length && guard++ < 20) {
    const p = s.queue[0]
    let a: GameAction
    switch (p.type) {
      case 'cost': a = { type: 'cost', choice: p.options[0] }; break
      case 'overflow': a = { type: 'overflow', option: 'status' }; break
      case 'memory': a = { type: 'memory', charId: p.charId, text: '外婆的灶台' }; break
      case 'bells': a = { type: 'bells', success: true, mistakes: 0 }; break
      case 'volunteer': a = { type: 'volunteer', who: s.party[0].id, text: '第一次听见雨声' }; break
      case 'deliver': a = { type: 'deliver', variant: 'oversight' }; break
      default: a = { type: 'dismissQueue' }
    }
    s = reduce(s, a)
  }
  return s
}

function act(s: GameState, id: string, dice: [number, number] = [d6(), d6()]): GameState {
  const a = availableActions(s).find((x) => x.id === id)
  if (!a) throw new Error(`action ${id} not available at ${s.location}: ${availableActions(s).map((x) => x.id).join(',')}`)
  if (a.roll) s = reduce(s, { type: 'roll', id, actorId: s.party[0].id, boost: { kind: 'none' }, dice, mod: 0 })
  else s = reduce(s, { type: 'perform', id })
  return settle(s)
}

describe('random playthroughs', () => {
  it('never crashes and usually reaches an ending', () => {
    let endings = 0
    const seen = new Set<EndingId>()
    for (let g = 0; g < 400; g++) {
      let s = newGame(party(['helan', 'qilan']), { softMemory: g % 2 === 0, softTrapped: false })
      for (let step = 0; step < 300 && s.phase === 'play'; step++) {
        s = settle(s)
        const acts = availableActions(s).filter((a) => !a.locked?.(s))
        if (!acts.length) {
          s = reduce(s, { type: 'free', text: '四处查看', actorId: s.party[0].id, stat: 'ins', dice: [d6(), d6()], mod: 0 })
          continue
        }
        const finals = acts.filter((a) => a.group === 'final')
        const pick = finals.length && Math.random() < 0.15 ? finals[Math.floor(Math.random() * finals.length)] : acts[Math.floor(Math.random() * acts.length)]
        s = act(s, pick.id)
        expect(s.pressure).toBeGreaterThanOrEqual(0)
        expect(s.pressure).toBeLessThanOrEqual(6)
        for (const c of s.party) {
          expect(c.stress).toBeLessThanOrEqual(3)
          expect(c.advantage).toBeLessThanOrEqual(2)
        }
      }
      if (s.phase === 'ending') {
        endings++
        seen.add(s.ending!.id)
        expect(s.ending!.paragraphs.length).toBeGreaterThan(2)
      }
    }
    expect(endings).toBeGreaterThan(300)
    expect(seen.size).toBeGreaterThanOrEqual(4)
  })
})

describe('scripted routes', () => {
  it('A → E route reveals the core and allows retreat', () => {
    let s = newGame(party(['luocen']), { softMemory: false, softTrapped: false })
    s = act(s, 'gate_enter')
    s = act(s, 'a_track', [6, 6])
    s = act(s, 'go_E')
    s = act(s, 'e_story')
    s = act(s, 'go_G')
    expect(s.location).toBe('G')
    s = act(s, 'fin_retreat')
    expect(s.phase).toBe('ending')
    expect(s.ending?.id).toBe('retreat')
  })

  it('seal via the hall bells and Evelyn', () => {
    let s = newGame(party(['qilan', 'dawei']), { softMemory: false, softTrapped: false })
    s = act(s, 'gate_enter')
    s = act(s, 'go_C')
    s = act(s, 'c_score')
    s = act(s, 'c_bells')
    expect(s.flags.bellsSolved).toBe(true)
    s = act(s, 'go_F')
    s = act(s, 'f_persuade', [6, 6])
    expect(s.flags.evelynWith).toBe(true)
    s = act(s, 'go_G')
    s = act(s, 'g_persuade', [6, 6])
    s = act(s, 'fin_seal')
    expect(s.ending?.id).toBe('seal')
  })

  it('repair requires bells + theft knowledge and a volunteer', () => {
    let s = newGame(party(['fuhe', 'meijia']), { softMemory: false, softTrapped: false })
    s = act(s, 'gate_enter')
    s = act(s, 'go_B')
    s = act(s, 'go_C')
    s = act(s, 'c_score')
    s = act(s, 'c_inspect', [6, 6])
    s = act(s, 'c_wheel', [6, 6])
    s = act(s, 'c_beat', [6, 6])
    s = act(s, 'c_wade', [6, 6])
    expect(s.flags.sluiceReady).toBe(true)
    s = act(s, 'go_G')
    const lockRepair = availableActions(s).find((a) => a.id === 'fin_repair')!.locked!(s)
    expect(lockRepair).toBeNull()
    s = act(s, 'fin_repair')
    s = act(s, 'fin_repair_do', [6, 6])
    expect(s.ending?.id).toBe('repair')
  })

  it('failed repair spikes pressure to 6 and still allows destroy', () => {
    let s = newGame(party(['helan']), { softMemory: false, softTrapped: false })
    s = act(s, 'gate_enter')
    s = act(s, 'go_C')
    s = act(s, 'c_score')
    s = act(s, 'c_inspect', [6, 6])
    s = act(s, 'go_B')
    s = act(s, 'go_D')
    s = act(s, 'd_crack')
    expect(s.location).toBe('G')
    s = act(s, 'fin_repair')
    s = act(s, 'fin_repair_do', [1, 1])
    expect(s.pressure).toBe(6)
    s = act(s, 'fin_destroy', [1, 2])
    expect(s.ending?.id).toBe('destroy')
  })

  it('Lu Duo arrives, drills to the core, and deliver works', () => {
    let s = newGame(party(['luocen', 'helan']), { softMemory: false, softTrapped: false })
    s = act(s, 'gate_enter')
    s = act(s, 'go_B')
    s = act(s, 'go_C')
    expect(s.flags.luduoArrived).toBe(true)
    s = act(s, 'lu_secret', [6, 6])
    s = act(s, 'lu_drill')
    s = act(s, 'go_G')
    s = act(s, 'fin_deliver', [6, 6])
    expect(s.ending?.id).toBe('deliver')
  })

  it('pressure 6 forces the finale', () => {
    let s = newGame(party(['helan']), { softMemory: false, softTrapped: false })
    s = act(s, 'gate_enter')
    s = { ...s, pressure: 5 }
    s = act(s, 'go_B')
    expect(s.pressure).toBe(6)
    const acts = availableActions(s)
    expect(acts.map((a) => a.id)).toEqual(['rush_G'])
  })

  it('beast crisis resolves and unlocks the note', () => {
    let s = newGame(party(['meijia']), { softMemory: false, softTrapped: false })
    s = act(s, 'gate_enter')
    s = act(s, 'go_B')
    s = act(s, 'b_counting')
    expect(s.crisis).not.toBeNull()
    s = act(s, 'cr_rhythm', [6, 6])
    s = act(s, 'cr_rhythm', [6, 6])
    expect(s.crisis).toBeNull()
    s = act(s, 'b_note')
    expect(s.clues).toContain('b_note')
  })

  it('seal and repair stay available after a failed or cancelled attempt', () => {
    let s = newGame(party(['qilan']), { softMemory: false, softTrapped: false })
    s = act(s, 'gate_enter')
    s = act(s, 'go_C')
    s = act(s, 'c_score')
    s = act(s, 'go_D')
    s = act(s, 'd_vision')
    s = act(s, 'd_tracks')
    s = act(s, 'go_E')
    s = act(s, 'e_letter')
    s = act(s, 'e_story')
    s = act(s, 'go_G')
    s = reduce(s, { type: 'perform', id: 'fin_seal' })
    s = reduce(s, { type: 'bells', success: false, mistakes: 3 })
    s = reduce(s, { type: 'perform', id: 'fin_repair' })
    s = reduce(s, { type: 'dismissQueue' })
    const ids = availableActions(s).map((a) => a.id)
    expect(ids).toContain('fin_seal')
    expect(ids).toContain('fin_repair')
  })

  it('custom ending and takeaways', () => {
    let s = newGame(party(['helan']), { softMemory: false, softTrapped: false })
    s = reduce(s, { type: 'customEnding', plan: '把井带回镇上', paragraphs: ['甲', '乙'] })
    s = reduce(s, { type: 'takeaways', takeaways: { helan: '一块石头' } })
    expect(s.ending?.takeaways.helan).toBe('一块石头')
  })
})
