import { rngFor } from '../rules/random'
import type { Allowlist } from './context'
import { guessIntents } from './offline'
import type { AiResponse, ModelCall } from './turn'

export interface FakeModelOptions {
  readonly seed?: string
  /** Raw replies returned in order before generated ones, e.g. broken JSON to test retries. */
  readonly script?: readonly string[]
  /** Probability per turn of one proposal with an id outside the allowlist, to exercise clipping. */
  readonly strayRate?: number
  /** Probability per first call that the reply asks only for a check. */
  readonly checkRate?: number
  /** Called with every response, as the server would write its receipt. */
  readonly onResponse?: (r: AiResponse) => void | Promise<void>
}

const EMOTIONS = ['谨慎', '鲁莽', '温柔', '愤怒', '悲伤', '幽默'] as const

function generate(seq: number, content: string, allow: Allowlist, o: FakeModelOptions): string {
  const rng = rngFor(o.seed ?? 'fake', seq)
  const intent = content.match(/【玩家意图原文】\n(.*)/)?.[1] ?? ''
  const actor = content.match(/【当前行动者】\n(.*?)（/)?.[1] ?? '你'
  const any = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]
  const proposals: Record<string, unknown>[] = []
  if (!content.includes('【检定结果】') && rng() < (o.checkRate ?? 0)) {
    return JSON.stringify({
      narration: `${actor}准备动手：${intent.slice(0, 40)}。成败还悬在半空，周围的人屏住了呼吸，雨声里只听得见自己的心跳。这一步走出去，就再难收回。`,
      intents: guessIntents(intent),
      emotion: any(EMOTIONS),
      suggestions: ['先看清局势再说', '找人帮一把', '换一种出人意料的做法'],
      proposals: [{ kind: 'check', skill: any(['强韧', '灵巧', '洞察', '交涉']), difficulty: 12, reason: '结果不确定' }],
    })
  }
  if (allow.npcs.length) {
    const npc = any(allow.npcs)
    proposals.push({ kind: 'attitude', npcId: npc, delta: rng() < 0.2 ? 5 : rng() < 0.6 ? 1 : -1, reason: '对这次行动的反应' })
    if (rng() < 0.3) proposals.push({ kind: 'impression', npcId: npc, text: `${actor}那天的举动` })
  }
  if (allow.factions.length && rng() < 0.3) proposals.push({ kind: 'relation', factionId: any(allow.factions), delta: rng() < 0.5 ? 1 : -1, reason: '消息传开' })
  if (allow.facts.length && rng() < 0.15) proposals.push({ kind: 'fact', factId: any(allow.facts), reason: '行动的结果' })
  if (allow.evidence.length && rng() < 0.15) {
    const e = any(allow.evidence)
    proposals.push({ kind: 'evidence', darkLineId: e.darkLineId, evidenceId: e.evidenceId, reason: '找到了' })
  }
  if (allow.directions.length && rng() < 0.3) proposals.push({ kind: 'direction', directionId: any(allow.directions), delta: 1, reason: '倾向' })
  if (rng() < (o.strayRate ?? 0.1)) proposals.push({ kind: any(['attitude', 'clock', 'fact']), npcId: 'astrion', factId: 'astrion_sealed', delta: 1 })
  const narration = `${actor}照自己的打算行动：${intent.slice(0, 40)}。雨水顺着屋檐落下，码头的灯一盏接一盏亮起，远处有人在讨价还价，也有人在低声说起最近的怪事。` +
    '这一番举动没有白费，周围的人看在眼里，各自记下了一笔。至于这会把事情引向哪里，现在还没人说得清，只是风向似乎微微变了。'
  return JSON.stringify({
    narration,
    intents: guessIntents(intent),
    emotion: any(EMOTIONS),
    suggestions: ['顺着刚才的线索追下去', '去找一个与此有关的人谈谈', '做一件出人意料的事'],
    proposals,
  })
}

/** 13 ENG-05: a repeatable stand-in for the model, so whole runs can be tested without the real API. */
export function fakeModel(o: FakeModelOptions = {}): ModelCall & { readonly calls: () => number } {
  let seq = 0
  const call = async ({ content, context }: Parameters<ModelCall>[0]) => {
    seq += 1
    const text = seq <= (o.script?.length ?? 0) ? o.script![seq - 1] : generate(seq, content, context.allow, o)
    const r = { seq, text }
    await o.onResponse?.(r)
    return r
  }
  return Object.assign(call, { calls: () => seq })
}
