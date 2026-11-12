import { HttpError, assertSameSite, fail, json, readJson } from './http.js'
import { platform } from './platform.js'
import { cleanTurnRequest, iselanModel, iselanModelId, iselanTurn, type IselanModel } from './iselanTurn.js'
import { guarded } from './budget.js'
import { CONFIG } from '../src/iselan/config.js'
import { estimateTokens } from '../src/iselan/ai/tokens.js'

export async function handleGm(request: Request): Promise<Response> {
  try {
    const p = platform()
    const ident = await p.viewer(request)
    if (ident instanceof Response) return ident
    const budget = p.budget?.() ?? null
    if (request.method === 'GET') return json({ available: !!iselanModel() && !!p.profiles?.() && !!budget })
    if (request.method !== 'POST') return json({ error: '不支持的请求' }, 405)
    assertSameSite(request)
    const body = await readJson(request, 300_000)

    if (body.op === 'iselan_turn' || body.op === 'iselan_ending') {
      const kind = body.op === 'iselan_ending' ? 'ending' : 'turn'
      const model = iselanModel(kind)
      const modelId = iselanModelId(kind)
      const receipts = p.profiles?.()
      if (!model || !modelId) throw new HttpError(503, '内置 AI 主持人未配置')
      if (!receipts || !budget) throw new HttpError(503, '内置 AI 主持人暂不可用')
      const req = cleanTurnRequest(body, kind)
      const limits = CONFIG.cost.dailyLimits
      const counts = [
        { key: `user:${ident.sub}`, limit: limits.user },
        ...(ident.open ? [{ key: `ip:${ident.ip ?? 'unknown'}`, limit: limits.ip }] : []),
        { key: `room:${req.runId}`, limit: limits.room },
      ]
      const metered: IselanModel = (r) =>
        guarded(budget, { stage: ident.stage, kind, model: modelId, now: Date.now(), counts, inputTokens: estimateTokens(r.system) + estimateTokens(r.content) }, async () => {
          const reply = await model(r)
          return { value: reply, usage: reply.usage }
        })
      const { seq, text } = await iselanTurn(metered, receipts, req, Date.now(), kind)
      return json({ seq, text })
    }

    throw new HttpError(400, '未知操作')
  } catch (e) {
    if (e instanceof Response) return e
    return fail(e)
  }
}
