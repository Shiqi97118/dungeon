import type { Boost, CostId, GameState, RollKind, Stat, Tier } from './types.js'
import { STAT_NAMES } from './types.js'
import { activeChar, reduce, tierOf, type GameAction } from './engine.js'
import { getChar } from './fx.js'
import { aiEnding, aiPropose, aiResolve, type AiConfig, type AiTurn } from './ai.js'

export type Intent =
  | { t: 'perform'; id: string }
  | { t: 'rollStart'; kind: RollKind; id?: string; actorId: string; boost: Boost; stat?: Stat; specOn?: boolean }
  | { t: 'rollReroll' }
  | { t: 'rollCommit' }
  | { t: 'rollReqCancel' }
  | { t: 'pass' }
  | { t: 'free'; text: string }
  | { t: 'customFinal'; plan: string }
  | { t: 'cost'; choice: CostId | 'soften' }
  | { t: 'overflow'; option: 'out' | 'item' | 'apart' | 'status' }
  | { t: 'memory'; charId: string; text: string }
  | { t: 'bells'; success: boolean; mistakes: number }
  | { t: 'volunteer'; who: string; text: string }
  | { t: 'deliver'; variant: 'oversight' | 'split' | 'hide' }
  | { t: 'dismissQueue' }
  | { t: 'takeaways'; takeaways: Record<string, string> }

export interface Gm {
  propose(s: GameState, text: string, actorName?: string): Promise<AiTurn>
  resolve(s: GameState, text: string, r: { actorName: string; stat: Stat; dice: [number, number]; total: number; tier: Tier; risk: string }): Promise<AiTurn>
  ending(s: GameState, plan: string, tier: Tier): Promise<string[]>
}

export function configGm(cfg: AiConfig): Gm {
  return {
    propose: (s, text, actorName) => aiPropose(cfg, s, text, actorName),
    resolve: (s, text, r) => aiResolve(cfg, s, text, r),
    ending: (s, plan, tier) => aiEnding(cfg, s, plan, tier),
  }
}

export function guessStat(text: string): Stat {
  if (/[说问劝谈骗哄安抚商量交易威胁求承诺告诉解释]/.test(text)) return 'soc'
  if (/[推撬搬扛砸打拉拖撞挡举爬攀抗]/.test(text)) return 'str'
  if (/[潜躲偷溜跳闪藏摸快绕]/.test(text)) return 'dex'
  return 'ins'
}

const FREE_RISK = '失败会让局势变复杂：承压、回声压力上升、失去物品，或陷入不利状态。'
const FINAL_RISK = '方案可能只实现一半，代价会更沉重——但这不会是团灭。'

/** Which character's controller may submit this intent right now; null means any seated player. */
export function intentOwner(s: GameState, i: Intent): string | null {
  const p = s.queue[0]
  switch (i.t) {
    case 'rollReroll':
    case 'rollCommit':
      return s.rolling?.actorId ?? null
    case 'cost':
      return p?.type === 'cost' ? p.actorId : null
    case 'overflow':
      return p?.type === 'overflow' ? p.charId : null
    case 'rollStart':
      return i.actorId
    case 'takeaways':
      return null
    default:
      return s.turns?.activeId ?? null
  }
}

function toAction(i: Intent): GameAction | null {
  switch (i.t) {
    case 'perform': return { type: 'perform', id: i.id }
    case 'rollStart': return { type: 'rollStart', kind: i.kind, id: i.id, actorId: i.actorId, boost: i.boost, stat: i.stat, specOn: i.specOn }
    case 'rollReroll': return { type: 'rollReroll' }
    case 'rollCommit': return { type: 'rollCommit' }
    case 'rollReqCancel': return { type: 'rollReqCancel' }
    case 'pass': return { type: 'pass' }
    case 'cost': return { type: 'cost', choice: i.choice }
    case 'overflow': return { type: 'overflow', option: i.option }
    case 'memory': return { type: 'memory', charId: i.charId, text: i.text }
    case 'bells': return { type: 'bells', success: i.success, mistakes: i.mistakes }
    case 'volunteer': return { type: 'volunteer', who: i.who, text: i.text }
    case 'deliver': return { type: 'deliver', variant: i.variant }
    case 'dismissQueue': return { type: 'dismissQueue' }
    case 'takeaways': return { type: 'takeaways', takeaways: i.takeaways }
    default: return null
  }
}

export interface RunResult { state: GameState; error?: string; aiCalls: number }

export interface RunHooks {
  interim?: (s: GameState) => Promise<void> | void
}

const errText = (e: unknown) => String((e as Error)?.message ?? e)

export async function runIntent(s: GameState, i: Intent, gm: Gm | null, hooks: RunHooks = {}): Promise<RunResult> {
  if (i.t === 'free') {
    const text = i.text.trim().slice(0, 200)
    if (!text || s.queue.length || s.rolling || s.rollReq || s.phase !== 'play') return { state: s, aiCalls: 0 }
    const actor = activeChar(s)
    let error: string | undefined
    if (gm) {
      try {
        await hooks.interim?.(reduce(s, { type: 'thinking', text }))
        const t = await gm.propose(s, text, actor?.name)
        if (t.roll) {
          const actorId = actor?.id ?? (getChar(s, t.roll.actorId) ? t.roll.actorId : undefined)
          return {
            aiCalls: 1,
            state: reduce(s, {
              type: 'ai', actorText: text, actorName: actor?.name, narration: t.narration,
              thenRoll: { kind: 'ai', title: text, text, stat: t.roll.stat, risk: t.roll.risk || '局势可能变得复杂。', statChoosable: false, cancellable: false, actorId },
            }),
          }
        }
        return { aiCalls: 1, state: reduce(s, { type: 'ai', actorText: text, actorName: actor?.name, narration: t.narration, effects: t.effects }) }
      } catch (e) {
        error = `${errText(e)}。已改用离线规则裁定。`
      }
    }
    return {
      aiCalls: gm ? 1 : 0, error,
      state: reduce(s, { type: 'rollReq', req: { kind: 'free', title: text, text, stat: guessStat(text), risk: FREE_RISK, statChoosable: true, cancellable: true, actorId: actor?.id } }),
    }
  }

  if (i.t === 'customFinal') {
    const plan = i.plan.trim().slice(0, 300)
    if (plan.length < 2 || s.location !== 'G' || s.queue.length || s.rolling || s.rollReq || s.phase !== 'play') return { state: s, aiCalls: 0 }
    return {
      aiCalls: 0,
      state: reduce(s, { type: 'rollReq', req: { kind: 'final', title: plan, text: plan, stat: guessStat(plan), risk: FINAL_RISK, statChoosable: true, cancellable: true, actorId: activeChar(s)?.id } }),
    }
  }

  if (i.t === 'rollCommit' && s.rolling && gm && (s.rolling.kind === 'ai' || s.rolling.kind === 'final')) {
    const r = s.rolling
    const total = r.dice[0] + r.dice[1] + r.mod
    const tier = tierOf(total)
    try {
      await hooks.interim?.(reduce(s, { type: 'thinking', text: r.text ?? r.title }))
      if (r.kind === 'ai') {
        const res = await gm.resolve(s, r.text ?? r.title, { actorName: getChar(s, r.actorId)?.name ?? '', stat: r.stat, dice: r.dice, total, tier, risk: r.risk })
        return { aiCalls: 1, state: reduce(s, { type: 'rollCommit', ai: { narration: res.narration, effects: res.effects } }) }
      }
      const paragraphs = await gm.ending(s, r.text ?? r.title, tier)
      return { aiCalls: 1, state: reduce(s, { type: 'rollCommit', paragraphs }) }
    } catch (e) {
      return { aiCalls: 1, error: `${errText(e)}。已改用离线规则裁定。`, state: reduce(s, { type: 'rollCommit' }) }
    }
  }

  const a = toAction(i)
  return { state: a ? reduce(s, a) : s, aiCalls: 0 }
}

const STATS = Object.keys(STAT_NAMES) as Stat[]
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

/** Parses untrusted JSON into an Intent, or null if it is malformed. */
export function parseIntent(raw: unknown): Intent | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  switch (o.t) {
    case 'perform': return { t: 'perform', id: str(o.id, 40) }
    case 'rollStart': {
      const kinds: RollKind[] = ['action', 'free', 'ai', 'final']
      if (!kinds.includes(o.kind as RollKind)) return null
      const b = (o.boost ?? {}) as Record<string, unknown>
      const boost: Boost = b.kind === 'item' ? { kind: 'item', item: str(b.item, 30) }
        : b.kind === 'help' ? { kind: 'help', id: str(b.id, 40) }
          : b.kind === 'joan' ? { kind: 'joan' } : { kind: 'none' }
      return {
        t: 'rollStart', kind: o.kind as RollKind, id: o.id ? str(o.id, 40) : undefined, actorId: str(o.actorId, 40), boost,
        stat: STATS.includes(o.stat as Stat) ? (o.stat as Stat) : undefined, specOn: o.specOn === true,
      }
    }
    case 'rollReroll': case 'rollCommit': case 'rollReqCancel': case 'pass': case 'dismissQueue':
      return { t: o.t }
    case 'free': return { t: 'free', text: str(o.text, 200) }
    case 'customFinal': return { t: 'customFinal', plan: str(o.plan, 300) }
    case 'cost': {
      const ok = ['stress', 'pressure', 'item', 'beast', 'helper', 'soften']
      return ok.includes(o.choice as string) ? { t: 'cost', choice: o.choice as CostId | 'soften' } : null
    }
    case 'overflow': return ['out', 'item', 'apart', 'status'].includes(o.option as string) ? { t: 'overflow', option: o.option as 'out' } : null
    case 'memory': return { t: 'memory', charId: str(o.charId, 40), text: str(o.text, 80) }
    case 'bells': return { t: 'bells', success: o.success === true, mistakes: Math.max(0, Math.min(20, Number(o.mistakes) || 0)) }
    case 'volunteer': return { t: 'volunteer', who: str(o.who, 40), text: str(o.text, 80) }
    case 'deliver': return ['oversight', 'split', 'hide'].includes(o.variant as string) ? { t: 'deliver', variant: o.variant as 'split' } : null
    case 'takeaways': {
      const src = (o.takeaways ?? {}) as Record<string, unknown>
      const out: Record<string, string> = {}
      for (const k of Object.keys(src).slice(0, 8)) out[str(k, 40)] = str(src[k], 80)
      return { t: 'takeaways', takeaways: out }
    }
    default: return null
  }
}
