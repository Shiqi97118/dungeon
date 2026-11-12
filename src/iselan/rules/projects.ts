import { CONFIG } from '../config'
import type { EventPayloads, NpcId, ObjectId, RegionId } from '../data'
import { VOCAB } from '../data'
import { draft, type AnyDraft, type ProjectSnapshot, type Snapshot } from '../events'
import { attitudeOf, hasFact } from './conditions'

type Kind = EventPayloads['player_project_created']['kind']
type Stage = ProjectSnapshot['stage']

/** Grayport's prewritten project texts read these objects (CNT-01); other kinds have none yet. */
const PROJECT_OBJECT: Partial<Record<Kind, string>> = { sanctuary: 'aid_station', tavern: 'party_tavern' }
const OBJECT_IDS = new Set<string>(VOCAB.objects.map((o) => o.id))

function stageDrafts(s: Snapshot, projectId: string, stage: Stage): AnyDraft[] {
  const p = s.projects[projectId]
  const out: AnyDraft[] = [draft('player_project_stage_changed', { projectId, stage })]
  const objectId = p && PROJECT_OBJECT[p.kind]
  if (objectId && OBJECT_IDS.has(objectId)) out.push(draft('object_state_changed', { objectId: objectId as ObjectId, state: stage }))
  return out
}

export function createProject(s: Snapshot, projectId: string, kind: Kind, regionId: RegionId): AnyDraft[] | null {
  if (s.projects[projectId]) return null
  const out: AnyDraft[] = [draft('player_project_created', { projectId, kind, regionId })]
  const objectId = PROJECT_OBJECT[kind]
  if (objectId && OBJECT_IDS.has(objectId)) out.push(draft('object_state_changed', { objectId: objectId as ObjectId, state: 'idea' }))
  return out
}

export type FoundResult = { readonly drafts: AnyDraft[] } | { readonly refused: 'no_project' | 'not_idea' | 'no_funds' | 'no_contact' }

/** 12 §6.3 创办: money or goods (settled by the action) and a local contact at attitude ≥ +1. */
export function foundProject(s: Snapshot, projectId: string, funded: boolean, contact: NpcId, name?: string): FoundResult {
  const p = s.projects[projectId]
  if (!p) return { refused: 'no_project' }
  if (p.stage !== 'idea') return { refused: 'not_idea' }
  if (!funded) return { refused: 'no_funds' }
  if (attitudeOf(s, contact) < 1) return { refused: 'no_contact' }
  return { drafts: [...stageDrafts(s, projectId, 'founded'), draft('player_project_details', { projectId, name: name || projectName(p.kind), contactId: contact })] }
}

export const PROJECT_KIND_NAME: Readonly<Record<Kind, string>> = { tavern: '酒馆', guild: '行会', caravan: '商队', sanctuary: '互助站', home: '家', custom: '事业' }
const projectName = (kind: Kind) => PROJECT_KIND_NAME[kind]

/** Founded and not closed: the party can put actions into it and it can meet risks. */
export const projectRunning = (p: ProjectSnapshot | undefined) => !!p && ['founded', 'operational', 'stable'].includes(p.stage)

export const investedSinceFounding = (p: ProjectSnapshot) => p.investedRounds.filter((r) => p.foundedRound !== null && r > p.foundedRound).length

export function projectRiskDraft(projectId: string, risk: EventPayloads['player_project_risk']['risk'], weathered: boolean): AnyDraft {
  return draft('player_project_risk', { projectId, risk, weathered })
}

export function closeProject(s: Snapshot, projectId: string): AnyDraft[] | null {
  const p = s.projects[projectId]
  return p && p.stage !== 'closed' ? stageDrafts(s, projectId, 'closed') : null
}

/**
 * 12 §6.3 automatic steps, checked after every change: operational after enough rounds of
 * investment, stable after weathering a risk while running. `profitable` (a tavern's books)
 * comes from the settlement and only matters for the stable step.
 */
export function projectDrafts(s: Snapshot, profitable: ReadonlySet<string> = new Set()): AnyDraft[] {
  const out: AnyDraft[] = []
  for (const [projectId, p] of Object.entries(s.projects)) {
    if (p.stage === 'founded' && investedSinceFounding(p) >= CONFIG.projectOperationalActions) {
      out.push(...stageDrafts(s, projectId, 'operational'))
      out.push(
        p.kind === 'sanctuary'
          ? draft('civic_service_operational', { projectId, kind: 'shelter' })
          : draft('business_operational', { projectId, kind: p.kind, regionId: p.regionId }),
      )
    } else if (p.stage === 'operational' && p.risks.some((r) => r.weathered && p.operationalRound !== null && r.round >= p.operationalRound)) {
      out.push(...stageDrafts(s, projectId, 'stable'))
      if (!hasFact(s, 'project_risk_weathered')) out.push(draft('fact_established', { factId: 'project_risk_weathered', source: projectId }))
      if (p.kind === 'tavern' && profitable.has(projectId)) out.push(draft('business_profitable', { projectId, sustained: true }))
    }
  }
  return out
}
