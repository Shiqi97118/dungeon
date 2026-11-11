// Shapes emitted by docs/story/tools/check-texts.mjs (grammar: docs/story/12-开工规格.md §3).
// texts.generated.ts is type-checked against these, so a change to the compiler that is
// not mirrored here fails the build.
import type {
  ActorId,
  DarkLineId,
  DarkLineStateId,
  DirectionId,
  EvidenceId,
  FactId,
  FactionId,
  FactionStateId,
  InteractionId,
  NpcStateId,
  ObjectId,
  ObjectStateId,
  PlaceId,
  RegionId,
  Tag,
  TextKind,
  VariableId,
} from './vocab.generated'

export type Op = 'eq' | 'ne' | 'ge' | 'le' | 'gt' | 'lt'
export type Presence = 'present' | 'absent' | 'in_party' | 'met'

export type Atom =
  | { readonly tag: Tag }
  | { readonly fact: FactId; readonly op: Op; readonly value: true }
  | { readonly npc: ActorId; readonly presence: Presence }
  | { readonly faction: FactionId; readonly presence: Exclude<Presence, 'met'> }
  | { readonly var: VariableId; readonly op: Op; readonly value: number | string }
  | { readonly darkLine: DarkLineId; readonly op: Op; readonly value: DarkLineStateId }
  | { readonly faction: FactionId; readonly op: Op; readonly value: FactionStateId }
  | { readonly object: ObjectId; readonly op: Op; readonly value: ObjectStateId }
  | { readonly npc: ActorId; readonly op: Op; readonly state: NpcStateId }
  | { readonly attitude: ActorId | '*'; readonly op: Op; readonly value: number }
  | { readonly relation: FactionId | '*'; readonly op: Op; readonly value: number }
  | { readonly npc: ActorId; readonly whereOp: Op; readonly place: PlaceId | RegionId }

export type Cond = Atom | { readonly any: readonly Atom[] }

export interface Soft {
  readonly when: Cond
  readonly weight: number
}

/** "before": settled by the action before the text is shown; "after": written once shown (12 §3.4). */
export type EffectPhase = 'before' | 'after'

export type Effect = { readonly phase: EffectPhase } & (
  | Atom
  | { readonly impression: ActorId; readonly text: string }
  | { readonly contact: FactionId }
  | { readonly evidence: EvidenceId; readonly darkLine: DarkLineId }
  | { readonly npc: ActorId; readonly towards: ActorId; readonly value: number }
  | { readonly direction: DirectionId; readonly delta: number }
  | { readonly relation: FactionId; readonly delta: number }
  | { readonly attitude: ActorId; readonly delta: number }
  | { readonly var: 'hunger'; readonly delta: number }
)

export interface Trigger {
  readonly requires: readonly Cond[]
  readonly soft: readonly Soft[]
  readonly forbids?: readonly Cond[]
  readonly knows?: readonly Cond[]
  readonly effects?: readonly Effect[]
}

export interface DialogueLine extends Trigger {
  readonly id: string
  readonly label: string
  readonly key: boolean
  readonly text: string
}

export interface CompiledText extends Partial<Trigger> {
  readonly id: string
  readonly kind: TextKind
  readonly title: string
  readonly file: string
  readonly line: number
  readonly body: readonly string[]
  readonly images: readonly string[]
  readonly interaction?: InteractionId | null
  readonly shared?: string
  readonly note?: string
  readonly fallback?: boolean
  /** Paragraph number (1-based, as written in the text file) -> extra conditions. */
  readonly lineKnows?: Readonly<Record<string, readonly Cond[]>>
  readonly speaker?: ActorId
  readonly lines?: readonly DialogueLine[]
}