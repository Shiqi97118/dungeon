import { EVENT_FIELDS, EVENT_ID_FIELDS, VOCAB } from '../data'

const values = (o: Readonly<Record<string, string>>) => Object.values(o)
const ids = (list: readonly { readonly id: string }[]) => list.map((x) => x.id)

const ID_SETS: Readonly<Record<string, ReadonlySet<string>>> = {
  region: new Set(ids(VOCAB.regions)),
  place: new Set(ids(VOCAB.places)),
  bellCity: new Set(ids(VOCAB.bellCities)),
  arc: new Set(ids(VOCAB.arcs)),
  npc: new Set(ids(VOCAB.npcs)),
  npcState: new Set(values(VOCAB.npcStates)),
  faction: new Set(ids(VOCAB.factions)),
  factionState: new Set(values(VOCAB.factionStates)),
  darkLine: new Set(ids(VOCAB.darkLines)),
  darkLineState: new Set(values(VOCAB.darkLineStates)),
  truth: new Set([...VOCAB.darkLines.map((d) => d.truthId), ...ids(VOCAB.truthLayers)]),
  direction: new Set(ids(VOCAB.directions)),
  openingHook: new Set(values(VOCAB.openingHooks)),
  beat: new Set(values(VOCAB.beats)),
  outcome: new Set(values(VOCAB.outcomes)),
  doorOutcome: new Set(values(VOCAB.doorOutcomes)),
  object: new Set(ids(VOCAB.objects)),
  fact: new Set(ids(VOCAB.facts)),
  interaction: new Set(VOCAB.interactions),
}

const OBJECT_STATES: ReadonlyMap<string, ReadonlySet<string>> = new Map(VOCAB.objects.map((o) => [o.id, new Set(values(o.states))]))
const DARK_LINE_EVIDENCE: ReadonlyMap<string, ReadonlySet<string>> = new Map(VOCAB.darkLines.map((d) => [d.id, new Set(values(d.evidence))]))

function checkValue(kind: string, field: string, v: unknown): string | null {
  const bad = (want: string) => `${field} 应为 ${want}，实际是 ${JSON.stringify(v)}`
  if (kind.includes('|')) {
    const parts = kind.split('|')
    const idKind = EVENT_ID_FIELDS[field]
    const ok = parts.some((p) => (idKind && ID_SETS[p] ? ID_SETS[p].has(v as string) : v === p))
    return ok ? null : bad(kind)
  }
  if (kind.endsWith('[]')) {
    if (!Array.isArray(v)) return bad(kind)
    for (const item of v) {
      const err = checkValue(kind.slice(0, -2), field, item)
      if (err) return err
    }
    return null
  }
  switch (kind) {
    case 'int':
      return Number.isInteger(v) ? null : bad('整数')
    case 'bool':
      return typeof v === 'boolean' ? null : bad('布尔值')
    case 'string':
      return typeof v === 'string' ? null : bad('字符串')
  }
  const set = ID_SETS[kind]
  if (!set) return `${field} 的类型 ${kind} 没有对应的词表`
  return typeof v === 'string' && set.has(v) ? null : bad(`${kind} 编号`)
}

/** Field-level and cross-field checks for one event; returns problems in Chinese, empty when valid. */
export function validateEvent(type: string, payload: unknown, regionId?: unknown): string[] {
  const spec = (EVENT_FIELDS as Readonly<Record<string, Readonly<Record<string, string>>>>)[type]
  if (!spec) return [`未知事件类型 ${type}`]
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return [`${type} 的 payload 不是对象`]
  const p = payload as Record<string, unknown>
  const problems: string[] = []
  for (const [field, kind] of Object.entries(spec)) {
    if (!(field in p)) {
      problems.push(`${type} 缺少字段 ${field}`)
      continue
    }
    const err = checkValue(kind, field, p[field])
    if (err) problems.push(`${type}：${err}`)
  }
  for (const field of Object.keys(p)) if (!(field in spec)) problems.push(`${type} 多出字段 ${field}`)
  if (regionId !== undefined && !ID_SETS.region.has(regionId as string)) problems.push(`${type}：外壳 regionId ${JSON.stringify(regionId)} 不是区域编号`)
  if (problems.length) return problems

  if (type === 'object_state_changed' && !OBJECT_STATES.get(p.objectId as string)?.has(p.state as string)) {
    problems.push(`object_state_changed：${p.objectId} 没有状态 ${p.state}`)
  }
  if (type === 'truth_evidence_added' && !DARK_LINE_EVIDENCE.get(p.darkLineId as string)?.has(p.evidenceId as string)) {
    problems.push(`truth_evidence_added：${p.darkLineId} 没有证据 ${p.evidenceId}`)
  }
  return problems
}
