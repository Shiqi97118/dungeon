import { draft } from '../events'
import { choiceDraft, createProject, d01Variant, endingCandidates, foundProject } from '../rules'
import { TestRun } from '../rules/testRun'
import type { SceneContext } from '../rules/conditions'
import { selectFor, shownDrafts } from '../texts'

/**
 * Test helper: one solo Grayport run, through the real ledger and the real rules wherever v1
 * has them, that earns all 10 v1 achievements. Events that no v1 rule emits yet (the hook, the
 * meeting, trust, the arc's resolution, the ending, the dl8 reveal) are committed as the
 * settlement (ENG-05) and the ending page (UI-02) will commit them.
 */
export function grayportRun(): TestRun {
  const run = new TestRun() // run_started: ST01
  run.round(1)
  run.settle([draft('first_hook_taken', { regionId: 'gray_harbor', hookId: 'memento' })]) // ST02
  run.settle([draft('npc_met', { npcId: 'ludo' })]) // RE01

  run.settle(createProject(run.s, 'p1', 'tavern', 'gray_harbor')!) // SB01
  const founded = foundProject(run.s, 'p1', true, 'ludo')
  if (!('drafts' in founded)) throw new Error(`酒馆没能创办：${founded.refused}`)
  run.settle(founded.drafts)
  for (const round of [2, 3, 4]) {
    run.round(round)
    const invest = choiceDraft(run.s, {
      seatId: 's1', actorId: 'helan', kind: 'act', sceneId: `tavern-${round}`, target: 'p1', method: 'work', drafts: [], settled: ['task'], projectId: 'p1',
    })
    run.settle([invest!]) // operational after the third round: business_operational, SB02
  }

  run.settle([draft('npc_attitude_changed', { npcId: 'ludo', towardsId: 'party', delta: 1, value: 2 }), draft('npc_trust_earned', { npcId: 'ludo' })]) // RE03

  const show = (moment: 'beat' | 'action', id: string, ctx: SceneContext) => {
    const pick = selectFor(run.s, moment, { ids: [id], ctx }).pick
    if (pick?.unit.id !== id) throw new Error(`没有选中 ${id}`)
    run.commit(shownDrafts(run.s, pick, ctx).drafts)
  }
  const arc = (beat: string): SceneContext => ({ present: ['felix'], vars: { arc: 'gray_well', beat } as never })

  // dl1 and dl8 both get the ledger; Fabian's letter is dl1's second piece of evidence.
  show('beat', 'GH-BEAT-04', arc('discovery'))
  run.commit([draft('truth_evidence_added', { darkLineId: 'dl1', evidenceId: 'fabian_letter', reliable: true })])
  show('beat', 'GH-BEAT-05', arc('turn')) // dl1 revealed with two pieces of evidence: truth_verified, ST03

  // dl8 through Tim's lines: a clue, his investigation, then the reveal once the ledger has been seen.
  const tim: SceneContext = { present: ['tim'] }
  run.settle([draft('npc_attitude_changed', { npcId: 'tim', towardsId: 'party', delta: 2, value: 2 })])
  show('action', 'GH-DLG-提姆·小丘/态度≥+1', tim)
  show('action', 'GH-DLG-提姆·小丘/失言', tim)
  show('action', 'GH-DLG-提姆·小丘/转折', tim) // truth_verified merchant_funds_namekeepers: LG07

  run.settle([draft('core_arc_resolved', { arcId: 'gray_well', outcomes: ['exposed'] })]) // ST05

  if (!endingCandidates(run.s).includes('D01')) throw new Error('D01 不在结局候选里')
  const v = d01Variant(run.s)
  run.commit([draft('ending_committed', { directionId: 'D01', secondaryDirectionId: 'D03', variant: v.variant, worldResolution: 'unresolved' })]) // ST11
  return run
}
