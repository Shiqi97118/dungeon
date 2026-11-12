import type { Pick, SceneChange } from '../../iselan/texts'
import { fillPlaceholders, screenProblems } from '../../iselan/texts'
import { VOCAB } from '../../iselan/data'

/** 09 §3.3a three-part scene change. */
export type ScenePart = 'closing' | 'transition' | 'arrival'

/** One run of narration: an AI result, a prewritten text, or one part of a scene change. */
export interface Block {
  readonly paragraphs: readonly string[]
  /** Text id, or `ai` for narration written by the host. */
  readonly source: string
  readonly images?: readonly string[]
  readonly part?: ScenePart
  /** Display name of the speaker of a DLG line. */
  readonly speaker?: string
}

export interface Paragraph {
  readonly text: string
  readonly source: string
  readonly part?: ScenePart
  readonly speaker?: string
}

/** Everything shown before the player clicks 继续 or makes the next choice (09 §3.3a). */
export interface Screen {
  readonly paragraphs: readonly Paragraph[]
  readonly images: readonly string[]
  /** Non-empty only when the whole batch is too short to fill one screen; the host must write more. */
  readonly problems: readonly string[]
}

export function blockFromPick(pick: Pick, values: Readonly<Record<string, string | undefined>>, part?: ScenePart): { block: Block; missing: string[] } {
  const missing: string[] = []
  const paragraphs = pick.paragraphs.map((p) => {
    const r = fillPlaceholders(p, values)
    missing.push(...r.missing)
    return r.text
  })
  const speaker = VOCAB.npcs.find((n) => n.id === pick.unit.entry.speaker)?.name
  return { block: { paragraphs, source: pick.unit.id, images: pick.images, ...(part ? { part } : {}), ...(speaker ? { speaker } : {}) }, missing }
}

/** Closing, transition and arrival as blocks; parts the selector could not fill stay in `change.problems`. */
export function sceneBlocks(change: SceneChange, values: Readonly<Record<string, string | undefined>>): { blocks: Block[]; missing: string[] } {
  const blocks: Block[] = [{ paragraphs: change.closing, source: 'ai', part: 'closing' }]
  const missing: string[] = []
  for (const [pick, part] of [[change.transition, 'transition'], [change.arrival, 'arrival']] as const) {
    if (!pick) continue
    const r = blockFromPick(pick, values, part)
    blocks.push(r.block)
    missing.push(...r.missing)
  }
  return { blocks, missing }
}

const filled = (paragraphs: readonly Paragraph[]) => screenProblems(paragraphs.map((p) => p.text)).length === 0

/**
 * Split a batch into screens. Blocks stay whole and short ones merge forward until a screen has
 * two paragraphs and `screenMinChars` characters; a short tail merges back into the screen before
 * it. Closing and transition never split, so a scene change spans at most two screens with the
 * only break before the arrival.
 */
export function paginate(blocks: readonly Block[]): Screen[] {
  const units: { paragraphs: Paragraph[]; images: string[] }[] = []
  let joinNext = false
  for (const b of blocks) {
    const paragraphs = b.paragraphs.filter((t) => t.trim()).map((text) => ({ text, source: b.source, part: b.part, speaker: b.speaker }))
    if (!paragraphs.length) continue
    const images = [...(b.images ?? [])]
    if (joinNext && units.length) {
      units[units.length - 1].paragraphs.push(...paragraphs)
      units[units.length - 1].images.push(...images)
    } else {
      units.push({ paragraphs, images })
    }
    joinNext = b.part === 'closing'
  }

  const screens: { paragraphs: Paragraph[]; images: string[] }[] = []
  let current: { paragraphs: Paragraph[]; images: string[] } | null = null
  for (const u of units) {
    current ??= { paragraphs: [], images: [] }
    current.paragraphs.push(...u.paragraphs)
    current.images.push(...u.images)
    if (filled(current.paragraphs)) {
      screens.push(current)
      current = null
    }
  }
  if (current) {
    const prev = screens.at(-1)
    if (prev) {
      prev.paragraphs.push(...current.paragraphs)
      prev.images.push(...current.images)
    } else {
      screens.push(current)
    }
  }
  return screens.map((sc) => ({ ...sc, problems: screenProblems(sc.paragraphs.map((p) => p.text)) }))
}

export interface ReaderView {
  readonly page: number
  readonly total: number
  readonly screen: Screen | null
  readonly canBack: boolean
  readonly canContinue: boolean
  readonly atEnd: boolean
}

/** Where the reader stands. Pages only change through `turnPage`, i.e. a player's input. */
export function readerView(screens: readonly Screen[], page: number): ReaderView {
  const total = screens.length
  const p = Math.min(Math.max(page, 0), Math.max(total - 1, 0))
  return { page: p, total, screen: screens[p] ?? null, canBack: p > 0, canContinue: p < total - 1, atEnd: p >= total - 1 }
}

export const turnPage = (screens: readonly Screen[], page: number, delta: 1 | -1) => readerView(screens, page + delta).page
