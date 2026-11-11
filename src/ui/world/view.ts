import type { RegionId } from '../../iselan/data'
import { TEXT_BY_ID, VOCAB } from '../../iselan/data'
import type { ProjectSnapshot, Snapshot } from '../../iselan/events'
import { CONFIG } from '../../iselan/config'
import { investedSinceFounding } from '../../iselan/rules'
import { chineseNumber, visitOrder } from '../../iselan/texts'

const regionName = (id: RegionId) => VOCAB.regions.find((r) => r.id === id)?.name ?? id
const factionName = (id: string) => VOCAB.factions.find((f) => f.id === id)?.name ?? id

export interface WorldEvent {
  readonly id: string
  readonly title: string
  readonly paragraphs: readonly string[]
}

/** 局势: world events (CLK texts) the party has seen, newest first. The clock itself is never shown. */
export function worldEvents(s: Snapshot): { readonly crisis: boolean; readonly events: readonly WorldEvent[] } {
  const events = Object.entries(s.texts)
    .map(([id, t]) => ({ id, t, text: TEXT_BY_ID.get(id) }))
    .filter((x) => x.text?.kind === 'CLK')
    .sort((a, b) => b.t.lastRound - a.t.lastRound || (a.id < b.id ? 1 : -1))
    .map(({ id, text }) => ({ id, title: text!.title, paragraphs: text!.body }))
  return { crisis: s.clock.crisis, events }
}

export interface HeartRow {
  readonly cityId: string
  readonly city: string
  readonly region: string
  readonly status: string
  readonly held: boolean
}

/** 钟心: where each heart is, as far as the log (what the party has learned) says. */
export function heartRows(s: Snapshot): HeartRow[] {
  return VOCAB.bellCities.map((c) => {
    const h = s.bells.hearts[c.id]
    const status = !h
      ? '下落未明'
      : h.holder === 'party'
        ? '在你们手中'
        : h.holder === 'origin'
          ? `仍在${c.name}`
          : h.holder === 'destroyed'
            ? '已毁'
            : `在${factionName(h.holderId)}手中`
    return { cityId: c.id, city: c.name, region: regionName(c.region as RegionId), status, held: h?.holder === 'party' }
  })
}

export const heldSummary = (rows: readonly HeartRow[]) => `你们持有${chineseNumber(rows.filter((r) => r.held).length)}枚钟心`

const STAGE_LABEL: Record<NonNullable<Snapshot['regions'][RegionId]>['stage'], string> = {
  calm: '平静',
  unrest: '动荡',
  converging: '局势汇聚',
  resolved: '已收束',
}

export interface RegionRow {
  readonly id: RegionId
  readonly name: string
  readonly stage: string
  readonly here: boolean
  readonly places: readonly { readonly name: string; readonly here: boolean }[]
}

/** 已到访地区, in the order the party first stood in them, with the places seen in each. */
export function visitedRegions(s: Snapshot): RegionRow[] {
  return visitOrder(s).map((id) => ({
    id,
    name: regionName(id),
    stage: STAGE_LABEL[s.regions[id]?.stage ?? 'calm'],
    here: s.location?.regionId === id,
    places: VOCAB.places
      .filter((p) => p.region === id && s.visitedPlaces.includes(p.id))
      .map((p) => ({ name: p.name, here: s.location?.placeId === p.id })),
  }))
}

const KIND_LABEL: Record<ProjectSnapshot['kind'], string> = {
  tavern: '酒馆', guild: '行会', caravan: '商队', sanctuary: '互助站', home: '家', custom: '自定事业',
}
export const PROJECT_STEPS = ['idea', 'founded', 'operational', 'stable'] as const
export const STEP_LABEL: Record<ProjectSnapshot['stage'], string> = {
  idea: '构想', founded: '创办', operational: '运转', stable: '稳定', closed: '已关闭',
}
const RISK_LABEL: Record<ProjectSnapshot['risks'][number]['risk'], string> = {
  tax: '征税', seal: '查封', brawl: '斗殴', patients: '病人涌入', other: '意外',
}

export interface ProjectRow {
  readonly id: string
  readonly name: string
  readonly region: string
  readonly stage: ProjectSnapshot['stage']
  readonly stageLabel: string
  /** What the next step still needs (12 §6.3), in words. */
  readonly next: string | null
  readonly risks: readonly string[]
}

function nextStep(p: ProjectSnapshot): string | null {
  if (p.stage === 'idea') return '还需要资金或物资，以及一位信任你们的本地联系人'
  if (p.stage === 'founded') {
    const left = CONFIG.projectOperationalActions - investedSinceFounding(p)
    return `再投入${chineseNumber(Math.max(left, 0))}轮行动即可运转`
  }
  if (p.stage === 'operational') return '经受一次风险而不关门，才算稳定'
  return null
}

/** 事业: the party's projects and how far each has come. */
export function projectRows(s: Snapshot): ProjectRow[] {
  return Object.entries(s.projects).map(([id, p]) => ({
    id,
    name: KIND_LABEL[p.kind],
    region: regionName(p.regionId),
    stage: p.stage,
    stageLabel: STEP_LABEL[p.stage],
    next: nextStep(p),
    risks: p.risks.map((r) => `${RISK_LABEL[r.risk]}·${r.weathered ? '挺过' : '受挫'}`),
  }))
}
