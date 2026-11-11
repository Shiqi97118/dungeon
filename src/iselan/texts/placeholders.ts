import type { RegionId } from '../data'
import { VOCAB } from '../data'
import type { Snapshot } from '../events'
import { bellHeartsHeld } from '../rules/conditions'

/** 09 §5: each region's sound, for {到访之声}. */
export const REGION_SOUNDS: Readonly<Partial<Record<RegionId, string>>> = {
  gray_harbor: '雨和讨价还价',
  kalvis: '钟楼和盔甲',
  whitestone: '滴水和回声',
  silverleaf: '树叶的重复',
  bell_valley: '整点钟鸣',
  ember_plains: '鼓和熔岩',
  silent_sea: '没有声音',
  nameless_city: '自己的名字在消失',
}

const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
export const chineseNumber = (n: number) => DIGITS[n] ?? String(n)

const regionName = (id: RegionId) => VOCAB.regions.find((r) => r.id === id)?.name ?? id
const placeRegion = (id: string) => VOCAB.places.find((p) => p.id === id)?.region

/** Regions in the order the party first stood in them. */
export function visitOrder(s: Snapshot): RegionId[] {
  const out: RegionId[] = []
  for (const place of s.visitedPlaces) {
    const r = placeRegion(place)
    if (r && !out.includes(r)) out.push(r)
  }
  if (s.location && !out.includes(s.location.regionId)) out.push(s.location.regionId)
  return out
}

/** {钟心去向}: hearts the party does not hold, as far as the log knows; empty when all are in hand. */
export function heartWhereabouts(s: Snapshot): string {
  const parts: string[] = []
  for (const city of VOCAB.bellCities) {
    const h = s.bells.hearts[city.id]
    if (!h || h.holder === 'party' || h.holder === 'origin') continue
    if (h.holder === 'destroyed') parts.push(`${city.name}的钟心已毁`)
    else parts.push(`${city.name}的钟心在${VOCAB.factions.find((f) => f.id === h.holderId)?.name ?? h.holderId}手里`)
  }
  return parts.join('；')
}

/** Values the caller knows about the moment; the rest come from the snapshot. */
export interface PlaceholderInput {
  readonly 角色?: string
  readonly 同伴?: string
  readonly 队伍?: string
  readonly 纪念物?: string
  readonly 收束之地?: RegionId
  readonly [name: string]: string | undefined
}

export function placeholderValues(s: Snapshot, input: PlaceholderInput): Record<string, string | undefined> {
  return {
    队伍: '你们',
    钟心数: chineseNumber(bellHeartsHeld(s)),
    到访之声: visitOrder(s).map((r) => REGION_SOUNDS[r]).filter(Boolean).join('，'),
    钟心去向: heartWhereabouts(s),
    ...input,
    收束之地: input.收束之地 ? regionName(input.收束之地) : undefined,
  }
}

const PATTERN = /\{([^{}]+)\}/g

/**
 * 09 §2: replace every {name}. A placeholder with no value is reported rather than left in the
 * text (「其余内容不留空」); {钟心去向} may legitimately be empty and is then dropped.
 */
export function fillPlaceholders(text: string, values: Readonly<Record<string, string | undefined>>): { readonly text: string; readonly missing: string[] } {
  const missing: string[] = []
  const out = text.replace(PATTERN, (whole, name: string) => {
    const v = values[name]
    if (v === undefined || (v === '' && name !== '钟心去向')) {
      missing.push(name)
      return whole
    }
    return v
  })
  return { text: out, missing }
}
