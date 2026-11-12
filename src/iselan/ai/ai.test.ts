import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import { draft, reduceEvents, stableStringify, verifyLog } from '../events'
import { choiceDraft } from '../rules/choices'
import { endingCandidates } from '../rules/directions'
import { TestRun } from '../rules/testRun'
import { selectFor } from '../texts'
import {
  buildTurnContext, clipProposals, clipToTokens, defaultAllowlist, estimateTokens, fakeModel, FIXED_PREFIX, ModelUnavailable,
  parseReply, runAiTurn, type Allowlist, type ModelCall, type TurnInput,
} from '.'

const CTX = { present: ['felix'] as const, inParty: ['helan'] as const }
const harbor = () => new TestRun().commit([draft('location_changed', { regionId: 'gray_harbor', placeId: 'none' })])
const input = (over: Partial<TurnInput> = {}): TurnInput => ({ actorId: 'helan', actorName: '赫兰', text: '问费利克斯昨晚码头的事', ctx: CTX, ...over })
const reply = (o: Record<string, unknown> = {}) =>
  JSON.stringify({ narration: '雨'.repeat(130) + '。', intents: ['交谈'], emotion: '谨慎', suggestions: ['甲', '乙', '丙'], proposals: [], ...o })

describe('token estimate (12 §8.1)', () => {
  it('counts each Chinese character as one token and other text at a third', () => {
    expect(estimateTokens('灰港')).toBe(2)
    expect(estimateTokens('abcdef')).toBe(2)
    expect(estimateTokens(clipToTokens('雨'.repeat(100), 10))).toBeLessThanOrEqual(10)
  })

  it('keeps the fixed prefix within its budget', () => {
    expect(estimateTokens(FIXED_PREFIX)).toBeLessThanOrEqual(CONFIG.ai.fixedPrefixTokens)
  })
})

describe('round content (12 §8.1)', () => {
  it('fits the round budget by trimming the least important sections and keeps the required ones', () => {
    const s = new TestRun().s
    const recent = Array.from({ length: 40 }, (_, i) => `第 ${i} 轮：${'很长的记录'.repeat(200)}`)
    const c = buildTurnContext(s, input({ recent, storyLines: Array.from({ length: 50 }, () => '故事'.repeat(80)) }))
    expect(c.tokens).toBeLessThanOrEqual(CONFIG.ai.roundTokenBudget)
    expect(c.trimmed).toContain('最近几轮')
    for (const title of ['局势', '允许的编号', '当前行动者', '玩家意图原文']) expect(c.content).toContain(`【${title}`)
    expect(c.content).toContain('问费利克斯昨晚码头的事')
  })

  it('describes the clock only in words and sends at most six past rounds', () => {
    const run = new TestRun().setClock(7)
    const c = buildTurnContext(run.s, input({ recent: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'] }))
    expect(c.content).not.toMatch(/时钟|clock|\b7\b/)
    expect(c.content).not.toContain('r2')
    expect(c.content).toContain('r8')
  })

  it('caps the player text at 200 characters', () => {
    const c = buildTurnContext(new TestRun().s, input({ text: '说'.repeat(500) }))
    expect(c.content).toContain('说'.repeat(200))
    expect(c.content).not.toContain('说'.repeat(201))
  })

  it('lists only present people who are not dead or erased', () => {
    const run = new TestRun().commit([draft('npc_state_changed', { npcId: 'felix', state: 'dead' })])
    expect(defaultAllowlist(run.s, CTX).npcs).not.toContain('felix')
    expect(defaultAllowlist(new TestRun().s, CTX).npcs).toContain('felix')
  })
})

describe('reply parsing (12 §8.2)', () => {
  it('reads JSON inside a code fence and drops tags outside the vocabulary', () => {
    const r = parseReply('好的：\n```json\n' + reply({ intents: ['交谈', '飞行', '调查', '交易'], emotion: '狂喜' }) + '\n```')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.reply.intents).toEqual(['交谈', '调查'])
    expect(r.reply.emotion).toBeNull()
    expect(r.notes).toContain('丢弃了词表外的意图')
  })

  it('cuts long narration back to a sentence end within the limit', () => {
    const r = parseReply(reply({ narration: '码头上的雨下个不停。'.repeat(40) }))
    expect(r.ok && [...r.reply.narration].length).toBeLessThanOrEqual(CONFIG.narrationChars.max)
    expect(r.ok && r.reply.narration.endsWith('。')).toBe(true)
  })

  it('rejects text that is not a JSON object with narration', () => {
    expect(parseReply('我不知道').ok).toBe(false)
    expect(parseReply('{"intents": []}').ok).toBe(false)
  })
})

describe('proposal clipping (12 §8.3)', () => {
  const s = harbor().s
  const allow: Allowlist = defaultAllowlist(s, CTX)

  it('clips attitude changes to ±1, or ±2 for a major event, and drops people outside the scene', () => {
    const r = clipProposals(s, [
      { kind: 'attitude', npcId: 'felix', delta: 5 },
      { kind: 'attitude', npcId: 'felix', delta: 1 },
      { kind: 'attitude', npcId: 'astrion', delta: 1 },
    ], allow)
    expect(r.drafts).toEqual([draft('npc_attitude_changed', { npcId: 'felix', towardsId: 'party', delta: 1, value: 1 })])
    expect(r.gaps).toHaveLength(2)
    const major = clipProposals(s, [{ kind: 'attitude', npcId: 'felix', delta: -9, major: true }], allow)
    expect(major.drafts[0]).toMatchObject({ payload: { delta: -2, value: -2 } })
  })

  it('never lets the AI move the clock, dark lines, deaths, the bell heart or the ending', () => {
    const kinds = ['clock', 'darkLine', 'death', 'erase', 'bellHeart', 'ending', 'achievement', 'door']
    const r = clipProposals(s, kinds.map((kind) => ({ kind, npcId: 'felix', delta: 3 })), allow)
    expect(r.drafts).toEqual([])
    expect(r.gaps).toHaveLength(kinds.length)
  })

  it('drops facts, evidence and directions outside the allowlist, and rule-owned facts', () => {
    const r = clipProposals(s, [
      { kind: 'fact', factId: 'astrion_sealed' },
      { kind: 'fact', factId: 'no_such_fact' },
      { kind: 'evidence', darkLineId: 'gray_well', evidenceId: 'made_up' },
      { kind: 'direction', directionId: 'D99', delta: 1 },
    ], allow)
    expect(allow.facts).not.toContain('astrion_sealed')
    expect(r.drafts).toEqual([])
    expect(r.gaps).toHaveLength(4)
  })

  it('clamps check difficulty, allows one check, and turns permanent consequences into consent requests', () => {
    const r = clipProposals(s, [
      { kind: 'check', skill: '观察', difficulty: 99, reason: '雾里看人' },
      { kind: 'check', skill: '力量', difficulty: 10 },
      { kind: 'consent', actorId: 'helan', consequence: 'death', detail: '留在井底' },
      { kind: 'consent', actorId: 'nobody', consequence: 'death' },
    ], allow)
    expect(r.checks).toEqual([{ skill: '观察', difficulty: 20, reason: '雾里看人' }])
    expect(r.consents).toEqual([{ actorId: 'helan', consequence: 'death', detail: '留在井底' }])
    expect(r.drafts).toEqual([])
    expect(r.gaps).toHaveLength(2)
  })

  it('creates projects only of known kinds and leaves new places out of the log', () => {
    const r = clipProposals(s, [
      { kind: 'project', projectId: 'p1', stage: 'idea', projectKind: 'tavern' },
      { kind: 'project', projectId: 'p2', stage: 'idea', projectKind: 'castle' },
      { kind: 'project', projectId: 'p1', stage: 'operational' },
      { kind: 'place', name: '不存在的塔', regionId: 'gray_harbor' },
    ], allow)
    expect(r.drafts.map((d) => d.type)).toContain('player_project_created')
    expect(r.gaps).toHaveLength(3)
  })

  it('every clipped draft commits through the real ledger', () => {
    const run = harbor()
    const r = clipProposals(run.s, [
      { kind: 'attitude', npcId: 'felix', delta: 1 },
      { kind: 'impression', npcId: 'felix', text: '一个在雨里也不撑伞的人' },
      ...(allow.facts.length ? [{ kind: 'fact', factId: allow.facts[0] }] : []),
      ...(allow.evidence.length ? [{ kind: 'evidence', ...allow.evidence[0] }] : []),
    ], defaultAllowlist(run.s, CTX))
    expect(() => run.settle(r.drafts)).not.toThrow()
    expect(verifyLog(run.runId, run.events)).toEqual([])
  })
})

describe('one AI turn (07 §1, 12 §8.3)', () => {
  it('retries once on broken output, then uses the next response', async () => {
    const r = await runAiTurn(new TestRun().s, input(), fakeModel({ script: ['这不是 JSON', reply()] }))
    expect(r.source).toBe('ai')
    expect(r.intentId).toBe('ai:2')
    expect(r.responses.map((x) => x.seq)).toEqual([1, 2])
    expect(r.gaps).toContain('AI 回应不是 JSON')
  })

  it('falls back to the offline host after two broken responses or when the model is unavailable', async () => {
    const s = new TestRun().s
    const broken = await runAiTurn(s, input(), fakeModel({ script: ['坏', '还是坏'] }))
    expect(broken.source).toBe('offline')
    expect(broken.intentId).toBeNull()
    expect(broken.responses).toHaveLength(2)
    expect(broken.reply.intents).toEqual(['交谈'])
    expect(broken.drafts).toEqual([])
    const down: ModelCall = async () => { throw new ModelUnavailable(429, '今天的 AI 主持次数已用完') }
    const quota = await runAiTurn(s, input(), down)
    expect(quota.source).toBe('offline')
    expect(quota.gaps[0]).toContain('429')
    expect((await runAiTurn(s, input(), null)).source).toBe('offline')
  })

  it('logs a gap when the narration names someone dead', async () => {
    const run = new TestRun().commit([draft('npc_state_changed', { npcId: 'felix', state: 'dead' })])
    const r = await runAiTurn(run.s, input(), fakeModel({ script: [reply({ narration: '菲利克斯从雨里走来，向你点头。'.repeat(9) })] }))
    expect(r.gaps.some((g) => g.includes('菲利克斯'))).toBe(true)
  })

  it('returns intent and emotion tags for choosing prewritten texts afterwards', async () => {
    const run = new TestRun()
    const r = await runAiTurn(run.s, input(), fakeModel({ script: [reply()] }))
    expect(r.tags).toEqual(['交谈', '谨慎'])
    expect(() => selectFor(run.s, 'action', { ctx: { ...CTX, tags: r.tags } })).not.toThrow()
  })
})

describe('a whole run with the fake AI (13 ENG-05)', () => {
  async function play(seed: string) {
    const run = new TestRun(undefined, seed).commit([draft('location_changed', { regionId: 'gray_harbor', placeId: 'none' })])
    const model = fakeModel({ seed, strayRate: 0.3 })
    const responses: { seq: number; text: string }[] = []
    let gaps = 0
    for (let turn = 1; turn <= 45; turn++) {
      if (turn % 3 === 1) run.round()
      const t = await runAiTurn(run.s, input({ text: `第 ${turn} 次：调查码头，再问问费利克斯` }), model)
      responses.push(...t.responses)
      gaps += t.gaps.length
      const choice = choiceDraft(run.s, {
        seatId: 's1', actorId: 'helan', kind: 'act', sceneId: `scene-${turn}`, target: 'felix', method: 'talk', drafts: t.drafts, settled: ['knowledge'],
      })
      run.settle([...t.drafts, ...(choice ? [choice] : [])], t.intentId ?? undefined)
    }
    const [directionId] = endingCandidates(run.s)
    if (directionId) run.commit([draft('ending_committed', { directionId, secondaryDirectionId: directionId, variant: 'none', worldResolution: 'unresolved' })])
    return { run, responses, gaps }
  }

  it('reaches an ending with no real API, a valid log and a replay that matches', async () => {
    const { run, responses, gaps } = await play('fake-1')
    expect(run.s.ending).not.toBeNull()
    expect(verifyLog(run.runId, run.events)).toEqual([])
    expect(stableStringify(reduceEvents(run.runId, run.events))).toBe(stableStringify(run.s))
    const aiIntents = new Set(run.events.map((e) => e.sourceIntentId).filter((id) => id.startsWith('ai:')))
    expect(aiIntents.size).toBeGreaterThan(30)
    for (const id of aiIntents) expect(responses.some((r) => `ai:${r.seq}` === id)).toBe(true)
    expect(gaps).toBeGreaterThan(0)
    const again = await play('fake-1')
    expect(stableStringify(again.run.events)).toBe(stableStringify(run.events))
  })
})
