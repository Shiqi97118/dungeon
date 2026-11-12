import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import { draft } from '../events'
import {
  BLOCKED_BY_PARTY, canEnterNamelessCity, checkClock, choiceDraft, createProject, d01Variant, DIRECTION_RULES, directionDraft,
  doorDrafts, drawWeighted, endingCandidates, evalCond, extraAdvance, foundProject, friendlyFactionCluster, joinSeatDraft, nameDrafts,
  projectRiskDraft, r1Met, regionDrafts, replaceCharacterDraft, rngFor, setControllerDraft, weightOf, whyUnavailable, wrapUpDrafts,
  type ActionInput,
} from '.'
import { TestRun } from './testRun'

const act = (over: Partial<ActionInput> = {}): ActionInput => ({
  seatId: 's1', actorId: 'helan', kind: 'act', sceneId: 'sc1', target: 'felix', method: 'talk',
  drafts: [draft('fact_established', { factId: 'ledger_for_sale', source: 'felix' })], ...over,
})

describe('opening', () => {
  it('writes the starting attitudes and relations into the log', () => {
    const s = new TestRun().s
    expect(s.npcs.cyrus?.attitude).toBe(-1)
    expect(s.npcs.ludo?.attitude).toBe(1)
    expect(s.factions.namekeepers?.relation).toBe(1)
    expect(s.factions.kalvis_crown?.towards.ember_tribes).toBe(-3)
    expect(friendlyFactionCluster(s)).toBe(0)
  })
})

describe('valid choices (02 §2, R1)', () => {
  it('watching, being skipped, strain prompts and interaction steps never count', () => {
    const s = new TestRun().s
    for (const kind of ['observe', 'skipped', 'pressure', 'interaction'] as const) expect(choiceDraft(s, act({ kind }))).toBeNull()
  })

  it('an action that settles nothing does not count', () => {
    expect(choiceDraft(new TestRun().s, act({ drafts: [] }))).toBeNull()
    expect(choiceDraft(new TestRun().s, act({ drafts: [], settled: ['risk'] }))).not.toBeNull()
  })

  it('the same target and method in one scene counts once', () => {
    const run = new TestRun()
    run.commit([choiceDraft(run.s, act())!])
    expect(choiceDraft(run.s, act())).toBeNull()
    expect(choiceDraft(run.s, act({ method: 'bribe' }))).not.toBeNull()
    expect(choiceDraft(run.s, act({ sceneId: 'sc2' }))).not.toBeNull()
  })

  it('31 rests that change nothing cannot reach the ending', () => {
    const run = new TestRun()
    for (let i = 0; i < 31; i++) {
      run.round()
      const d = choiceDraft(run.s, act({ kind: 'rest', riskReduced: false }))
      if (d) run.commit([d])
    }
    expect(run.s.seats.s1.choices).toBe(0)
    expect(wrapUpDrafts(run.s, ['s1'])).toBeNull()
  })

  it('a rest counts only when it lowers a risk and not twice in a row', () => {
    const run = new TestRun()
    run.commit([choiceDraft(run.s, act({ kind: 'rest', riskReduced: true }))!])
    run.round()
    expect(choiceDraft(run.s, act({ kind: 'rest', riskReduced: true }))).toBeNull()
    run.commit([choiceDraft(run.s, act())!])
    expect(choiceDraft(run.s, act({ kind: 'rest', riskReduced: true }))).not.toBeNull()
  })
})

describe('act 4 gate (R1, R1a–R1c, R4)', () => {
  const two = [
    { seatId: 's1', actorId: 'helan', controller: 'human' as const },
    { seatId: 's2', actorId: 'fuhe', controller: 'human' as const },
  ]

  it('any seat below 31 keeps act 4 closed, whatever the clock or the vote', () => {
    const run = new TestRun(two).choices('s1', 40).choices('s2', 30).setClock(12)
    run.commit([draft('world_crisis_started', {}), draft('location_changed', { regionId: 'nameless_city', placeId: 'nameless_city.door' })])
    expect(r1Met(run.s)).toBe(false)
    expect(wrapUpDrafts(run.s, ['s1', 's2'])).toBeNull()
    expect(doorDrafts(run.s)).toBeNull()
    run.choices('s2', 1)
    expect(wrapUpDrafts(run.s, ['s1'])).toBeNull()
    expect(wrapUpDrafts(run.s, ['s1', 's2'])).toEqual([draft('act_entered', { act: 4, via: 'wrap_up' })])
    expect(doorDrafts(run.s)).toEqual([draft('act_entered', { act: 4, via: 'door' })])
  })

  it('a late joiner starts at the lowest seat and needs 6 choices of their own', () => {
    const run = new TestRun(two).choices('s1', 33).choices('s2', 31)
    run.round()
    run.commit([joinSeatDraft(run.s, 's3', 'qilan', 'human')])
    expect(run.s.seats.s3).toMatchObject({ choices: 31, ownChoices: 0, mustOwn: true })
    expect(r1Met(run.s)).toBe(false)
    run.choices('s3', 5)
    expect(r1Met(run.s)).toBe(false)
    run.choices('s3', 1)
    expect(r1Met(run.s)).toBe(true)
  })

  it('a new character keeps the seat count; an AI stand-in counts for the seat, not the player', () => {
    const run = new TestRun().choices('s1', 31)
    run.commit([replaceCharacterDraft(run.s, 's1', 'luocen')])
    expect(run.s.seats.s1).toMatchObject({ actorId: 'luocen', choices: 31, ownChoices: 0 })
    expect(r1Met(run.s)).toBe(false)
    run.commit([setControllerDraft(run.s, 's1', 'ai')!]).choices('s1', 6)
    expect(run.s.seats.s1).toMatchObject({ choices: 37, ownChoices: 0 })
    run.commit([setControllerDraft(run.s, 's1', 'human')!]).choices('s1', 6)
    expect(r1Met(run.s)).toBe(true)
  })

  it('a seat left empty no longer holds the others back', () => {
    const run = new TestRun(two).choices('s1', 31).choices('s2', 3)
    run.commit([setControllerDraft(run.s, 's2', 'empty')!])
    expect(r1Met(run.s)).toBe(true)
    expect(wrapUpDrafts(run.s, ['s1'])).not.toBeNull()
  })

  it('clock 12 brings the world crisis but not act 4', () => {
    const run = new TestRun().choices('s1', 31).setClock(11)
    run.rounds(CONFIG.clockCheckEvery)
    expect(run.s.clock).toMatchObject({ value: 12, crisis: true })
    expect(run.s.act).toBeLessThan(4)
  })

  it('R7: three bell hearts, or two with the great bellkeeper as guide', () => {
    const run = new TestRun()
    const hold = (id: 'crown_bell' | 'rock_bell' | 'leaf_bell') => draft('bell_heart_moved', { bellHeartId: id, holder: 'party', holderId: 'party' })
    run.commit([hold('crown_bell'), hold('rock_bell')])
    expect(canEnterNamelessCity(run.s, false)).toBe(false)
    expect(canEnterNamelessCity(run.s, true)).toBe(true)
    run.commit([hold('leaf_bell')])
    expect(canEnterNamelessCity(run.s, false)).toBe(true)
  })
})

describe('clock and faction plans (R2, R2a, 12 §11)', () => {
  it('checks every 6 rounds and shows version A while the guild is in its default state', () => {
    const run = new TestRun()
    expect(run.rounds(5)).toEqual([])
    expect(run.round().texts).toEqual(['GEN-CLK-01A'])
    expect(run.s.clock.value).toBe(1)
    expect(run.s.plansAdvanced).toContain('copper_registration')
  })

  it('a changed faction gives version B and no plan event', () => {
    const run = new TestRun().setClock(3)
    run.settle([draft('object_state_changed', { objectId: 'tide_well', state: 'exposed' })])
    expect(run.s.factions.copper_guild?.state).toBe('thwarted')
    expect(run.rounds(6)).toContain('GEN-CLK-04B')
    expect(run.s.clock.value).toBe(4)
    expect(run.s.plansAdvanced).not.toContain('copper_echo_comms')
  })

  it('when neither version holds the clock does not move', () => {
    const run = new TestRun().setClock(2)
    run.commit([draft('object_state_changed', { objectId: 'whitestone_well', state: 'destroyed' })])
    const r = checkClock(run.round(6) && run.s)
    expect(r.outcome).toBe('stalled')
    expect(run.s.clock.value).toBe(2)
  })

  it('a plan the party stopped stalls for 6 rounds, then may go ahead', () => {
    const run = new TestRun()
    run.round(1)
    run.commit([draft('faction_plan_blocked', { factionId: 'copper_guild', planId: 'copper_registration', failedPreconditions: [BLOCKED_BY_PARTY] })])
    run.rounds(6)
    expect(run.s.clock.value).toBe(0)
    run.rounds(12)
    expect(run.s.clock.value).toBe(1)
  })

  it('a leader out of office blocks version A', () => {
    const run = new TestRun().setClock(4)
    run.commit([draft('npc_state_changed', { npcId: 'ulug', state: 'captive' })])
    const r = checkClock(run.round(6) && run.s)
    expect(r.outcome).toBe('stalled')
  })

  it('a slot reached again after the clock turned back repeats no world event', () => {
    const run = new TestRun()
    run.rounds(6)
    run.commit([draft('clock_reversed', { from: 1, to: 0, cause: 'test' })])
    const texts = run.rounds(12)
    expect(texts).toEqual([])
    expect(run.s.clock).toMatchObject({ value: 1, highest: 1 })
    expect(run.s.texts['GEN-CLK-01A']?.count).toBe(1)
    expect(run.events.filter((e) => e.type === 'faction_plan_advanced' && e.payload.planId === 'copper_registration')).toHaveLength(1)
  })

  it('stabilising a core adventure turns the clock back once', () => {
    const run = new TestRun().setClock(5)
    run.settle([draft('core_arc_resolved', { arcId: 'gray_well', outcomes: ['stabilized'] })])
    expect(run.s.clock.value).toBe(4)
    run.settle([draft('core_arc_resolved', { arcId: 'gray_well', outcomes: ['stabilized'] })])
    expect(run.s.clock.value).toBe(4)
  })

  it('extra advances are limited to one per check window', () => {
    const run = new TestRun()
    run.round(1)
    run.commit(extraAdvance(run.s, 'panic')!.drafts)
    expect(extraAdvance(run.s, 'ritual')).toBeNull()
    run.rounds(7)
    expect(extraAdvance(run.s, 'ritual')).not.toBeNull()
  })

  it('a slot first reached by an extra advance still gets its world event, and the next check does not skip it', () => {
    const run = new TestRun()
    run.round(1)
    const r = extraAdvance(run.s, 'panic')!
    expect(r.texts).toHaveLength(1)
    expect(r.texts[0]).toMatch(/^GEN-CLK-01[AB]$/)
    run.commit(r.drafts)
    expect(run.s.clock.value).toBe(1)
    run.rounds(6)
    const shown = run.events.filter((e) => e.type === 'text_shown').map((e) => e.payload.textId).filter((id) => id.startsWith('GEN-CLK-0'))
    expect(shown[0]).toMatch(/^GEN-CLK-01/)
    expect(shown.filter((id) => id.startsWith('GEN-CLK-01'))).toHaveLength(1)
  })

  it('hunger 8 moves the clock once', () => {
    const run = new TestRun()
    run.round(1)
    run.settle([draft('hunger_changed', { delta: 8, value: 8, cause: 'other' })])
    expect(run.s.clock.value).toBe(1)
    run.rounds(8)
    run.settle([draft('hunger_changed', { delta: 1, value: 9, cause: 'other' })])
    expect(run.s.clock.extras).toHaveLength(1)
  })
})

describe('world crisis (R3)', () => {
  it('frames the crisis in its second round, then worsens every 2 rounds through X1–X6', () => {
    const run = new TestRun().setClock(11)
    run.rounds(6)
    expect(run.s.texts['GEN-CLK-12A']).toBeDefined()
    const shown: string[] = []
    for (let i = 0; i < 16; i++) shown.push(...run.round().texts)
    expect(shown).toEqual(['GEN-CLK-12B', 'GEN-CLK-X1', 'GEN-CLK-X2', 'GEN-CLK-X3', 'GEN-CLK-X4', 'GEN-CLK-X5', 'GEN-CLK-X6', 'GEN-CLK-X6'])
    expect(run.s.clock.crisisStep).toBe(7)
  })
})

describe('regions (02 §11)', () => {
  const advanced = (planId: string, slot: number) => draft('faction_plan_advanced', { factionId: 'copper_guild', planId, stage: slot })

  it('stages follow the highest clock and never go back', () => {
    const run = new TestRun().setClock(7)
    run.settle([advanced('copper_buy_wells', 7)])
    expect(run.s.regions.gray_harbor?.stage).toBe('unrest')
    run.settle([draft('clock_reversed', { from: 7, to: 5, cause: 'test' })])
    expect(run.s.regions.gray_harbor?.stage).toBe('unrest')
  })

  it('converges with its default outcome when the driving plan stands', () => {
    const run = new TestRun().setClock(10)
    run.settle([advanced('copper_take_council', 10)])
    expect(run.s.regions.gray_harbor).toMatchObject({ stage: 'converging', defaultOutcome: 'tide_well_to_guild' })
    expect(run.s.objects.tide_well).toBe('guild_kept')
    expect(run.s.directions.D03).toBe(2)
  })

  it('does not converge by default once the driving faction has fallen', () => {
    const run = new TestRun().setClock(10)
    run.commit([advanced('copper_take_council', 10)])
    run.settle([draft('npc_state_changed', { npcId: 'cedric', state: 'captive' })])
    expect(run.s.factions.copper_guild?.state).toBe('fallen')
    expect(run.s.regions.gray_harbor?.stage).not.toBe('converging')
  })

  it('waits while the party is inside the core adventure', () => {
    const run = new TestRun().setClock(10)
    run.commit([draft('location_changed', { regionId: 'gray_harbor', placeId: 'gray_harbor.docks' }), draft('arc_beat_reached', { arcId: 'gray_well', beat: 'cause' })])
    run.settle([advanced('copper_take_council', 10)])
    expect(run.s.regions.gray_harbor?.stage).not.toBe('converging')
    run.settle([draft('core_arc_resolved', { arcId: 'gray_well', outcomes: ['exposed'] })])
    expect(run.s.regions.gray_harbor?.stage).toBe('resolved')
    expect(regionDrafts(run.s)).toEqual([])
  })
})

describe('hunger (04 §7)', () => {
  it('call and read feed, rest calms; a name rests only once', () => {
    const run = new TestRun()
    run.commit(nameDrafts(run.s, 'pip', 'call')!)
    run.commit(nameDrafts(run.s, 'pip', 'read')!)
    expect(run.s.hunger).toBe(2)
    run.commit(nameDrafts(run.s, 'pip', 'rest')!)
    expect(run.s.hunger).toBe(1)
    expect(run.s.directions.D19).toBe(1)
    expect(nameDrafts(run.s, 'pip', 'rest')).toBeNull()
    expect(nameDrafts(run.s, 'ned', 'rest')).not.toBeNull()
  })

  it('at 5 or more D12 rises every 3 rounds', () => {
    const run = new TestRun()
    run.commit([draft('hunger_changed', { delta: 5, value: 5, cause: 'other' })])
    run.rounds(6)
    expect(run.s.directions.D12).toBe(2)
  })
})

describe('player projects (12 §6.3)', () => {
  it('idea → founded → operational → stable', () => {
    const run = new TestRun()
    run.round(1)
    run.settle(createProject(run.s, 'p1', 'tavern', 'gray_harbor')!)
    expect(foundProject(run.s, 'p1', false, 'ludo')).toEqual({ refused: 'no_funds' })
    expect(foundProject(run.s, 'p1', true, 'felix')).toEqual({ refused: 'no_contact' })
    const founded = foundProject(run.s, 'p1', true, 'ludo')
    if (!('drafts' in founded)) throw new Error('not founded')
    run.settle(founded.drafts)
    let n = 0
    const invest = (r: number) => {
      if (run.s.round !== r) run.round(r)
      run.settle([choiceDraft(run.s, act({ sceneId: `tavern-${++n}`, projectId: 'p1', drafts: [], settled: ['task'] }))!])
    }
    invest(2)
    invest(2)
    invest(3)
    expect(run.s.projects.p1?.stage).toBe('founded')
    invest(4)
    expect(run.s.projects.p1?.stage).toBe('operational')
    expect(run.events.some((e) => e.type === 'business_operational')).toBe(true)
    expect(d01Variant(run.s)).toEqual({ variant: 'settle', regionId: 'gray_harbor' })
    run.settle([projectRiskDraft('p1', 'brawl', true)], { profitable: new Set(['p1']) })
    expect(run.s.projects.p1?.stage).toBe('stable')
    expect(run.s.facts.project_risk_weathered).toBeTruthy()
    expect(run.events.some((e) => e.type === 'business_profitable' && e.payload.sustained)).toBe(true)
  })
})

describe('ending candidates (06 §3, 12 §6.5)', () => {
  it('wrapping up at exactly 31 offers only D01, plus D02 when its disaster premise holds', () => {
    const run = new TestRun().choices('s1', 31)
    run.commit([draft('direction_weight_changed', { directionId: 'D03', delta: 3, value: 3 }), draft('npc_attitude_changed', { npcId: 'cedric', towardsId: 'party', delta: 2, value: 2 })])
    expect(endingCandidates(run.s)).toEqual(['D01'])
    run.commit([draft('npc_state_changed', { npcId: 'marcus', state: 'active' }), draft('core_arc_resolved', { arcId: 'gray_well', outcomes: ['failed'] })])
    expect(whyUnavailable(run.s, 'D02')).toBe('premise')
    run.commit([draft('hunger_changed', { delta: 8, value: 8, cause: 'other' })])
    expect(endingCandidates(run.s).sort()).toEqual(['D01', 'D02'])
  })

  it('tier 1 needs 40 choices, a core adventure and truth level 2, plus a signal', () => {
    const run = new TestRun().choices('s1', 40)
    run.commit([draft('npc_attitude_changed', { npcId: 'cedric', towardsId: 'party', delta: 2, value: 2 })])
    expect(whyUnavailable(run.s, 'D03')).toBe('tier')
    run.commit([draft('core_arc_resolved', { arcId: 'gray_well', outcomes: ['traded'] })])
    expect(whyUnavailable(run.s, 'D03')).toBe('tier')
    run.commit([draft('truth_verified', { truthId: 'web_devours', layer: 2 })])
    expect(whyUnavailable(run.s, 'D03')).toBeNull()
    expect(whyUnavailable(run.s, 'D07')).toBe('signal')
    expect(whyUnavailable(run.s, 'D04')).toBe('signal')
  })

  it('k = min(3, n); scores ≤ −3 drop out and D01 stays when all are gone', () => {
    const run = new TestRun().choices('s1', 40)
    run.commit([
      draft('core_arc_resolved', { arcId: 'gray_well', outcomes: ['traded'] }),
      draft('truth_verified', { truthId: 'web_devours', layer: 2 }),
      draft('npc_attitude_changed', { npcId: 'cedric', towardsId: 'party', delta: 2, value: 2 }),
      draft('npc_attitude_changed', { npcId: 'agatha', towardsId: 'party', delta: 1, value: 2 }),
      draft('hunger_changed', { delta: 8, value: 8, cause: 'other' }),
    ])
    expect(endingCandidates(run.s)).toHaveLength(3)
    run.commit([draft('direction_weight_changed', { directionId: 'D07', delta: -3, value: -3 })])
    expect(endingCandidates(run.s).sort()).toEqual(['D01', 'D02', 'D03'])
    run.commit(['D01', 'D02', 'D03'].map((d) => draft('direction_weight_changed', { directionId: d as 'D01', delta: -3, value: -3 })))
    expect(endingCandidates(run.s)).toEqual(['D01'])
  })

  it('weights are max(score, 0) + 1, never zero or negative', () => {
    expect([-2, -1, 0, 1, 4].map(weightOf)).toEqual([1, 1, 1, 2, 5])
  })

  it('the same seed gives the same candidates; different seeds can differ', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((item) => ({ item, weight: 1 }))
    expect(drawWeighted(items, 3, rngFor('x', 'c'))).toEqual(drawWeighted(items, 3, rngFor('x', 'c')))
    const draws = new Set(Array.from({ length: 20 }, (_, i) => drawWeighted(items, 3, rngFor(`seed-${i}`, 'c')).join()))
    expect(draws.size).toBeGreaterThan(1)
  })

  it('directions scoring 3 or more are drawn first', () => {
    for (let i = 0; i < 10; i++) {
      const run = new TestRun(undefined, `seed-${i}`).choices('s1', 40)
      run.commit([
        draft('core_arc_resolved', { arcId: 'gray_well', outcomes: ['traded'] }),
        draft('truth_verified', { truthId: 'web_devours', layer: 2 }),
        draft('npc_attitude_changed', { npcId: 'cedric', towardsId: 'party', delta: 2, value: 2 }),
        draft('npc_attitude_changed', { npcId: 'agatha', towardsId: 'party', delta: 1, value: 2 }),
        draft('hunger_changed', { delta: 8, value: 8, cause: 'other' }),
        draft('direction_weight_changed', { directionId: 'D07', delta: 3, value: 3 }),
      ])
      run.commit([draft('direction_weight_changed', { directionId: 'D01', delta: 3, value: 3 })])
      expect(endingCandidates(run.s).slice(0, 2).sort()).toEqual(['D01', 'D07'])
    }
  })

  it('D02 needs the crisis or hunger 8; door outcomes filter directions at the door', () => {
    const run = new TestRun().choices('s1', 31)
    expect(whyUnavailable(run.s, 'D02')).toBe('premise')
    run.commit([draft('world_crisis_started', {})])
    expect(whyUnavailable(run.s, 'D02')).toBeNull()
    run.commit([draft('location_changed', { regionId: 'nameless_city', placeId: 'nameless_city.door' })])
    run.commit([draft('door_outcome_committed', { outcome: 'hold', votes: ['hold'], tieRoll: 0 })])
    expect(whyUnavailable(run.s, 'D02')).toBe('door')
  })

  it('D17 needs the door, 4 hearts and the fifth truth; D12 ends once Astrion is sealed', () => {
    const run = new TestRun()
    const d17 = DIRECTION_RULES.D17.premise!
    run.commit([draft('truth_verified', { truthId: 'beyond_the_door', layer: 5 })])
    for (const id of ['crown_bell', 'rock_bell', 'leaf_bell', 'river_bell'] as const) run.commit([draft('bell_heart_moved', { bellHeartId: id, holder: 'party', holderId: 'party' })])
    expect(d17(run.s)).toBe(false)
    run.commit([draft('location_changed', { regionId: 'nameless_city', placeId: 'nameless_city.door' })])
    expect(d17(run.s)).toBe(true)
    run.commit([draft('bell_heart_moved', { bellHeartId: 'river_bell', holder: 'destroyed', holderId: '' })])
    expect(d17(run.s)).toBe(false)
    expect(DIRECTION_RULES.D12.negation!(run.s)).toBe(false)
    run.commit([draft('fact_established', { factId: 'astrion_sealed', source: 'test' })])
    expect(DIRECTION_RULES.D12.negation!(run.s)).toBe(true)
    expect(whyUnavailable(run.s, 'D12')).not.toBeNull()
  })

  it('D01 is 远行 without a running project or two close people in one region', () => {
    const run = new TestRun()
    expect(d01Variant(run.s)).toEqual({ variant: 'wander' })
    run.commit([draft('npc_attitude_changed', { npcId: 'rosa', towardsId: 'party', delta: 2, value: 2 })])
    expect(d01Variant(run.s)).toEqual({ variant: 'wander' })
    run.commit([draft('npc_attitude_changed', { npcId: 'fabian', towardsId: 'party', delta: 2, value: 2 })])
    expect(d01Variant(run.s)).toEqual({ variant: 'settle', regionId: 'gray_harbor' })
  })
})

describe('direction scores (06 §2, R6)', () => {
  it('caps the net change per direction at ±3 a round and doubles pushes in act 4', () => {
    const run = new TestRun()
    run.round(1)
    run.commit([directionDraft(run.s, 'D03', 2)!])
    expect(directionDraft(run.s, 'D03', 2)).toEqual(draft('direction_weight_changed', { directionId: 'D03', delta: 1, value: 3 }))
    run.commit([directionDraft(run.s, 'D03', 2)!])
    expect(directionDraft(run.s, 'D03', 1)).toBeNull()
    run.round(2)
    run.commit([draft('act_entered', { act: 4, via: 'wrap_up' })])
    expect(directionDraft(run.s, 'D07', 1)).toEqual(draft('direction_weight_changed', { directionId: 'D07', delta: 2, value: 2 }))
  })
})

describe('conditions', () => {
  it('reads facts, objects, attitudes, tags and scene presence', () => {
    const run = new TestRun()
    run.commit([draft('ambience_changed', { time: '夜', weather: '雨' }), draft('location_changed', { regionId: 'gray_harbor', placeId: 'gray_harbor.seven_lamps' })])
    const s = run.s
    expect(evalCond({ tag: '夜' }, s)).toBe(true)
    expect(evalCond({ object: 'tide_well', op: 'eq', value: 'running' }, s)).toBe(true)
    expect(evalCond({ attitude: 'ludo', op: 'ge', value: 1 }, s)).toBe(true)
    expect(evalCond({ var: 'location', op: 'eq', value: 'gray_harbor' }, s)).toBe(true)
    expect(evalCond({ var: 'visited_place', op: 'eq', value: 'gray_harbor.seven_lamps' }, s)).toBe(true)
    expect(evalCond({ npc: 'rosa', presence: 'present' }, s, { present: ['rosa'] })).toBe(true)
    expect(evalCond({ any: [{ fact: 'ledger_held', op: 'eq', value: true }, { tag: '雪' }] }, s)).toBe(false)
  })
})
