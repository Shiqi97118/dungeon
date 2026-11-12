import type { InteractionResult } from './settle'

export type InteractionAction = 'complete' | 'skip' | 'alternative'

/** One settlement request. Retries resend this object unchanged; `requestId` doubles as the ledger intent id. */
export interface InteractionRequest {
  readonly requestId: string
  readonly instanceId: string
  readonly action: InteractionAction
  /** Hotspot ids for `evidence`; `guest:gesture` tokens for `dialogue-gesture`. */
  readonly params: { readonly inspected: readonly string[] }
}

/**
 * `open`: the player may act. `submitting`: a request is in flight. `stalled`: it timed out or the
 * network failed, so it may or may not have settled; only a retry of the same request is allowed.
 * `settled`: the ledger holds the result and nothing more is sent.
 */
export type Phase = 'open' | 'submitting' | 'stalled' | 'settled'

export interface Session {
  readonly instanceId: string
  readonly phase: Phase
  readonly inspected: readonly string[]
  readonly zoomed: boolean
  readonly request: InteractionRequest | null
  readonly attempts: number
  readonly result: InteractionResult | null
  readonly resultOpen: boolean
  readonly error: string | null
  /** Bumped per fresh request so a definitively rejected request never shares an id with the next. */
  readonly tries: number
}

export type SessionMsg =
  | { readonly type: 'inspect'; readonly hotspotId: string }
  | { readonly type: 'choose'; readonly guestId: string; readonly gestureId: string }
  | { readonly type: 'zoom'; readonly on: boolean }
  | { readonly type: 'submit'; readonly action: InteractionAction }
  | { readonly type: 'stall'; readonly requestId: string; readonly attempt?: number; readonly error: string }
  | { readonly type: 'retry' }
  | { readonly type: 'reject'; readonly requestId: string; readonly error: string }
  | { readonly type: 'settle'; readonly requestId: string; readonly result: InteractionResult }
  | { readonly type: 'showResult'; readonly open: boolean }

export function openSession(instanceId: string, settled: InteractionResult | null = null): Session {
  return {
    instanceId,
    phase: settled ? 'settled' : 'open',
    inspected: settled?.inspected ?? [],
    zoomed: false,
    request: null,
    attempts: 0,
    result: settled,
    resultOpen: true,
    error: null,
    tries: 0,
  }
}

const busy = (s: Session) => s.phase === 'submitting' || s.phase === 'stalled'

/** Pure reducer; every message that does not fit the phase is ignored, which is what makes late or doubled callbacks harmless. */
export function reduceSession(s: Session, m: SessionMsg): Session {
  switch (m.type) {
    case 'inspect':
      if (s.phase !== 'open' || s.inspected.includes(m.hotspotId)) return s
      return { ...s, inspected: [...s.inspected, m.hotspotId] }
    case 'choose': {
      if (s.phase !== 'open') return s
      const token = `${m.guestId}:${m.gestureId}`
      if (s.inspected.includes(token)) return s
      return { ...s, inspected: [...s.inspected.filter((t) => !t.startsWith(`${m.guestId}:`)), token] }
    }
    case 'zoom':
      return s.phase === 'open' && s.zoomed !== m.on ? { ...s, zoomed: m.on } : s
    case 'submit': {
      if (s.phase !== 'open') return s
      const tries = s.tries + 1
      const request: InteractionRequest = {
        requestId: `${s.instanceId}#${tries}`,
        instanceId: s.instanceId,
        action: m.action,
        params: { inspected: m.action === 'skip' ? [] : [...s.inspected] },
      }
      return { ...s, phase: 'submitting', request, attempts: 1, error: null, tries }
    }
    case 'stall':
      if (s.phase !== 'submitting' || s.request?.requestId !== m.requestId || (m.attempt !== undefined && m.attempt !== s.attempts)) return s
      return { ...s, phase: 'stalled', error: m.error }
    case 'retry':
      return s.phase === 'stalled' && s.request ? { ...s, phase: 'submitting', attempts: s.attempts + 1, error: null } : s
    case 'reject':
      if (!busy(s) || s.request?.requestId !== m.requestId) return s
      return { ...s, phase: 'open', request: null, attempts: 0, error: m.error }
    case 'settle':
      if (s.phase === 'settled' || s.request?.requestId !== m.requestId) return s
      return { ...s, phase: 'settled', result: m.result, resultOpen: true, error: null }
    case 'showResult':
      return s.phase === 'settled' && s.resultOpen !== m.open ? { ...s, resultOpen: m.open } : s
  }
}

export const isBusy = busy
