import { ModelUnavailable, type AiResponse, type ModelCall } from '../iselan/ai'
import { ApiError, post } from './api'

/**
 * 12 §8: the built-in AI host for one run, through the app's own server so the key never leaves it.
 * Responses are numbered from after the last one already in the save; the server keeps a receipt for each.
 */
export function proxyModel(runId: string, saved: readonly AiResponse[] = []): ModelCall {
  let next = saved.reduce((m, r) => Math.max(m, r.seq), 0) + 1
  const ask = async (content: string, retried: boolean): Promise<AiResponse> => {
    const seq = next++
    try {
      return await post<AiResponse>('api/gm', { op: 'iselan_turn', runId, seq, content })
    } catch (e) {
      // 409: this number was used by a response that never reached the save (closed tab, lost reply).
      if (e instanceof ApiError && e.status === 409 && !retried) return ask(content, true)
      if (e instanceof ApiError) throw new ModelUnavailable(e.status, e.message)
      throw e
    }
  }
  return ({ content }) => ask(content, false)
}
