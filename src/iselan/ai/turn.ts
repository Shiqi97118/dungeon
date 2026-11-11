import { CONFIG } from '../config'
import type { Tag } from '../data'
import { VOCAB } from '../data'
import type { AnyDraft, Snapshot } from '../events'
import { npcStateOf } from '../rules/conditions'
import { buildTurnContext, type TurnContext, type TurnInput } from './context'
import { FIXED_PREFIX } from './prefix'
import { offlineReply } from './offline'
import { clipProposals, type CheckRequest, type ClipOptions, type ConsentRequest } from './proposals'
import { parseReply, type Reply } from './reply'

/** One AI response as kept in the save for later upload (12 §8.4). */
export interface AiResponse {
  readonly seq: number
  readonly text: string
}

/** Thrown by a model call that could not get an answer (network, quota, missing key). */
export class ModelUnavailable extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Calls the model once. The server proxy numbers responses and writes their receipts; the fake does the same in memory. */
export type ModelCall = (req: { readonly prefix: string; readonly content: string; readonly context: TurnContext }) => Promise<AiResponse>

/** `sourceIntentId` of the intent built from AI response `seq`; upload checks every such intent has a receipt. */
export const aiIntentId = (seq: number) => `ai:${seq}`
export const AI_INTENT = /^ai:(\d+)$/

export interface TurnResult {
  readonly source: 'ai' | 'offline'
  /** Commit `drafts` under this id; null for an offline turn, whose id the caller picks. */
  readonly intentId: string | null
  readonly reply: Reply
  readonly drafts: AnyDraft[]
  readonly checks: readonly CheckRequest[]
  readonly consents: readonly ConsentRequest[]
  /** 12 §8.3: dropped proposals, format problems, people who should not appear. */
  readonly gaps: readonly string[]
  /** Every response received this turn, including ones that failed to parse; store them all in the save. */
  readonly responses: readonly AiResponse[]
  /** Intent and emotion tags for picking prewritten texts after the narration (09 §3.1). */
  readonly tags: readonly Tag[]
  readonly context: TurnContext
}

/** 12 §8.3 step 6: people who are dead or erased must not be narrated as present. */
function absentPeopleNamed(s: Snapshot, narration: string): string[] {
  return VOCAB.npcs
    .filter((n) => ['dead', 'erased'].includes(npcStateOf(s, n.id as keyof Snapshot['npcs'])))
    .filter((n) => [n.name, n.name.split('“')[0], ...((n as { aliases?: readonly string[] }).aliases ?? [])].some((name) => name && narration.includes(name)))
    .map((n) => `叙述提到了已死亡或被抹去的 ${n.name}，请核对是否以回声出场`)
}

/**
 * One AI-hosted action (07 §1, 12 §8): build the round content, call the model, retry once on
 * unparseable output, fall back to the offline host, then clip proposals into drafts. Nothing is
 * committed here; the caller settles the drafts with the rules in one transaction.
 */
export async function runAiTurn(s: Snapshot, input: TurnInput, model: ModelCall | null, options: ClipOptions = {}): Promise<TurnResult> {
  const context = buildTurnContext(s, input)
  const responses: AiResponse[] = []
  const gaps: string[] = []
  let parsed: { reply: Reply; seq: number } | null = null

  if (model) {
    for (let attempt = 0; attempt <= CONFIG.ai.parseRetries && !parsed; attempt++) {
      let res: AiResponse
      try {
        res = await model({ prefix: FIXED_PREFIX, content: context.content, context })
      } catch (e) {
        gaps.push(e instanceof ModelUnavailable ? `AI 不可用（${e.status}）：${e.message}` : 'AI 调用失败')
        break
      }
      responses.push(res)
      const r = parseReply(res.text)
      if (r.ok) {
        parsed = { reply: r.reply, seq: res.seq }
        gaps.push(...r.notes)
      } else {
        gaps.push(r.problem)
      }
    }
  }

  const reply = parsed?.reply ?? offlineReply(s, input)
  const clipped = parsed ? clipProposals(s, reply.proposals, context.allow, options) : { drafts: [], checks: [], consents: [], gaps: [] }
  return {
    source: parsed ? 'ai' : 'offline',
    intentId: parsed ? aiIntentId(parsed.seq) : null,
    reply,
    drafts: clipped.drafts,
    checks: clipped.checks,
    consents: clipped.consents,
    gaps: [...gaps, ...clipped.gaps, ...absentPeopleNamed(s, reply.narration)],
    responses,
    tags: [...reply.intents, ...(reply.emotion ? [reply.emotion] : [])],
    context,
  }
}
