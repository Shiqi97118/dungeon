import { ModelUnavailable, type AiResponse, type ModelCall } from '../iselan/ai'
import type { EndingCall } from '../iselan/play'
import { ApiError, post } from './api'

/**
 * 12 §8: the built-in AI host for one run, through the app's own server so the key never leaves it.
 * Turns and the ending share one numbering, continued from the last response already in the save;
 * the server keeps a receipt for each.
 */
export function proxyModels(runId: string, saved: readonly AiResponse[] = []): { readonly turn: ModelCall; readonly ending: EndingCall } {
  let next = saved.reduce((m, r) => Math.max(m, r.seq), 0) + 1
  const ask = async (op: 'iselan_turn' | 'iselan_ending', content: string, retried: boolean): Promise<AiResponse> => {
    const seq = next++
    try {
      return await post<AiResponse>('api/gm', { op, runId, seq, content })
    } catch (e) {
      // 409: this number was used by a response that never reached the save (closed tab, lost reply).
      if (e instanceof ApiError && e.status === 409 && !retried) return ask(op, content, true)
      if (e instanceof ApiError) throw new ModelUnavailable(e.status, e.message)
      throw e
    }
  }
  return {
    turn: ({ content }) => ask('iselan_turn', content, false),
    ending: ({ content }) => ask('iselan_ending', content, false),
  }
}
