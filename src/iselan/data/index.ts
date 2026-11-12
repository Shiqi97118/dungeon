import type { CompiledText } from './textTypes'
import { OFFSTAGE_FACTS, TEXTS } from './texts.generated'

export * from './vocab.generated'
export type * from './textTypes'
export { OFFSTAGE_FACTS, TEXTS }

export const TEXT_BY_ID: ReadonlyMap<string, CompiledText> = new Map(TEXTS.map((t) => [t.id, t]))
