import { draft, type Snapshot } from '../../iselan/events'
import { createProject } from '../../iselan/rules'
import { TestRun } from '../../iselan/rules/testRun'
import { placeholderValues, sceneChange, selectFor, shownDrafts, type Pick } from '../../iselan/texts'
import { blockFromPick, paginate, sceneBlocks, type Block, type Screen } from './pages'

export interface DemoBatch {
  readonly title: string
  readonly screens: readonly Screen[]
  readonly s: Snapshot
}

const AI_RESULT = [
  '赫兰把斗篷的兜帽往下拉了拉，沿着码头的木栈道一路问过去。卸货的工人起初只是摇头，直到他把两枚铜币放在一只倒扣的木箱上，才有人抬了抬下巴，示意他去看栈桥尽头那盏被雨打得忽明忽暗的灯。',
]
const AI_CLOSING = [
  '灯下没有人。赫兰只在湿透的缆桩上摸到一道新刻的划痕，像有人用指甲反复描过同一个名字。雨声把码头上的讨价还价压低了一层，他把那道划痕的形状记在心里，转身离开。',
]
const AI_ROSA = [
  '吧台后面的女人正用一块旧布擦拭铜灯的灯罩，听见门响也没有抬头。等赫兰在吧台前坐下，她才把擦好的灯罩扣回去，往他面前推了一杯冒着热气的麦酒，目光在他湿透的肩头停了一下。',
]

const shown = (run: TestRun, pick: Pick | null) => {
  if (pick) run.commit(shownDrafts(run.s, pick).drafts)
}

/**
 * Dev-only sample for `?demo=reading`: a Grayport run built through the real ledger and rules,
 * with texts chosen by the real selector. The AI paragraphs are stand-ins for host narration.
 */
export function demoBatches(): DemoBatch[] {
  const run = new TestRun()
  run.commit([
    draft('region_visited', { regionId: 'gray_harbor', isOutsideStart: false, visitIndex: 1 }),
    draft('location_changed', { regionId: 'gray_harbor', placeId: 'gray_harbor.docks' }),
  ])
  run.rounds(12)
  run.commit([
    ...createProject(run.s, 'aid', 'sanctuary', 'gray_harbor')!,
    draft('player_project_stage_changed', { projectId: 'aid', stage: 'founded' }),
    draft('bell_heart_moved', { bellHeartId: 'crown_bell', holder: 'origin', holderId: 'crown_bell' }),
    draft('bell_heart_moved', { bellHeartId: 'mist_bell', holder: 'faction', holderId: 'copper_guild' }),
  ])
  const values = () => placeholderValues(run.s, { 角色: '赫兰' })

  const action = selectFor(run.s, 'action', { ctx: { tags: ['雨', '夜', '调查', '室外'] } }).pick
  const first: Block[] = [{ paragraphs: AI_RESULT, source: 'ai' }]
  if (action) first.push(blockFromPick(action, values()).block)
  shown(run, action)
  const s1 = run.s

  run.commit([draft('location_changed', { regionId: 'gray_harbor', placeId: 'gray_harbor.seven_lamps' })])
  const change = sceneChange(run.s, { closing: AI_CLOSING, travel: false, arrival: { tags: ['夜', '室内', '雨'] } })
  const second = sceneBlocks(change, values()).blocks
  shown(run, change.transition)
  shown(run, change.arrival)
  const meet = selectFor(run.s, 'firstMeet', { ids: ['GH-DLG-罗莎'], ctx: { present: ['rosa'] } }).pick
  second.push({ paragraphs: AI_ROSA, source: 'ai' })
  if (meet) second.push(blockFromPick(meet, values()).block)
  shown(run, meet)

  return [
    { title: '码头 · 调查', screens: paginate(first), s: s1 },
    { title: '换场景 · 前往七灯酒馆', screens: paginate(second), s: run.s },
  ]
}
