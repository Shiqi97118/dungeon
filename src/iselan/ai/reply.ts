import { CONFIG } from '../config'
import type { EmotionTag, IntentTag } from '../data'
import { VOCAB } from '../data'

/** A proposal as the AI wrote it; nothing here is trusted until `clipProposals` has checked it. */
export type RawProposal = Readonly<Record<string, unknown>> & { readonly kind: string }

/** 12 §8.2, after shape checks. */
export interface Reply {
  readonly narration: string
  readonly intents: readonly IntentTag[]
  readonly emotion: EmotionTag | null
  readonly suggestions: readonly string[]
  readonly proposals: readonly RawProposal[]
}

export type ParseResult = { readonly ok: true; readonly reply: Reply; readonly notes: readonly string[] } | { readonly ok: false; readonly problem: string }

const INTENTS: readonly string[] = VOCAB.tags.intent
const EMOTIONS: readonly string[] = VOCAB.tags.emotion
const SENTENCE_END = /[。！？…」”]/g

/** Long narration is cut back to the last sentence that fits, never mid-sentence when avoidable. */
function clipNarration(text: string): { text: string; note?: string } {
  const chars = [...text.trim()]
  if (chars.length <= CONFIG.narrationChars.max) {
    return chars.length < CONFIG.narrationChars.min ? { text: chars.join(''), note: `叙述只有 ${chars.length} 字` } : { text: chars.join('') }
  }
  const head = chars.slice(0, CONFIG.narrationChars.max).join('')
  let end = -1
  for (const m of head.matchAll(SENTENCE_END)) end = m.index + m[0].length
  return { text: end > 0 ? head.slice(0, end) : head, note: `叙述 ${chars.length} 字，已截到 ${CONFIG.narrationChars.max} 字以内` }
}

/** Finds the JSON object even when the model wraps it in prose or a code fence. */
function extractJson(raw: string): unknown {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('no object')
  return JSON.parse(raw.slice(start, end + 1))
}

export function parseReply(raw: string): ParseResult {
  let data: unknown
  try {
    data = extractJson(raw)
  } catch {
    return { ok: false, problem: 'AI 回应不是 JSON' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, problem: 'AI 回应不是 JSON 对象' }
  const j = data as Record<string, unknown>
  if (typeof j.narration !== 'string' || !j.narration.trim()) return { ok: false, problem: 'AI 回应缺少叙述' }

  const notes: string[] = []
  const narration = clipNarration(j.narration)
  if (narration.note) notes.push(narration.note)
  const intents = (Array.isArray(j.intents) ? j.intents : []).filter((x): x is IntentTag => INTENTS.includes(x as string))
  if (Array.isArray(j.intents) && intents.length < j.intents.length) notes.push('丢弃了词表外的意图')
  const emotion = EMOTIONS.includes(j.emotion as string) ? (j.emotion as EmotionTag) : null
  const suggestions = (Array.isArray(j.suggestions) ? j.suggestions : []).filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 60))
  if (suggestions.length !== CONFIG.ai.suggestionCount) notes.push(`建议 ${suggestions.length} 条，应为 ${CONFIG.ai.suggestionCount} 条`)
  const proposals = (Array.isArray(j.proposals) ? j.proposals : []).filter(
    (p): p is RawProposal => !!p && typeof p === 'object' && !Array.isArray(p) && typeof (p as { kind?: unknown }).kind === 'string',
  )
  return {
    ok: true,
    reply: {
      narration: narration.text,
      intents: [...new Set(intents)].slice(0, CONFIG.ai.maxIntents),
      emotion,
      suggestions: suggestions.slice(0, CONFIG.ai.suggestionCount),
      proposals,
    },
    notes,
  }
}
