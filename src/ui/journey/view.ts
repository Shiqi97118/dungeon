import { VOCAB, type DirectionId, type PlaceId } from '../../iselan/data'
import type { Snapshot } from '../../iselan/events'
import { ALL_UNITS } from '../../iselan/texts'
import type { Screen as TableScreen } from '../../iselan/play'
import { paginate, type Block, type Screen } from '../reading/pages'

const speakerOf = (textId: string | undefined) => {
  const id = textId && ALL_UNITS.find((u) => u.id === textId)?.entry.speaker
  return id ? VOCAB.npcs.find((n) => n.id === id)?.name : undefined
}

/** Table screens of one batch as reader pages (09 §3.3a: two paragraphs and enough text per page). */
export function pagesOf(screens: readonly TableScreen[]): Screen[] {
  const blocks: Block[] = screens.map((s) => {
    const speaker = speakerOf(s.textId)
    return {
      paragraphs: s.paragraphs,
      source: s.kind === 'text' ? (s.textId ?? 'text') : 'ai',
      ...(s.images?.length ? { images: s.images } : {}),
      ...(s.part ? { part: s.part } : {}),
      ...(speaker ? { speaker } : {}),
    }
  })
  return paginate(blocks)
}

export const GRAYPORT: readonly { readonly id: PlaceId; readonly name: string }[] = VOCAB.places
  .filter((p) => p.region === 'gray_harbor')
  .map((p) => ({ id: p.id as PlaceId, name: p.name }))

export const directionName = (id: DirectionId) => VOCAB.directions.find((d) => d.id === id)?.name ?? id

export const HOOKS = [
  { id: 'memento', label: '纪念物', text: '随身的旧物在雨夜里慢慢发热，像在指路。' },
  { id: 'bellkeeper_messenger', label: '守钟人信使', text: '一个浑身湿透的灰袍人闯进酒馆，把什么塞进你手里。' },
  { id: 'guild_contract', label: '商会委托', text: '吧台上方钉着铜脉商会的新告示，赏金不低。' },
  { id: 'royal_bounty', label: '王室悬赏', text: '摄政公主悬赏能治“遗忘病”的人。' },
] as const

export function statusLine(s: Snapshot): string {
  const where = s.location?.placeId ? VOCAB.places.find((p) => p.id === s.location?.placeId)?.name : '灰港'
  const amb = s.ambience ? `${s.ambience.time} · ${s.ambience.weather}` : ''
  return [`第 ${s.act} 幕`, `第 ${s.round} 轮`, where, amb].filter(Boolean).join(' · ')
}
