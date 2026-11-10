import { useMemo, useState } from 'react'
import type { ActionDef, GameState, RollSpec, Stat } from '../game/types'
import { STAT_NAMES, STAT_ORDER } from '../game/types'
import { TIER_LABEL, calcRoll, tierOf, type Boost } from '../game/engine'
import { sound } from '../audio/sound'
import { Die, Sigil, fmt } from './bits'

export interface RollRequest {
  title: string
  spec: RollSpec
  statChoosable?: boolean
  freeSpec?: boolean
  defaultActor?: string
  onCommit: (r: { actorId: string; stat: Stat; boost: Boost; dice: [number, number]; mod: number }) => void
  onCancel?: () => void
  cancellable?: boolean
}

const d6 = () => 1 + Math.floor(Math.random() * 6)

export default function RollPanel({ state, req, dispatchReroll }: { state: GameState; req: RollRequest; dispatchReroll: (charId: string) => void }) {
  const avail = state.party.filter((c) => !c.out)
  const [stat, setStat] = useState<Stat>(req.spec.stat)
  const pseudo: ActionDef = useMemo(() => ({ id: 'x', label: req.title, group: 'act', roll: { ...req.spec, stat } }), [req, stat])

  const bestActor = useMemo(() => {
    const scored = avail.map((c) => ({ c, t: calcRoll(state, pseudo, c, { kind: 'none' }).total }))
    scored.sort((a, b) => b.t - a.t)
    return scored[0]?.c.id
  }, [avail, pseudo, state])

  const [actorId, setActorId] = useState<string>(req.defaultActor && avail.some((c) => c.id === req.defaultActor) ? req.defaultActor : bestActor ?? state.party[0].id)
  const [boost, setBoost] = useState<Boost>({ kind: 'none' })
  const [specOn, setSpecOn] = useState(false)
  const [dice, setDice] = useState<[number, number] | null>(null)
  const [rolling, setRolling] = useState(false)
  const [shown, setShown] = useState<[number, number]>([d6(), d6()])
  const [rerolled, setRerolled] = useState(false)
  const [lockedMod, setLockedMod] = useState<number | null>(null)

  const actor = state.party.find((c) => c.id === actorId)!
  const calc = calcRoll(state, pseudo, actor, boost, stat)
  const extraSpec = req.freeSpec && specOn && !calc.spec ? 1 : 0
  const mod = Math.max(-2, Math.min(3, calc.total + extraSpec))
  const finalMod = lockedMod ?? mod

  const itemOpts = (req.spec.items ?? []).filter((i) => actor.items.includes(i) && !actor.spentItems.includes(i))
  const helpers = req.spec.allowHelp === false ? [] : avail.filter((c) => c.id !== actorId)
  const joanCan = !!state.flags.joanJoined && state.flags.joanHelpedAt !== state.location && stat !== 'str'

  const animate = (final: [number, number], which: 'both' | 0 | 1, done: () => void) => {
    setRolling(true)
    sound.dice()
    let n = 0
    const iv = setInterval(() => {
      n++
      setShown((s) => [which === 1 ? s[0] : d6(), which === 0 ? s[1] : d6()])
      if (n >= 11) {
        clearInterval(iv)
        setShown(final)
        setRolling(false)
        done()
      }
    }, 70)
  }

  const roll = () => {
    const r: [number, number] = [d6(), d6()]
    setLockedMod(mod)
    animate(r, 'both', () => {
      setDice(r)
      sound.land(tierOf(r[0] + r[1] + mod))
    })
  }

  const reroll = () => {
    if (!dice) return
    dispatchReroll(actorId)
    const idx: 0 | 1 = dice[0] <= dice[1] ? 0 : 1
    const nv = d6()
    const r: [number, number] = idx === 0 ? [nv, dice[1]] : [dice[0], nv]
    setRerolled(true)
    animate(r, idx, () => {
      setDice(r)
      sound.land(tierOf(r[0] + r[1] + finalMod))
    })
  }

  const sum = dice ? dice[0] + dice[1] + finalMod : null
  const tier = sum !== null ? tierOf(sum) : null
  const liveAdv = state.party.find((c) => c.id === actorId)?.advantage ?? 0

  return (
    <div className="modal-backdrop">
      <div className={`modal roll-modal ${tier ? `t-${tier}` : ''}`}>
        <div className="modal-kicker">检定</div>
        <h3>{req.title}</h3>
        <div className="risk"><b>风险：</b>{req.spec.risk}</div>

        {!dice && (
          <>
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
              <div className="field-label">谁来行动？</div>
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
            {req.freeSpec && !calc.spec && (
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
          </>
        )}

        <div className="dice-stage">
          <Die value={shown[0]} rolling={rolling} size={84} />
          <Die value={shown[1]} rolling={rolling} size={84} />
          {dice && !rolling && (
            <div className="dice-result">
              <div className="sum">{dice[0]} + {dice[1]} {fmt(finalMod)} = <b>{sum}</b></div>
              <div className="tier-label">{tier && TIER_LABEL[tier]}</div>
            </div>
          )}
        </div>

        <div className="row end">
          {!dice && req.cancellable !== false && <button className="btn ghost" disabled={rolling} onClick={req.onCancel}>再想想</button>}
          {!dice && <button className="btn primary big" disabled={rolling} onClick={roll}>掷骰</button>}
          {dice && !rolling && tier !== 'hit' && !rerolled && liveAdv > 0 && (
            <button className="btn" onClick={reroll} title="花费 1 点优势，重掷较小的一颗">◆ 花费优势点重掷一颗</button>
          )}
          {dice && !rolling && (
            <button className="btn primary" onClick={() => req.onCommit({ actorId, stat, boost, dice, mod: finalMod })}>继续</button>
          )}
        </div>
      </div>
    </div>
  )
}
