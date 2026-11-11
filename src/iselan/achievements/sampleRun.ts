import { draft } from '../events'
import { choiceDraft, createProject, d01Variant, endingCandidates, foundProject } from '../rules'
import { TestRun } from '../rules/testRun'
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

  run.commit([
    draft('truth_evidence_added', { darkLineId: 'dl1', evidenceId: 'felix_ledger', reliable: true }),
    draft('truth_evidence_added', { darkLineId: 'dl1', evidenceId: 'fabian_letter', reliable: true }),
  ])
  const turn = selectFor(run.s, 'beat', { ids: ['GH-BEAT-05'], ctx: { vars: { arc: 'gray_well', beat: 'turn' } as never } }).pick
  if (!turn) throw new Error('没有选中 GH-BEAT-05')
  run.commit(shownDrafts(run.s, turn).drafts) // dl1 revealed with two pieces of evidence: truth_verified, ST03

  run.commit([
    draft('truth_evidence_added', { darkLineId: 'dl8', evidenceId: 'broker_draft', reliable: true }),
    draft('truth_evidence_added', { darkLineId: 'dl8', evidenceId: 'tim_investigation', reliable: true }),
    draft('dark_line_changed', { darkLineId: 'dl8', state: 'revealed' }),
    draft('truth_verified', { truthId: 'merchant_funds_namekeepers', layer: 0 }),
  ]) // LG07

  run.settle([draft('core_arc_resolved', { arcId: 'gray_well', outcomes: ['exposed'] })]) // ST05

  if (!endingCandidates(run.s).includes('D01')) throw new Error('D01 不在结局候选里')
  const v = d01Variant(run.s)
  run.commit([draft('ending_committed', { directionId: 'D01', secondaryDirectionId: 'D03', variant: v.variant, worldResolution: 'unresolved' })]) // ST11
  return run
}
