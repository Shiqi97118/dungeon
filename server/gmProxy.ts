import type { GameState, Stat, Tier } from '../src/game/types.js'
import { SCENES } from '../src/game/data/scenes.js'
import { HttpError, assertSameSite, fail, json, readJson } from './http.js'
import { platform } from './platform.js'
import { serverGm } from './gm.js'
import { cleanTurnRequest, iselanModel, iselanModelId, iselanTurn, type IselanModel } from './iselanTurn.js'
import { spendGlobalAi } from './rooms.js'
import { guarded, type CallKind } from './budget.js'
import { gmEndpoint } from './gm.js'
import { CONFIG } from '../src/iselan/config.js'

const DAILY_LIMIT = 200
const IP_DAILY_LIMIT = 300
const STATS: Stat[] = ['str', 'dex', 'ins', 'soc']
const TIERS: Tier[] = ['hit', 'partial', 'miss']

function cleanState(raw: unknown): GameState {
  const s = raw as GameState
  if (!s || typeof s !== 'object' || !Array.isArray(s.party) || s.party.length < 1 || s.party.length > 4) throw new HttpError(400, '存档格式错误')
  if (!SCENES[s.location] || !Array.isArray(s.clues) || !Array.isArray(s.log) || !s.npcs || !s.flags) throw new HttpError(400, '存档格式错误')
  return { ...s, log: s.log.slice(-30) }
}

const text = (v: unknown, max: number) => {
  const t = typeof v === 'string' ? v.trim().slice(0, max) : ''
  if (!t) throw new HttpError(400, '缺少行动描述')
  return t
}

export async function handleGm(request: Request): Promise<Response> {
  try {
    const p = platform()
    const ident = await p.viewer(request)
    if (ident instanceof Response) return ident
    const gm = serverGm()
    const budget = p.budget?.() ?? null
    if (request.method === 'GET') return json({ available: !!gm, iselan: !!iselanModel() && !!p.profiles?.() && !!budget })
    if (request.method !== 'POST') return json({ error: '不支持的请求' }, 405)
    assertSameSite(request)
    const store = p.store()
    const body = await readJson(request, 300_000)
    const out = () => new HttpError(429, '今天的 AI 主持次数已用完，已切换为离线规则')
    const spend = async () => {
      if (!store) throw new HttpError(503, '内置 AI 主持人暂不可用')
      if (!(await store.useQuota(ident.stage, ident.sub, DAILY_LIMIT))) throw out()
      if (ident.open && !(await store.useQuota(ident.stage, `gm-ip:${ident.ip ?? 'unknown'}`, IP_DAILY_LIMIT))) throw out()
      if (!(await spendGlobalAi(store, ident))) throw out()
    }

    if (body.op === 'iselan_turn') {
      const model = iselanModel()
      const modelId = iselanModelId()
      const receipts = p.profiles?.()
      if (!model || !modelId) throw new HttpError(503, '内置 AI 主持人未配置')
      if (!receipts || !budget) throw new HttpError(503, '内置 AI 主持人暂不可用')
      const req = cleanTurnRequest(body)
      const limits = CONFIG.cost.dailyLimits
      const counts = [
        { key: `user:${ident.sub}`, limit: limits.user },
        ...(ident.open ? [{ key: `ip:${ident.ip ?? 'unknown'}`, limit: limits.ip }] : []),
        { key: `room:${req.runId}`, limit: limits.room },
      ]
      const metered: IselanModel = (r) =>
        guarded(budget, { stage: ident.stage, kind: 'turn', model: modelId, now: Date.now(), counts }, async () => {
          const reply = await model(r)
          return { value: reply, usage: reply.usage }
        })
      const { seq, text } = await iselanTurn(metered, receipts, req, Date.now())
      return json({ seq, text })
    }

    if (!gm) throw new HttpError(503, '内置 AI 主持人未配置')
    const state = cleanState(body.state)
    await spend()
    // The legacy host shares the key, so it shares the 28 元 cap. It reports no usage, so each call is booked at its estimate.
    if (!budget && ident.open) throw new HttpError(503, '内置 AI 主持人暂不可用')
    const legacyModel = gmEndpoint(process.env.OPENAI_API_KEY?.trim() ?? '', process.env.GM_BASE_URL, process.env.GM_MODEL).model
    const metered = <T,>(kind: CallKind, run: () => Promise<T>): Promise<T> =>
      budget
        ? guarded(budget, { stage: ident.stage, kind, model: legacyModel, now: Date.now(), counts: [] }, async () => ({ value: await run(), usage: null }))
        : run()

    if (body.op === 'propose') {
      const said = text(body.text, 200)
      return json(await metered('turn', () => gm.propose(state, said, typeof body.actorName === 'string' ? body.actorName.slice(0, 12) : undefined)))
    }
    if (body.op === 'resolve') {
      const r = (body.r ?? {}) as Record<string, unknown>
      const dice = Array.isArray(r.dice) ? [Number(r.dice[0]) || 1, Number(r.dice[1]) || 1] as [number, number] : [1, 1] as [number, number]
      const said = text(body.text, 200)
      return json(await metered('turn', () => gm.resolve(state, said, {
        actorName: String(r.actorName ?? '').slice(0, 12),
        stat: STATS.includes(r.stat as Stat) ? (r.stat as Stat) : 'ins',
        dice,
        total: Number(r.total) || 0,
        tier: TIERS.includes(r.tier as Tier) ? (r.tier as Tier) : 'partial',
        risk: String(r.risk ?? '').slice(0, 120),
      })))
    }
    if (body.op === 'ending') {
      const tier = TIERS.includes(body.tier as Tier) ? (body.tier as Tier) : 'partial'
      const plan = text(body.plan, 300)
      return json({ paragraphs: await metered('ending', () => gm.ending(state, plan, tier)) })
    }
    throw new HttpError(400, '未知操作')
  } catch (e) {
    if (e instanceof Response) return e
    return fail(e)
  }
}
