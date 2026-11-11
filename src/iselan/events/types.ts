import type { EventPayloads, EventType, RegionId } from '../data'

export type Visibility = 'public' | 'party' | 'private'

/** Envelope from contracts/narrative.types.ts, with the payload typed by event type. */
export interface CanonicalEvent<T extends EventType = EventType> {
  readonly schemaVersion: 1
  readonly eventId: string
  readonly runId: string
  readonly seq: number
  readonly type: T
  readonly actorIds: readonly string[]
  readonly accountIds: readonly string[]
  readonly partyId: string | null
  readonly regionId?: RegionId
  readonly subjectId?: string
  readonly payload: EventPayloads[T]
  readonly sourceIntentId: string
  readonly committedAt: string
  readonly visibility: Visibility
}

/** Discriminated union over every event type, so `switch (e.type)` narrows the payload. */
export type AnyEvent = { [T in EventType]: CanonicalEvent<T> }[EventType]

/** What rules produce for one intent; the ledger fills in the envelope. */
export interface EventDraft<T extends EventType = EventType> {
  readonly type: T
  readonly payload: EventPayloads[T]
  readonly actorIds?: readonly string[]
  readonly regionId?: RegionId
  readonly subjectId?: string
  readonly visibility?: Visibility
}

export type AnyDraft = { [T in EventType]: EventDraft<T> }[EventType]

export function draft<T extends EventType>(type: T, payload: EventPayloads[T], extra: Omit<EventDraft<T>, 'type' | 'payload'> = {}): EventDraft<T> {
  return { type, payload, ...extra }
}
