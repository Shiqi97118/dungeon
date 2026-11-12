import type { ActorId, BeatId, NpcId, PlaceId, Tag } from '../data'
import { VOCAB } from '../data'
import { draft, type AnyDraft, type Snapshot } from '../events'
import { npcStateOf, type SceneContext } from '../rules/conditions'
import { rngFor } from '../rules/random'

/**
 * What the table needs to know about the world that the log does not record: where people
 * usually are, what a place is like, and how time passes. v1 covers Grayport only.
 */

/** Where each Grayport person is found when the story has not put them elsewhere (03 §灰港). */
export const HOME: Readonly<Partial<Record<NpcId, PlaceId>>> = {
  rosa: 'gray_harbor.seven_lamps',
  tim: 'gray_harbor.seven_lamps',
  cedric: 'gray_harbor.copper_tower',
  felix: 'gray_harbor.silver_tongue_auction',
  fabian: 'gray_harbor.council_hall',
  agatha: 'gray_harbor.low_tide_street',
  ludo: 'gray_harbor.docks',
}

export const PLACE_TAGS: Readonly<Partial<Record<PlaceId, readonly Tag[]>>> = {
  'gray_harbor.docks': ['室外', '水上'],
  'gray_harbor.seven_lamps': ['室内'],
  'gray_harbor.council_hall': ['室内'],
  'gray_harbor.low_tide_street': ['室外'],
  'gray_harbor.copper_tower': ['室内'],
  'gray_harbor.silver_tongue_auction': ['室内'],
  'gray_harbor.tide_well': ['地下'],
}

/** People who can be met: alive, free and not erased. */
const AWAY = new Set(['dead', 'erased', 'captive', 'missing'])

export function presentAt(s: Snapshot, place: PlaceId | null): NpcId[] {
  if (!place) return []
  return (Object.entries(HOME) as [NpcId, PlaceId][]).filter(([id, home]) => home === place && !AWAY.has(npcStateOf(s, id))).map(([id]) => id)
}

export const placeName = (id: PlaceId) => VOCAB.places.find((p) => p.id === id)?.name ?? id
export const npcName = (id: string) => VOCAB.npcs.find((n) => n.id === id)?.name ?? id
export const shortName = (id: string) => {
  const n = VOCAB.npcs.find((x) => x.id === id) as { name: string; aliases?: readonly string[] } | undefined
  return n?.aliases?.[0] ?? n?.name ?? id
}

const BEATS: readonly BeatId[] = ['cause', 'discovery', 'turn', 'choice']

/** The core adventure's next beat to play: the one after the furthest reached, or null once resolved. */
export function nextBeat(s: Snapshot): BeatId | null {
  const arc = s.arcs.gray_well
  if (arc?.outcomes) return null
  const reached = (arc?.beats ?? []).map((b) => BEATS.indexOf(b)).filter((i) => i >= 0)
  const furthest = reached.length ? Math.max(...reached) : -1
  return BEATS[Math.min(furthest + 1, BEATS.length - 1)]
}

/** Rounds per stretch of the day; four stretches make one day. */
export const ROUNDS_PER_STRETCH = 3
const TIMES = ['黄昏', '夜', '黎明', '白天'] as const
const WEATHER = ['雨', '雨', '雾', '晴', '风暴'] as const

/** The ambience for `round`: the run opens on a rainy dusk (GEN-BEAT-01) and moves on every few rounds. */
export function ambienceFor(seed: string, round: number) {
  const stretch = Math.floor((round - 1) / ROUNDS_PER_STRETCH)
  const time = TIMES[stretch % TIMES.length]
  const day = Math.floor(stretch / TIMES.length)
  const weather = stretch === 0 ? '雨' : WEATHER[Math.floor(rngFor(seed, `weather:${day}`)() * WEATHER.length)]
  return { time, weather } as const
}

/** `ambience_changed` when the round moves into a new stretch of the day. */
export function ambienceDrafts(s: Snapshot): AnyDraft[] {
  const a = ambienceFor(s.seed, Math.max(1, s.round))
  if (s.ambience?.time === a.time && s.ambience.weather === a.weather) return []
  return [draft('ambience_changed', a)]
}

/** The scene context the table passes to text selection and the AI. */
export function sceneContext(s: Snapshot, extra: { readonly tags?: readonly Tag[]; readonly present?: readonly ActorId[]; readonly vars?: SceneContext['vars'] } = {}): SceneContext {
  const place = s.location?.placeId ?? null
  const present = [...new Set([...presentAt(s, place), ...(extra.present ?? [])])]
  const beat = nextBeat(s)
  return {
    tags: [...(place ? (PLACE_TAGS[place] ?? []) : []), ...(extra.tags ?? [])],
    present,
    vars: { arc: 'gray_well', ...(beat ? { beat } : {}), banquet_guests_available: BANQUET_GUESTS, ...extra.vars },
  }
}

/** v1 keeps all three banquet guests in Grayport; nothing in the slice removes them. */
export const BANQUET_GUESTS = 3

/** The invitation names a day; the banquet is on from the next round until the party attends. */
export function banquetDrafts(s: Snapshot): AnyDraft[] {
  const shown = s.texts['GH-SCN-10']
  if (s.objects.tower_banquet !== 'scheduled' || !shown || shown.lastRound >= s.round) return []
  return [draft('object_state_changed', { objectId: 'tower_banquet', state: 'tonight' })]
}
