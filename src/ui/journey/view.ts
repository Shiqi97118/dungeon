import { VOCAB, type PlaceId } from '../../iselan/data'
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
      ...(s.heading ? { heading: s.heading } : {}),
    }
  })
  return paginate(blocks)
}

export const GRAYPORT: readonly { readonly id: PlaceId; readonly name: string }[] = VOCAB.places
  .filter((p) => p.region === 'gray_harbor')
  .map((p) => ({ id: p.id as PlaceId, name: p.name }))

export function statusLine(s: Snapshot): string {
  const where = s.location?.placeId ? VOCAB.places.find((p) => p.id === s.location?.placeId)?.name : '灰港'
  const amb = s.ambience ? `${s.ambience.time} · ${s.ambience.weather}` : ''
  return [`第 ${s.act} 幕`, `第 ${s.round} 轮`, where, amb].filter(Boolean).join(' · ')
}
