import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActionDef, GameState, LocId, Pending, Stat } from '../game/types'
import { SCENES } from '../game/data/scenes'
import { actingCharId, availableActions } from '../game/engine'
import type { Intent } from '../game/session'
import { getChar } from '../game/fx'
import { sound } from '../audio/sound'
import Log from './Log'
import Sidebar from './Sidebar'
import { RollSetup, RollView, type RollSetupReq } from './RollPanel'
import BellPuzzle from './BellPuzzle'
import Atmosphere from './Atmosphere'
import TurnBar from './TurnBar'
import ChatDock from './Chat'
import { CustomFinalModal, MenuModal, PendingModal } from './Modals'
import type { ChatMsg } from '../net/api'

export interface Control {
  online: boolean
  /** Whether this browser may act for the given character right now (null = anyone). */
  can: (charId: string | null) => boolean
  /** Name of the player controlling a character, online only. */
  who: (charId: string | null) => string | undefined
}

export interface OnlineBits {
  code: string
  meId: string
  players: { id: string; name: string; online: boolean; host: boolean }[]
  chat: ChatMsg[]
  sendChat: (text: string) => Promise<void>
}

interface Props {
  state: GameState
  send: (i: Intent) => Promise<void>
  ctl: Control
  aiLabel: string
  aiOn: boolean
  error: string | null
  clearError: () => void
  muted: boolean
  onMute: () => void
  onSettings: () => void
  onQuit: () => void
  online?: OnlineBits
}

const GROUPS: { id: ActionDef['group']; label: string }[] = [
  { id: 'final', label: '终局抉择' },
  { id: 'act', label: '行动' },
  { id: 'talk', label: '交谈' },
  { id: 'move', label: '前往' },
]

const AMBIENT_MODE = { rain: 'rain', cave: 'dust', water: 'dust', crystal: 'crystal', core: 'core' } as const

const PENDING_LABEL: Record<Pending['type'], string> = {
  cost: '选择代价', overflow: '决定承压溢出的后果', memory: '回答倒影的问题', bells: '敲响钟序',
  volunteer: '决定谁交出记忆', deliver: '提出交付条件', farewell: '道别',
}

export default function Game({ state, send, ctl, aiLabel, aiOn, error, clearError, muted, onMute, onSettings, onQuit, online }: Props) {
  const scene = SCENES[state.location]
  const actions = availableActions(state)
  const [setup, setSetup] = useState<RollSetupReq | null>(null)
  const [sending, setSending] = useState(false)
  const [free, setFree] = useState('')
  const [customOpen, setCustomOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const prevPressure = useRef(state.pressure)
  const [locCard, setLocCard] = useState<string | null>(null)
  const prevLoc = useRef<LocId | null>(null)
  const prevActive = useRef<string | null | undefined>(undefined)

  const busy = sending || !!state.thinking
  const activeId = state.turns?.activeId ?? null
  const active = getChar(state, activeId ?? undefined)
  const myTurn = ctl.can(activeId)
  const idle = state.queue.length === 0 && !state.rolling && !state.rollReq
  const canUse = myTurn && idle && !busy
  const pending = state.queue[0]
  const pendingOwner = actingCharId(state)
  const pendingMine = ctl.can(pendingOwner)

  const go = async (i: Intent) => {
    if (sending) return
    setSending(true)
    try { await send(i) } finally { setSending(false) }
  }

  useEffect(() => {
    sound.setAmbience(scene.ambience, state.pressure)
  }, [scene.ambience, state.pressure])

  useEffect(() => {
    if (prevLoc.current !== state.location) {
      const firstTime = state.visited.filter((v) => v === state.location).length === 1 && state.log.filter((e) => e.kind === 'sys' && e.text.includes(`§${scene.title}`)).length <= 1
      if ((prevLoc.current !== null && firstTime) || (prevLoc.current === null && state.log.length < 12)) {
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

  useEffect(() => {
    if (prevActive.current === undefined) { prevActive.current = activeId; return }
    if (prevActive.current === activeId || !activeId || !active) return
    prevActive.current = activeId
    if (ctl.online && myTurn) {
      sound.bell(392, 0.25)
      setTimeout(() => sound.bell(523.25, 0.2), 180)
      setToast(`轮到你了 · ${active.name}`)
    } else {
      setToast(`轮到 ${active.name}${ctl.online && ctl.who(activeId) ? `（${ctl.who(activeId)}）` : ''}`)
    }
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [activeId, state.turns?.round])

  const onAction = (a: ActionDef) => {
    if (!canUse) return
    sound.click()
    if (a.locked?.(state)) return
    if (a.roll) {
      setSetup({ kind: 'action', actionId: a.id, title: a.label, spec: a.roll, fixedActor: activeId ?? undefined, cancellable: true })
    } else {
      go({ t: 'perform', id: a.id })
    }
  }

  const moveTo = (loc: LocId) => {
    const a = actions.find((x) => x.to === loc)
    if (a) onAction(a)
  }
  const canMove = (loc: LocId) => canUse && actions.some((x) => x.to === loc && !x.roll && x.group === 'move')

  const submitFree = () => {
    const text = free.trim()
    if (!text || !canUse) return
    setFree('')
    sound.click()
    go({ t: 'free', text })
  }

  const rq = state.rollReq
  const rqMine = !!rq && ctl.can(rq.actorId ?? activeId)
  const setupReq: RollSetupReq | null = rq
    ? rqMine
      ? { kind: rq.kind, title: rq.title, spec: { stat: rq.stat, specialties: [], risk: rq.risk }, statChoosable: rq.statChoosable, fixedActor: state.turns ? (activeId ?? undefined) : undefined, cancellable: rq.cancellable }
      : null
    : setup

  const grouped = useMemo(() => GROUPS.map((g) => ({ ...g, items: actions.filter((a) => a.group === g.id) })).filter((g) => g.items.length > 0 || (g.id === 'final' && state.location === 'G')), [actions, state.location])

  let waiting: string | null = null
  if (state.thinking) waiting = '主持人正在倾听井底的回声……'
  else if (pending && !pendingMine) waiting = `等待 ${ctl.who(pendingOwner) ?? getChar(state, pendingOwner ?? undefined)?.name ?? '队友'} ${PENDING_LABEL[pending.type]}……`
  else if (rq && !rqMine) waiting = `等待 ${ctl.who(rq.actorId ?? activeId) ?? '队友'} 掷骰……`
  else if (state.turns && !myTurn && active) waiting = `轮到 ${active.name}${ctl.who(activeId) ? `（${ctl.who(activeId)}）` : ''} 行动`

  const ownerOf = ctl.online ? (id: string) => ctl.who(id) : undefined

  return (
    <div className={`game p${state.pressure} amb-${scene.ambience} ${shake ? 'shake' : ''} ${myTurn && state.turns ? 'my-turn' : ''}`}>
      <header className="topbar">
        <div className="brand" onClick={() => setMenu(true)}>回声井 <small>第七道门</small></div>
        <div className="topbar-right">
          {online && (
            <div className="room-pill" title="把房间码发给朋友">
              房间 <b>{online.code}</b>
              <span className="room-dots">
                {online.players.map((p) => <i key={p.id} className={p.online ? 'on' : ''} title={`${p.name}${p.host ? '（房主）' : ''}${p.online ? '' : ' · 离线'}`} />)}
              </span>
            </div>
          )}
          <button className={`pill ${aiOn ? 'on' : ''}`} onClick={onSettings} title="AI 主持人">{aiLabel}</button>
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

          <TurnBar state={state} ownerOf={ownerOf} isMine={(id) => ctl.online && ctl.can(id)} />

          <Log state={state} thinking={!!state.thinking} />

          <div className="actions">
            {state.crisis && (
              <div className="crisis-bar">
                <b>{state.crisis.name}</b> {state.crisis.desc}
                <span className="crisis-prog">进度 <Progress n={state.crisis.progress} max={state.crisis.need} /></span>
              </div>
            )}
            {waiting && <div className={`wait-banner ${state.thinking ? 'thinking' : ''}`}><span className="dots"><i /><i /><i /></span>{waiting}</div>}
            {state.turns && myTurn && idle && active && (
              <div className="your-turn">
                <span><b>{active.name}</b>{ctl.online ? '，轮到你了' : ' 的回合'}——选择一个行动，或写下自由行动。</span>
                <button className="btn ghost small" disabled={busy} onClick={() => go({ t: 'pass' })}>结束回合</button>
              </div>
            )}
            {grouped.map((g) => (
              <div key={g.id} className={`action-group g-${g.id}`}>
                <div className="group-label">{g.label}</div>
                <div className="action-list">
                  {g.items.map((a) => {
                    const lock = a.locked?.(state)
                    return (
                      <button key={a.id} className={`action ${a.roll ? 'risky' : ''} ${lock ? 'locked' : ''}`} disabled={!!lock || !canUse} onClick={() => onAction(a)} title={lock ?? a.hint}>
                        <span className="action-label">{a.label}</span>
                        {a.roll && <span className="action-tag">检定 · {statName(a.roll.stat)}</span>}
                        {lock ? <span className="action-hint">{lock}</span> : a.hint && <span className="action-hint">{a.hint}</span>}
                      </button>
                    )
                  })}
                  {g.id === 'final' && (
                    <button className="action custom" disabled={!canUse} onClick={() => setCustomOpen(true)}>
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
                placeholder={!myTurn && state.turns ? '还没轮到你——可以在聊天里和队友商量' : aiOn ? '自由行动：描述你想做的事、想说的话……AI 主持人会裁定' : '自由行动：描述你想做的事……（离线：选择属性掷骰裁定）'}
                disabled={!canUse}
                maxLength={200}
              />
              <button className="btn primary" disabled={!free.trim() || !canUse}>行动</button>
            </form>
            {error && <div className="error" onClick={clearError}>{error}</div>}
          </div>
        </main>

        <div className={`side-wrap ${drawer ? 'open' : ''}`}>
          <Sidebar state={state} onMove={(l) => { setDrawer(false); moveTo(l) }} canMove={canMove} ownerOf={ownerOf} />
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

      {pending?.type === 'bells' && pendingMine && (
        <BellPuzzle
          mode={pending.mode}
          hasScore={state.clues.includes('c_score')}
          onDone={(success, mistakes) => go({ t: 'bells', success, mistakes })}
        />
      )}
      {pending && pending.type !== 'bells' && pendingMine && <PendingModal state={state} p={pending} dispatch={(i) => go(i)} />}
      {!pending && state.rolling && (
        <RollView
          key={state.rolling.nonce > 0 ? `${state.rolling.title}-${state.rolling.actorId}` : 'r'}
          state={state}
          mine={ctl.can(state.rolling.actorId)}
          waitingFor={ctl.who(state.rolling.actorId)}
          busy={busy}
          onReroll={() => go({ t: 'rollReroll' })}
          onCommit={() => go({ t: 'rollCommit' })}
        />
      )}
      {!pending && !state.rolling && setupReq && (
        <RollSetup
          key={setupReq.title + (setupReq.actionId ?? setupReq.kind)}
          state={state}
          req={setupReq}
          busy={busy}
          onCancel={() => { if (rq) go({ t: 'rollReqCancel' }); else setSetup(null) }}
          onRoll={(p) => { setSetup(null); go({ t: 'rollStart', ...p }) }}
        />
      )}
      {customOpen && <CustomFinalModal onSubmit={(plan) => { setCustomOpen(false); go({ t: 'customFinal', plan }) }} onCancel={() => setCustomOpen(false)} />}
      {menu && (
        <MenuModal
          state={state}
          onClose={() => setMenu(false)}
          onQuit={onQuit}
          quitLabel={online ? '回到标题（之后可重新进入房间）' : undefined}
          note={online ? '联机进度保存在服务器上。关掉页面也没关系，用同一个浏览器回来就能继续；离线超过 45 秒的座位会暂时交给房主代为操作。' : undefined}
        />
      )}
      {online && <ChatDock chat={online.chat} meId={online.meId} onSend={online.sendChat} />}
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
