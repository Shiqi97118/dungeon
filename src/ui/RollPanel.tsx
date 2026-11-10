import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActionDef, Boost, GameState, RollKind, RollSpec, Stat } from '../game/types'
import { STAT_NAMES, STAT_ORDER } from '../game/types'
import { TIER_LABEL, calcRoll, tierOf } from '../game/engine'
import { canAct as charCanAct } from '../game/conds'
import { sound } from '../audio/sound'
import { Die, Sigil, fmt } from './bits'

export interface RollSetupReq {
  kind: RollKind
  actionId?: string
  title: string
  spec: RollSpec
  statChoosable?: boolean
  fixedActor?: string
  cancellable: boolean
}

export interface RollStartPayload { kind: RollKind; id?: string; actorId: string; boost: Boost; stat?: Stat; specOn?: boolean }

const d6 = () => 1 + Math.floor(Math.random() * 6)

export function RollSetup({ state, req, onRoll, onCancel, busy }: {
  state: GameState
  req: RollSetupReq
  onRoll: (p: RollStartPayload) => void
  onCancel: () => void
  busy: boolean
}) {
  const free = req.kind !== 'action'
  const avail = state.party.filter((c) => charCanAct(c) && (!req.fixedActor || c.id === req.fixedActor))
  const [stat, setStat] = useState<Stat>(req.spec.stat)
  const pseudo: ActionDef = useMemo(() => ({ id: 'x', label: req.title, group: 'act', roll: { ...req.spec, stat } }), [req, stat])

  const bestActor = useMemo(() => {
    const scored = avail.map((c) => ({ c, t: calcRoll(state, pseudo, c, { kind: 'none' }).total }))
    scored.sort((a, b) => b.t - a.t)
    return scored[0]?.c.id
  }, [avail, pseudo, state])

  const [actorId, setActorId] = useState<string>(req.fixedActor ?? bestActor ?? state.party[0].id)
  const [boost, setBoost] = useState<Boost>({ kind: 'none' })
  const [specOn, setSpecOn] = useState(false)
  const actor = state.party.find((c) => c.id === actorId) ?? state.party[0]
  const calc = calcRoll(state, pseudo, actor, boost, stat)
  const extraSpec = free && specOn && !calc.spec ? 1 : 0
  const mod = Math.max(-2, Math.min(3, calc.total + extraSpec))

  const itemOpts = (req.spec.items ?? []).filter((i) => actor.items.includes(i) && !actor.spentItems.includes(i))
  const helpers = req.spec.allowHelp === false ? [] : state.party.filter((c) => c.id !== actorId && charCanAct(c))
  const joanCan = !!state.flags.joanJoined && state.flags.joanHelpedAt !== state.location && stat !== 'str'

  return (
    <div className="modal-backdrop">
      <div className="modal roll-modal">
        <div className="modal-kicker">检定</div>
        <h3>{req.title}</h3>
        <div className="risk"><b>风险：</b>{req.spec.risk}</div>
        {req.statChoosable && (
          <div className="field">
            <div className="field-label">用哪项属性？</div>
            <div className="seg-row">
              {STAT_ORDER.map((s) => (
                <button key={s} className={`seg ${stat === s ? 'on' : ''}`} onClick={() => setStat(s)}>{STAT_NAMES[s]}</button>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <div className="field-label">{req.fixedActor ? '本回合行动者' : '谁来行动？'}</div>
          <div className="actor-row">
            {avail.map((c) => {
              const t = calcRoll(state, pseudo, c, { kind: 'none' }, stat)
              return (
                <button key={c.id} className={`actor ${actorId === c.id ? 'on' : ''}`} style={{ ['--hue' as string]: c.hue }} onClick={() => { setActorId(c.id); setBoost({ kind: 'none' }) }}>
                  <Sigil c={c} size={30} />
                  <div>
                    <b>{c.name}</b>
                    <small>{STAT_NAMES[stat]} {fmt(c.stats[stat])}{t.spec ? ` · ${t.spec}` : ''}</small>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
        <div className="field">
          <div className="field-label">情境优势 <small>（只计一次）</small></div>
          <div className="seg-row wrap">
            <button className={`seg ${boost.kind === 'none' ? 'on' : ''}`} onClick={() => setBoost({ kind: 'none' })}>无</button>
            {itemOpts.map((i) => (
              <button key={i} className={`seg ${boost.kind === 'item' && boost.item === i ? 'on' : ''}`} onClick={() => setBoost({ kind: 'item', item: i })}>使用「{i}」</button>
            ))}
            {helpers.map((h) => (
              <button key={h.id} className={`seg ${boost.kind === 'help' && boost.id === h.id ? 'on' : ''}`} onClick={() => setBoost({ kind: 'help', id: h.id })} title="协助者在失败时一同承压；本地点首次协助获得 1 优势点">
                {h.name}协助
              </button>
            ))}
            {joanCan && <button className={`seg ${boost.kind === 'joan' ? 'on' : ''}`} onClick={() => setBoost({ kind: 'joan' })}>乔安协助</button>}
          </div>
        </div>
        {free && !calc.spec && (
          <label className="toggle small">
            <input type="checkbox" checked={specOn} onChange={(e) => setSpecOn(e.target.checked)} />
            <span>{actor.name}的专长（{actor.specialties.join('、')}）适用于这次行动 +1</span>
          </label>
        )}
        <div className="formula">
          <span>2d6</span>
          <span className="op">{fmt(calc.statVal)}</span><small>{STAT_NAMES[stat]}</small>
          {(calc.spec || extraSpec > 0) && <><span className="op">+1</span><small>{calc.spec ?? '专长'}</small></>}
          {calc.situ !== 0 && <><span className="op">{fmt(calc.situ)}</span><small>{calc.situLabel}</small></>}
          <span className="eq">=</span>
          <span className="mod">2d6 {fmt(mod)}</span>
        </div>
        <div className="tiers-hint">
          <span className="t-hit">10+ 成功</span><span className="t-partial">7–9 有代价</span><span className="t-miss">6- 变复杂</span>
        </div>
        <div className="row end">
          {req.cancellable && <button className="btn ghost" disabled={busy} onClick={onCancel}>再想想</button>}
          <button
            className="btn primary big"
            disabled={busy}
            onClick={() => { sound.dice(); onRoll({ kind: req.kind, id: req.actionId, actorId, boost, stat: req.statChoosable ? stat : undefined, specOn: free ? specOn : undefined }) }}
          >
            掷骰
          </button>
        </div>
      </div>
    </div>
  )
}

export function RollView({ state, mine, waitingFor, onReroll, onCommit, busy }: {
  state: GameState
  mine: boolean
  waitingFor?: string
  onReroll: () => void
  onCommit: () => void
  busy: boolean
}) {
  const r = state.rolling!
  const actor = state.party.find((c) => c.id === r.actorId)
  const [shown, setShown] = useState<[number, number]>([d6(), d6()])
  const [rolling, setRolling] = useState(true)
  const landed = useRef<[number, number] | null>(null)

  useEffect(() => {
    const prev = landed.current
    const changed: [boolean, boolean] = prev ? [prev[0] !== r.dice[0], prev[1] !== r.dice[1]] : [true, true]
    setRolling(true)
    sound.dice()
    let n = 0
    const iv = window.setInterval(() => {
      n++
      setShown((s) => [changed[0] ? d6() : s[0], changed[1] ? d6() : s[1]])
      if (n >= 11) {
        window.clearInterval(iv)
        landed.current = [r.dice[0], r.dice[1]]
        setShown([r.dice[0], r.dice[1]])
        setRolling(false)
        sound.land(tierOf(r.dice[0] + r.dice[1] + r.mod))
      }
    }, 70)
    return () => window.clearInterval(iv)
  }, [r.nonce])

  const sum = r.dice[0] + r.dice[1] + r.mod
  const tier = tierOf(sum)
  const thinking = !!state.thinking

  return (
    <div className="modal-backdrop">
      <div className={`modal roll-modal ${!rolling ? `t-${tier}` : ''}`}>
        <div className="modal-kicker">检定 · {actor?.name} · {STAT_NAMES[r.stat]}</div>
        <h3>{r.title}</h3>
        <div className="risk"><b>风险：</b>{r.risk}</div>
        <div className="dice-stage">
          <Die value={shown[0]} rolling={rolling} size={84} />
          <Die value={shown[1]} rolling={rolling} size={84} />
          {!rolling && (
            <div className="dice-result">
              <div className="sum">{r.dice[0]} + {r.dice[1]} {fmt(r.mod)} = <b>{sum}</b></div>
              <div className="tier-label">{TIER_LABEL[tier]}</div>
            </div>
          )}
        </div>
        <div className="row end">
          {thinking && <span className="dim">主持人正在裁定……</span>}
          {!mine && !thinking && <span className="dim">等待 {waitingFor ?? actor?.name} 确认结果……</span>}
          {mine && !rolling && !thinking && tier !== 'hit' && !r.rerolled && (actor?.advantage ?? 0) > 0 && (
            <button className="btn" disabled={busy} onClick={onReroll} title="花费 1 点优势，重掷较小的一颗">◆ 花费优势点重掷一颗</button>
          )}
          {mine && !rolling && !thinking && <button className="btn primary" disabled={busy} onClick={onCommit}>继续</button>}
        </div>
      </div>
    </div>
  )
}
