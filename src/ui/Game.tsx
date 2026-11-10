import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActionDef, GameState, LocId, Stat, Tier } from '../game/types'
import { SCENES } from '../game/data/scenes'
import { availableActions, tierOf, type GameAction } from '../game/engine'
import { aiEnding, aiPropose, aiReady, aiResolve, type AiConfig } from '../game/ai'
import { sound } from '../audio/sound'
import Log from './Log'
import Sidebar from './Sidebar'
import RollPanel, { type RollRequest } from './RollPanel'
import BellPuzzle from './BellPuzzle'
import Atmosphere from './Atmosphere'
import { CustomFinalModal, MenuModal, PendingModal } from './Modals'

interface Props {
  state: GameState
  dispatch: (a: GameAction) => void
  ai: AiConfig
  muted: boolean
  onMute: () => void
  onSettings: () => void
  onQuit: () => void
}

const GROUPS: { id: ActionDef['group']; label: string }[] = [
  { id: 'final', label: '终局抉择' },
  { id: 'act', label: '行动' },
  { id: 'talk', label: '交谈' },
  { id: 'move', label: '前往' },
]

export function guessStat(text: string): Stat {
  const t = text
  if (/[说问劝谈骗哄安抚商量交易威胁求承诺告诉解释]/.test(t)) return 'soc'
  if (/[推撬搬扛砸打拉拖撞挡举爬攀抗]/.test(t)) return 'str'
  if (/[潜躲偷溜跳闪藏摸快绕]/.test(t)) return 'dex'
  return 'ins'
}

const AMBIENT_MODE = { rain: 'rain', cave: 'dust', water: 'dust', crystal: 'crystal', core: 'core' } as const

export default function Game({ state, dispatch, ai, muted, onMute, onSettings, onQuit }: Props) {
  const scene = SCENES[state.location]
  const actions = availableActions(state)
  const [rollReq, setRollReq] = useState<RollRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [free, setFree] = useState('')
  const [customOpen, setCustomOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const stateRef = useRef(state)
  stateRef.current = state
  const prevPressure = useRef(state.pressure)
  const useAi = aiReady(ai)
  const [locCard, setLocCard] = useState<string | null>(null)
  const prevLoc = useRef<LocId | null>(null)

  useEffect(() => {
    sound.setAmbience(scene.ambience, state.pressure)
  }, [scene.ambience, state.pressure])

  useEffect(() => {
    if (prevLoc.current !== state.location) {
      const firstTime = state.visited.filter((v) => v === state.location).length === 1 && state.log.filter((e) => e.kind === 'sys' && e.text.includes(`§${scene.title}`)).length <= 1
      if ((prevLoc.current !== null && firstTime) || (prevLoc.current === null && state.turn === 0)) {
        setLocCard(state.location)
        sound.bell(146.83, 0.2)
        const t = setTimeout(() => setLocCard(null), 2700)
        prevLoc.current = state.location
        return () => clearTimeout(t)
      }
      prevLoc.current = state.location
    }
  }, [state.location])

  useEffect(() => {
    if (state.pressure > prevPressure.current) {
      sound.thump()
      setShake(true)
      const t = setTimeout(() => setShake(false), 700)
      prevPressure.current = state.pressure
      return () => clearTimeout(t)
    }
    prevPressure.current = state.pressure
  }, [state.pressure])

  useEffect(() => {
    if (!state.lastToast) return
    setToast(state.lastToast.text)
    if (state.lastToast.text.startsWith('新线索')) sound.chime()
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [state.lastToast?.id])

  const onAction = (a: ActionDef) => {
    if (busy) return
    sound.click()
    if (a.locked?.(state)) return
    if (a.roll) {
      setRollReq({
        title: a.label,
        spec: a.roll,
        onCommit: (r) => {
          setRollReq(null)
          dispatch({ type: 'roll', id: a.id, actorId: r.actorId, boost: r.boost, dice: r.dice, mod: r.mod })
        },
        onCancel: () => setRollReq(null),
      })
    } else {
      dispatch({ type: 'perform', id: a.id })
    }
  }

  const moveTo = (loc: LocId) => {
    const a = actions.find((x) => x.to === loc)
    if (a) onAction(a)
  }
  const canMove = (loc: LocId) => actions.some((x) => x.to === loc && !x.roll && x.group === 'move')

  const runAi = async (text: string) => {
    setBusy(true)
    setErr(null)
    try {
      const t = await aiPropose(ai, stateRef.current, text)
      if (t.roll) {
        dispatch({ type: 'ai', actorText: text, narration: t.narration })
        setBusy(false)
        const rollInfo = t.roll
        setRollReq({
          title: text,
          spec: { stat: rollInfo.stat, specialties: [], risk: rollInfo.risk || '局势可能变得复杂。' },
          freeSpec: true,
          defaultActor: rollInfo.actorId,
          cancellable: false,
          onCommit: async (r) => {
            setRollReq(null)
            setBusy(true)
            try {
              const actor = stateRef.current.party.find((c) => c.id === r.actorId)
              const total = r.dice[0] + r.dice[1] + r.mod
              const res = await aiResolve(ai, stateRef.current, text, {
                actorName: actor?.name ?? '', stat: r.stat, dice: r.dice, total, tier: tierOf(total), risk: rollInfo.risk,
              })
              dispatch({ type: 'ai', narration: res.narration, effects: res.effects, roll: { actorId: r.actorId, stat: r.stat, dice: r.dice, mod: r.mod } })
            } catch (e) {
              setErr(String((e as Error).message ?? e))
              dispatch({ type: 'free', text, actorId: r.actorId, stat: r.stat, dice: r.dice, mod: r.mod })
            } finally {
              setBusy(false)
            }
          },
        })
        return
      }
      dispatch({ type: 'ai', actorText: text, narration: t.narration, effects: t.effects })
    } catch (e) {
      setErr(`${(e as Error).message ?? e}。已改用离线规则裁定。`)
      offlineFree(text)
    } finally {
      setBusy(false)
    }
  }

  const offlineFree = (text: string) => {
    setRollReq({
      title: text,
      spec: { stat: guessStat(text), specialties: [], risk: '失败会让局势变复杂：承压、回声压力上升或失去物品。' },
      statChoosable: true,
      freeSpec: true,
      onCommit: (r) => {
        setRollReq(null)
        dispatch({ type: 'free', text, actorId: r.actorId, stat: r.stat, dice: r.dice, mod: r.mod })
      },
      onCancel: () => setRollReq(null),
    })
  }

  const submitFree = () => {
    const text = free.trim()
    if (!text || busy) return
    setFree('')
    sound.click()
    if (useAi) runAi(text)
    else offlineFree(text)
  }

  const submitCustomFinal = (plan: string) => {
    setCustomOpen(false)
    setRollReq({
      title: plan,
      spec: { stat: guessStat(plan), specialties: [], risk: '方案可能只实现一半，代价会更沉重——但这不会是团灭。' },
      statChoosable: true,
      freeSpec: true,
      onCommit: async (r) => {
        setRollReq(null)
        const tier = tierOf(r.dice[0] + r.dice[1] + r.mod)
        let paragraphs = offlineCustomEnding(stateRef.current, plan, tier)
        if (useAi) {
          setBusy(true)
          try { paragraphs = await aiEnding(ai, stateRef.current, plan, tier) } catch (e) { setErr(String((e as Error).message ?? e)) }
          setBusy(false)
        }
        dispatch({ type: 'customEnding', plan, paragraphs })
      },
      onCancel: () => setRollReq(null),
    })
  }

  const pending = state.queue[0]
  const grouped = useMemo(() => GROUPS.map((g) => ({ ...g, items: actions.filter((a) => a.group === g.id) })).filter((g) => g.items.length > 0 || (g.id === 'final' && state.location === 'G')), [actions, state.location])

  return (
    <div className={`game p${state.pressure} amb-${scene.ambience} ${shake ? 'shake' : ''}`}>
      <header className="topbar">
        <div className="brand" onClick={() => setMenu(true)}>回声井 <small>第七道门</small></div>
        <div className="topbar-right">
          <button className={`pill ${useAi ? 'on' : ''}`} onClick={onSettings} title="AI 主持人设置">{useAi ? 'AI 主持人 · 在线' : '离线主持'}</button>
          <button className="icon-btn" onClick={onMute} title="声音">{muted ? '♪̸' : '♪'}</button>
          <button className="icon-btn mobile-only" onClick={() => setDrawer(!drawer)} title="队伍与线索">☰</button>
          <button className="icon-btn" onClick={() => setMenu(true)} title="暂停与存档">Ⅱ</button>
        </div>
      </header>

      <div className="layout">
        <main className="stage">
          <div className="scene-header" key={state.location}>
            <div className="scene-img" style={{ backgroundImage: `url(art/${scene.image}.jpg)` }} />
            <Atmosphere mode={AMBIENT_MODE[scene.ambience]} intensity={state.pressure} />
            <Whispers state={state} />
            <div className="scene-shade" />
            <div className="scene-caption">
              <span className="scene-code big">{scene.code}</span>
              <div>
                <div className="scene-name">{scene.title}</div>
                {state.crisis && <div className="crisis-chip">危机 · {state.crisis.name} <Progress n={state.crisis.progress} max={state.crisis.need} /></div>}
              </div>
            </div>
          </div>

          <Log state={state} thinking={busy} />

          <div className="actions">
            {state.crisis && (
              <div className="crisis-bar">
                <b>{state.crisis.name}</b> {state.crisis.desc}
                <span className="crisis-prog">进度 <Progress n={state.crisis.progress} max={state.crisis.need} /></span>
              </div>
            )}
            {grouped.map((g) => (
              <div key={g.id} className={`action-group g-${g.id}`}>
                <div className="group-label">{g.label}</div>
                <div className="action-list">
                  {g.items.map((a) => {
                    const lock = a.locked?.(state)
                    return (
                      <button key={a.id} className={`action ${a.roll ? 'risky' : ''} ${lock ? 'locked' : ''}`} disabled={!!lock || busy} onClick={() => onAction(a)} title={lock ?? a.hint}>
                        <span className="action-label">{a.label}</span>
                        {a.roll && <span className="action-tag">检定 · {statName(a.roll.stat)}</span>}
                        {lock ? <span className="action-hint">{lock}</span> : a.hint && <span className="action-hint">{a.hint}</span>}
                      </button>
                    )
                  })}
                  {g.id === 'final' && (
                    <button className="action custom" disabled={busy} onClick={() => setCustomOpen(true)}>
                      <span className="action-label">提出你们自己的方案……</span>
                      <span className="action-hint">任何合理方案都可行</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
            <form className="free-input" onSubmit={(e) => { e.preventDefault(); submitFree() }}>
              <input
                className="input"
                value={free}
                onChange={(e) => setFree(e.target.value)}
                placeholder={useAi ? '自由行动：描述你们想做的事、想说的话……AI 主持人会裁定' : '自由行动：描述你们想做的事……（离线：选择属性掷骰裁定）'}
                disabled={busy}
                maxLength={200}
              />
              <button className="btn primary" disabled={!free.trim() || busy}>行动</button>
            </form>
            {err && <div className="error" onClick={() => setErr(null)}>{err}</div>}
          </div>
        </main>

        <div className={`side-wrap ${drawer ? 'open' : ''}`}>
          <Sidebar state={state} onMove={(l) => { setDrawer(false); moveTo(l) }} canMove={canMove} />
        </div>
      </div>

      {toast && <div className="toast" key={toast}>{toast}</div>}
      {locCard && (
        <div className="loc-card" key={locCard}>
          <div className="loc-card-inner">
            <div className="loc-card-code">{scene.code}</div>
            <div className="loc-card-title">{scene.title}</div>
            <div className="loc-card-line" />
          </div>
        </div>
      )}

      {pending?.type === 'bells' && (
        <BellPuzzle
          mode={pending.mode}
          hasScore={state.clues.includes('c_score')}
          onDone={(success, mistakes) => dispatch({ type: 'bells', success, mistakes })}
        />
      )}
      {pending && pending.type !== 'bells' && <PendingModal state={state} p={pending} dispatch={dispatch} />}
      {!pending && rollReq && <RollPanel key={rollReq.title + state.turn} state={state} req={rollReq} dispatchReroll={(id) => dispatch({ type: 'spendReroll', charId: id })} />}
      {customOpen && <CustomFinalModal onSubmit={submitCustomFinal} onCancel={() => setCustomOpen(false)} />}
      {menu && <MenuModal state={state} onClose={() => setMenu(false)} onQuit={onQuit} />}
    </div>
  )
}

const statName = (s: Stat) => ({ str: '强韧', dex: '灵巧', ins: '洞察', soc: '交涉' })[s]

function Progress({ n, max }: { n: number; max: number }) {
  return <span className="progress">{Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>
}

function Whispers({ state }: { state: GameState }) {
  const [items, setItems] = useState<{ id: number; text: string; x: number; y: number }[]>([])
  const ref = useRef(state)
  ref.current = state
  useEffect(() => {
    if (state.pressure < 2) return
    const every = Math.max(2600, 9000 - state.pressure * 1200)
    const iv = setInterval(() => {
      const pool = ref.current.log.filter((e) => (e.kind === 'npc' || e.kind === 'echo' || e.kind === 'player') && e.text.length < 40)
      if (!pool.length) return
      const e = pool[Math.floor(Math.random() * pool.length)]
      const id = Date.now()
      setItems((xs) => [...xs.slice(-2), { id, text: e.text, x: 8 + Math.random() * 60, y: 15 + Math.random() * 55 }])
      if (Math.random() < 0.5) sound.whisper(0.15 + ref.current.pressure * 0.04)
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 6000)
    }, every)
    return () => clearInterval(iv)
  }, [state.pressure])
  return (
    <div className="whispers" aria-hidden>
      {items.map((w) => <span key={w.id} style={{ left: `${w.x}%`, top: `${w.y}%` }}>{w.text}</span>)}
    </div>
  )
}

function offlineCustomEnding(s: GameState, plan: string, tier: Tier): string[] {
  const p = [`你们决定：${plan}`]
  if (tier === 'hit') p.push('方案奏效了。井在你们手中第一次安静下来——不是因为被压制，而是因为它终于得到了一个清楚的答案。')
  else if (tier === 'partial') p.push('方案大体奏效，但代价比预想的更沉重：低层通道在你们身后坍塌，有一些回声，再也找不回来了。')
  else p.push('方案只实现了一半。井在失控的边缘被勉强按住，你们带着伤和缺口离开——它迟早还会醒来。')
  p.push(s.flags.ningPersuaded ? '宁芮站在你们身边，看着这一切发生。她没有阻止，只是轻声说了句“谢谢”，不知是对你们，还是对井里的那个声音。' : '宁芮始终没有完全接受你们的决定。离开时，她回头看了很久。')
  if (s.flags.luduoAtCore) p.push('陆铎把这一切写进了报告。公会会如何回应，没人说得准。')
  if (s.flags.evelynWith || s.flags.evelynSolo) p.push('伊芙琳留在了第七道门边。她说，无论结果如何，总得有人记得这里发生过什么。')
  return p
}
