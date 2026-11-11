import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runAiTurn, type ModelCall, type TurnInput } from '../src/iselan/ai/index.js'
import { draft } from '../src/iselan/events/index.js'
import { TestRun } from '../src/iselan/rules/testRun.js'
import { createSave, serializeSave, type SaveFile } from '../src/iselan/save.js'
import { handleGm } from './gmProxy.js'
import { anonymousViewer, setPlatform } from './platform.js'
import { configureProfileRules, handleProfile } from './profile.js'
import { MemoryProfileStore } from './profileStore.js'
import { setIselanModel, type IselanModel } from './iselanTurn.js'
import { MemoryStore } from './store.js'

type Json = Record<string, unknown>
const UID = 'device-turn-0123456789ab'
const RUN = 'run-iselan-turn-01'
const headers = { 'x-echo-client': '1', 'x-echo-uid': UID, 'content-type': 'application/json' }

async function post(handler: (r: Request) => Promise<Response>, path: string, body: Json) {
  const res = await handler(new Request(`http://localhost/${path}`, { method: 'POST', headers, body: JSON.stringify(body) }))
  return { status: res.status, data: (await res.json()) as Json }
}

const reply = (n: number) => JSON.stringify({
  narration: `第 ${n} 次：菲利克斯把酒杯推到你面前，压低声音说起昨夜码头上那艘不挂旗的船。雨声很大，他说得断断续续，但每一句都像是斟酌过的。`.repeat(2),
  intents: ['交谈'], emotion: '谨慎', suggestions: ['去码头', '找塞德里克', '偷偷上船'],
  proposals: [{ kind: 'attitude', npcId: 'felix', delta: 3, reason: '你请了他一杯' }],
})

/** The browser side: the same body `proxyModel` sends, straight into the handler. */
function viaServer(): ModelCall {
  let seq = 0
  return async ({ content }) => {
    const r = await post(handleGm, 'api/gm', { op: 'iselan_turn', runId: RUN, seq: ++seq, content })
    if (r.status !== 200) throw new Error(String(r.data.error))
    return r.data as unknown as { seq: number; text: string }
  }
}

const input: TurnInput = { actorId: 'helan', actorName: '哈兰', text: '请菲利克斯喝一杯，问他昨晚的事', ctx: { present: ['felix'], inParty: ['helan'] } }

async function play(turns: number): Promise<SaveFile> {
  const run = new TestRun().commit([draft('location_changed', { regionId: 'gray_harbor', placeId: 'none' })])
  const model = viaServer()
  const responses: { seq: number; text: string }[] = []
  for (let i = 0; i < turns; i++) {
    const t = await runAiTurn(run.s, input, model)
    responses.push(...t.responses)
    run.settle(t.drafts, {}, t.intentId ?? undefined)
  }
  run.commit([draft('ending_committed', { directionId: 'D07', secondaryDirectionId: 'D03', variant: 'none', worldResolution: 'resolved' })])
  const events = run.events.map((e) => ({ ...e, runId: RUN, eventId: `${RUN}:${e.seq}` }))
  return createSave({ runId: RUN, seed: 'seed-1', createdAt: '2026-11-11T00:00:00.000Z', events, aiResponses: responses })
}

describe('伊瑟兰 AI 回合与回执（12 §8.4）', () => {
  let calls: { system: string; content: string; maxTokens: number }[]
  beforeEach(() => {
    calls = []
    const profiles = new MemoryProfileStore()
    const store = new MemoryStore()
    setPlatform({ viewer: async (r) => anonymousViewer(r), store: () => store, profiles: () => profiles })
    const model: IselanModel = async (req) => {
      calls.push(req)
      return { text: reply(calls.length), model: 'fake', usage: null }
    }
    setIselanModel(model)
    configureProfileRules({ judge: (s, events) => (s.ending ? [{ achievementId: 'ACH-TEST', eventId: events.at(-1)!.eventId }] : []) })
  })
  afterEach(() => setIselanModel(undefined))

  it('sends the fixed prefix as the system prompt and the round content as the user turn', async () => {
    await play(1)
    expect(calls).toHaveLength(1)
    expect(calls[0].system).toContain('伊瑟兰')
    expect(calls[0].content).toContain('【玩家意图原文】')
    expect(calls[0].maxTokens).toBe(1200)
  })

  it('answers each (run, seq) once', async () => {
    const body = { op: 'iselan_turn', runId: RUN, seq: 1, content: '【玩家意图原文】\n看看' }
    expect((await post(handleGm, 'api/gm', body)).status).toBe(200)
    expect((await post(handleGm, 'api/gm', body)).status).toBe(409)
    expect((await post(handleGm, 'api/gm', { ...body, seq: 0 })).status).toBe(400)
    expect(calls).toHaveLength(1)
  })

  it('the clipped proposals come back within limits', async () => {
    const save = await play(1)
    const change = save.events.find((e) => e.type === 'npc_attitude_changed' && e.payload.npcId === 'felix')
    expect(change?.payload).toMatchObject({ npcId: 'felix', delta: 1, value: 1 })
    expect(change?.sourceIntentId).toBe('ai:1')
  })

  it('an untouched run uploads as verified, taking the responses from the save', async () => {
    const save = await play(3)
    const r = await post(handleProfile, 'api/profile', { op: 'upload_run', save: serializeSave(save) })
    expect(r.data).toMatchObject({ verified: true, unlocked: ['ACH-TEST'] })
  })

  it('a response edited after the fact no longer matches its receipt', async () => {
    const save = await play(3)
    const forged = { ...save, aiResponses: save.aiResponses!.map((x) => (x.seq === 2 ? { ...x, text: x.text.replace('"delta":3', '"delta":2') } : x)) }
    const r = await post(handleProfile, 'api/profile', { op: 'upload_run', save: serializeSave(forged) })
    expect(r.data).toMatchObject({ verified: false, reason: '第 2 条 AI 回应与回执不符', unlocked: [] })
  })

  it('dropping the response behind an AI intent is caught too', async () => {
    const save = await play(3)
    const r = await post(handleProfile, 'api/profile', { op: 'upload_run', save: serializeSave({ ...save, aiResponses: save.aiResponses!.filter((x) => x.seq !== 3) }) })
    expect(r.data).toMatchObject({ verified: false, unlocked: [] })
    expect(String(r.data.reason)).toContain('第 3 条 AI 回应')
  })

  it('reports 503 when no model is configured, so the client switches to the offline host', async () => {
    setIselanModel(null)
    expect((await post(handleGm, 'api/gm', { op: 'iselan_turn', runId: RUN, seq: 1, content: 'x' })).status).toBe(503)
  })
})
