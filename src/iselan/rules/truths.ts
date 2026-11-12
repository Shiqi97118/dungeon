import type { TruthId } from '../data'
import { VOCAB } from '../data'
import { draft, type AnyDraft, type Snapshot } from '../events'
import { hasFact } from './conditions'

/**
 * 03 §11 truth layers, by the reliable sources the v1 slice can reach (Grayport). Each layer
 * is verified on its own, so layers can be skipped; the level is the highest one held.
 */
const SOURCES: readonly { readonly truthId: TruthId; readonly held: (s: Snapshot) => boolean }[] = [
  { truthId: 'web_waking', held: (s) => !!s.arcs.gray_well?.beats.includes('turn') },
  { truthId: 'web_devours', held: (s) => hasFact(s, 'memory_ledger_seen') },
]

const LAYER = new Map<string, number>(VOCAB.truthLayers.map((l) => [l.id, l.level]))

export function truthLayerDrafts(s: Snapshot): AnyDraft[] {
  return SOURCES.filter((x) => x.held(s) && !s.truths.some((t) => t.truthId === x.truthId)).map((x) =>
    draft('truth_verified', { truthId: x.truthId, layer: LAYER.get(x.truthId)! }),
  )
}
