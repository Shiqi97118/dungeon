import { useEffect, useReducer, useRef } from 'react'
import { InteractionRejected, openSession, reduceSession, type InteractionRequest, type InteractionResult } from '../../iselan/interaction'

export type Settler = (req: InteractionRequest) => Promise<InteractionResult>

export const STALLED = '结算没有回音：可能已经记下，也可能没有。重试会沿用同一个请求，不会记两次。'

/**
 * Owns the session for one interaction instance. Keep it mounted above the modal so closing the
 * modal mid-request neither drops the request nor loses the result.
 */
export function useInteraction(instanceId: string, initial: InteractionResult | null, settle: Settler, timeoutMs = 8000) {
  const [s, dispatch] = useReducer(reduceSession, null, () => openSession(instanceId, initial))
  const sent = useRef('')

  useEffect(() => {
    if (s.phase !== 'submitting' || !s.request) return
    const key = `${s.request.requestId}@${s.attempts}`
    if (sent.current === key) return
    sent.current = key
    const { requestId } = s.request
    const attempt = s.attempts
    // Never cleared: a stale timer is ignored by the reducer once the attempt has moved on.
    setTimeout(() => dispatch({ type: 'stall', requestId, attempt, error: STALLED }), timeoutMs)
    settle(s.request).then(
      (result) => dispatch({ type: 'settle', requestId, result }),
      (e: unknown) =>
        dispatch(e instanceof InteractionRejected ? { type: 'reject', requestId, error: e.message } : { type: 'stall', requestId, attempt, error: STALLED }),
    )
  }, [s.phase, s.request, s.attempts, settle, timeoutMs])

  return [s, dispatch] as const
}
