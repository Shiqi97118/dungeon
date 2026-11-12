import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Character, GameState } from './game/types'
import { configGm, runIntent, type Intent } from './game/session'
import { sound } from './audio/sound'
import { aiReady, loadAiConfig, saveAiConfig, type AiConfig } from './game/ai'
import { api, loadSeat, proxyGm, saveSeat, serverInfo, type Seat, type ServerInfo } from './net/api'
import { canControl, controllerName, isOnline, roomSeating, useRoom } from './net/useRoom'
import { AI, controllerOf, nextCompanionMove } from './game/companion'
import Title from './ui/Title'
import Setup from './ui/Setup'
import Game, { type Control } from './ui/Game'
import Ending from './ui/Ending'
import Settings from './ui/Settings'
import { Lobby, OnlineEntry } from './ui/Online'
import Journey, { JOURNEY_KEY } from './ui/journey/Journey'
import JourneySetup from './ui/journey/JourneySetup'
import { loadTable, openTable, soloMember, type Table } from './iselan/play'
import { proxyModel } from './net/iselanGm'
import { OUTDATED_SAVE_ACTION } from './iselan/save'

const SAVE_KEY = 'echo-well-save'
const BUILTIN_KEY = 'echo-well-builtin-ai'


type Screen = 'title' | 'setup' | 'game' | 'online' | 'osetup' | 'room' | 'journey' | 'notice'

function soloControl(s: GameState | null): Control {
  const auto = new Set(s?.auto ?? [])
  return {
    online: false,
    seated: auto.size > 0,
    can: (id) => !id || !auto.has(id),
    auto: (id) => !!id && auto.has(id),
    who: (id) => (id && auto.has(id) ? 'AI 同伴' : undefined),
  }
}

const msg = (e: unknown) => String((e as Error)?.message ?? e)

export default function App() {
  const inviteCode = useMemo(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '', [])
  const [screen, setScreen] = useState<Screen>(inviteCode ? 'online' : 'title')
  const [solo, setSolo] = useState<GameState | null>(null)
  const soloRef = useRef<GameState | null>(null)
  const [journey, setJourney] = useState<Table | null>(null)
  const [hasJourney, setHasJourney] = useState(() => !!localStorage.getItem(JOURNEY_KEY) || !!localStorage.getItem(SAVE_KEY))
  const [notice, setNotice] = useState<string | null>(null)
  const [muted, setMuted] = useState(() => localStorage.getItem('echo-well-muted') === '1')
  const [ai, setAi] = useState<AiConfig>(() => loadAiConfig())
  const [builtin, setBuiltin] = useState(() => localStorage.getItem(BUILTIN_KEY) !== '0')
  const [info, setInfo] = useState<ServerInfo | null | undefined>(undefined)
  const [showSettings, setShowSettings] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [nick, setNick] = useState('')
  const [busy, setBusy] = useState(false)
  const [seat, setSeat] = useState<Seat | null>(null)
  const [storedSeat, setStoredSeat] = useState<Seat | null>(() => loadSeat())
  const conn = useRoom(screen === 'room' ? seat : null)

  useEffect(() => { serverInfo().then(setInfo) }, [])

  useEffect(() => {
    if (solo && screen === 'game') localStorage.setItem(SAVE_KEY, JSON.stringify(solo))
  }, [solo, screen])

  useEffect(() => {
    sound.setMuted(muted)
    localStorage.setItem('echo-well-muted', muted ? '1' : '0')
  }, [muted])

  useEffect(() => {
    const unlock = () => sound.init()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    if (screen === 'title' || screen === 'setup' || screen === 'online' || screen === 'osetup') sound.setAmbience('rain', 1)
    if (screen === 'room' && conn.room?.status === 'lobby') sound.setAmbience('rain', 1)
  }, [screen, conn.room?.status])

  const setSoloState = (s: GameState) => { soloRef.current = s; setSolo(s) }

  const soloGm = () => (aiReady(ai) ? configGm(ai) : info?.gm && builtin ? proxyGm : null)
  const soloAiLabel = aiReady(ai) ? 'AI 主持人 · 自定义' : info?.gm && builtin ? 'AI 主持人 · 内置' : '离线主持'

  const sendSolo = useCallback(async (i: Intent) => {
    if (!soloRef.current) return
    setErr(null)
    const res = await runIntent(soloRef.current, i, soloGm(), { interim: (st) => setSoloState(st) })
    setSoloState(res.state)
    if (res.error) setErr(res.error)
  }, [ai, info, builtin])

  const journeyModel = useMemo(
    () => (journey && info?.gm && builtin ? proxyModel(journey.runId, journey.responses) : null),
    // A new model per run (and per load) so response numbers continue from the save.
    [journey?.runId, info?.gm, builtin],
  )
  const journeyLabel = info?.gm && builtin ? 'AI 主持人 · 内置' : '离线主持'

  const startJourney = (pc: Parameters<typeof soloMember>[0], hook: Parameters<typeof openTable>[0]['openingHook']) => {
    localStorage.removeItem(SAVE_KEY)
    const runId = crypto.randomUUID()
    setJourney(openTable({ runId, seed: runId.slice(0, 8), party: [soloMember(pc)], openingHook: hook }))
    setErr(null)
    setScreen('journey')
  }

  const resumeJourney = () => {
    const raw = localStorage.getItem(JOURNEY_KEY)
    if (!raw) {
      setNotice('世界已更新，旧存档无法继续')
      setScreen('notice')
      return
    }
    const r = loadTable(raw)
    if (r.status === 'ok') {
      setJourney(r.table)
      setScreen('journey')
    } else {
      setNotice(r.status === 'outdated' ? r.message : `存档读不出来：${r.problems.join('；')}`)
      setScreen('notice')
    }
  }

  const freshJourney = () => {
    localStorage.removeItem(JOURNEY_KEY)
    localStorage.removeItem(SAVE_KEY)
    setHasJourney(false)
    setNotice(null)
    setScreen('setup')
  }

  const toTitle = () => {
    setHasJourney(!!localStorage.getItem(JOURNEY_KEY) || !!localStorage.getItem(SAVE_KEY))
    setStoredSeat(loadSeat())
    setErr(null)
    setScreen('title')
  }

  const restart = () => {
    localStorage.removeItem(SAVE_KEY)
    soloRef.current = null
    setSolo(null)
    setScreen('setup')
  }

  const enterRoom = (s: Seat) => {
    saveSeat(s)
    setStoredSeat(s)
    setSeat(s)
    setErr(null)
    setScreen('room')
    if (inviteCode) history.replaceState(null, '', location.pathname)
  }

  const createRoom = async (party: Character[], safety: GameState['safety']) => {
    setBusy(true)
    setErr(null)
    try { enterRoom(await api.create(nick, party, safety)) } catch (e) { setErr(msg(e)); setScreen('online') } finally { setBusy(false) }
  }

  const joinRoom = async (code: string, name: string) => {
    setBusy(true)
    setErr(null)
    try { enterRoom(await api.join(code, name)) } catch (e) { setErr(msg(e)) } finally { setBusy(false) }
  }

  const roomOp = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setErr(null)
    try { await fn() } catch (e) { setErr(msg(e)) } finally { setBusy(false); conn.refresh() }
  }

  const leaveRoom = async () => {
    if (seat) { try { await api.leave(seat) } catch { /* already gone */ } }
    saveSeat(null)
    setSeat(null)
    toTitle()
  }

  const sendOnline = useCallback(async (i: Intent) => {
    if (!seat) return
    setErr(null)
    try {
      const r = await api.act(seat, i)
      if (r.error) setErr(r.error)
    } catch (e) {
      setErr(msg(e))
    } finally {
      conn.refresh()
    }
  }, [seat, conn.refresh])

  const soloMove = screen === 'game' && solo ? nextCompanionMove(solo, (id) => !!solo.auto?.includes(id)) : null
  useEffect(() => {
    if (!soloMove) return
    const t = setTimeout(() => { void sendSolo(soloMove.intent) }, soloMove.delay)
    return () => clearTimeout(t)
  }, [solo, screen])

  const updateAi = (c: AiConfig) => {
    setAi(c)
    saveAiConfig(c)
  }

  const room = conn.room
  const seating = room ? roomSeating(room, conn.presence, conn.skew) : null
  const onlineCtl: Control | null = room && seat && seating
    ? {
      online: true,
      seated: true,
      can: (charId) => canControl(seating, seat.pid, charId),
      auto: (charId) => !!charId && controllerOf(seating, charId) === AI,
      who: (charId) => controllerName(room, seating, charId),
    }
    : null

  const settings = showSettings && (
    <Settings
      config={ai}
      onChange={updateAi}
      onClose={() => setShowSettings(false)}
      builtin={{ available: !!info?.gm, enabled: builtin, onToggle: (v) => { setBuiltin(v); localStorage.setItem(BUILTIN_KEY, v ? '1' : '0') } }}
    />
  )

  return (
    <>
      {screen === 'title' && (
        <Title
          hasSave={hasJourney}
          onNew={() => setScreen('setup')}
          onResume={resumeJourney}
          onSettings={() => setShowSettings(true)}
          muted={muted}
          onMute={() => setMuted(!muted)}
          aiLabel={`AI 主持人：${soloAiLabel === '离线主持' ? '未启用（可选）' : soloAiLabel.replace('AI 主持人 · ', '')}`}
          onOnline={() => { setErr(null); setScreen('online') }}
          roomCode={storedSeat?.code}
          onRejoin={() => storedSeat && enterRoom(storedSeat)}
        />
      )}
      {screen === 'setup' && <JourneySetup onStart={startJourney} onBack={() => setScreen('title')} />}
      {screen === 'journey' && journey && <Journey key={journey.runId} initial={journey} model={journeyModel} aiLabel={journeyLabel} onQuit={toTitle} />}
      {screen === 'notice' && (
        <div className="setup-screen">
          <div className="setup-wrap narrow">
            <div className="panel setup-panel">
              <h2>{notice}</h2>
              <p className="lead">这一份进度来自更早的版本，没法接着玩了。已经解锁的成就仍在档案里。</p>
              <div className="row end">
                <button className="btn ghost" onClick={toTitle}>返回</button>
                <button className="btn primary" onClick={freshJourney}>{OUTDATED_SAVE_ACTION}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {screen === 'online' && (
        <OnlineEntry
          info={info}
          initialCode={inviteCode}
          busy={busy}
          error={err}
          onCreate={(name) => { setNick(name); setErr(null); setScreen('osetup') }}
          onJoin={joinRoom}
          onBack={toTitle}
        />
      )}
      {screen === 'osetup' && <Setup online onStart={(p, s) => createRoom(p, s)} onBack={() => setScreen('online')} />}
      {screen === 'game' && solo && solo.phase === 'play' && (
        <Game
          state={solo}
          send={sendSolo}
          ctl={soloControl(solo)}
          aiLabel={soloAiLabel}
          aiOn={soloAiLabel !== '离线主持'}
          error={err}
          clearError={() => setErr(null)}
          muted={muted}
          onMute={() => setMuted(!muted)}
          onSettings={() => setShowSettings(true)}
          onQuit={toTitle}
        />
      )}
      {screen === 'game' && solo && solo.phase === 'ending' && (
        <Ending state={solo} onTakeaways={(t) => sendSolo({ t: 'takeaways', takeaways: t })} onRestart={restart} onTitle={toTitle} />
      )}
      {screen === 'room' && !room && (
        <div className="setup-screen">
          <div className="setup-wrap narrow">
            <div className="panel setup-panel">
              {conn.fatal
                ? <><h2>进不去这个房间</h2><p className="lead">{conn.error}</p><div className="row end"><button className="btn primary" onClick={leaveRoom}>回到标题</button></div></>
                : <><h2>正在进入房间……</h2>{conn.error && <p className="dim">{conn.error}</p>}<div className="row end"><button className="btn ghost" onClick={toTitle}>返回</button></div></>}
            </div>
          </div>
        </div>
      )}
      {screen === 'room' && room && seat && room.status === 'lobby' && (
        <Lobby
          room={room}
          meId={seat.pid}
          presence={conn.presence}
          skew={conn.skew}
          busy={busy}
          error={err ?? (conn.error && !conn.fatal ? `连接不稳定：${conn.error}` : null)}
          onClaim={(id) => roomOp(() => api.claim(seat, id))}
          onRelease={(id) => roomOp(() => api.release(seat, id))}
          onStart={() => roomOp(() => api.start(seat))}
          onLeave={leaveRoom}
          onChat={async (t) => { await api.chat(seat, t); conn.refresh() }}
        />
      )}
      {screen === 'room' && room && seat && onlineCtl && room.status === 'play' && room.state.phase === 'play' && (
        <Game
          state={room.state}
          send={sendOnline}
          ctl={onlineCtl}
          aiLabel={room.aiOn ? 'AI 主持人 · 在线' : '离线主持'}
          aiOn={room.aiOn}
          error={err ?? (conn.error && !conn.fatal ? `连接不稳定：${conn.error}` : null)}
          clearError={() => setErr(null)}
          muted={muted}
          onMute={() => setMuted(!muted)}
          onSettings={() => setShowSettings(true)}
          onQuit={toTitle}
          online={{
            code: room.code,
            meId: seat.pid,
            players: room.players.map((p) => ({ id: p.id, name: p.name, online: isOnline(conn.presence, p.id, conn.skew), host: p.id === room.hostId })),
            chat: room.chat,
            sendChat: async (t) => { await api.chat(seat, t); conn.refresh() },
          }}
        />
      )}
      {screen === 'room' && room && seat && room.status === 'play' && room.state.phase === 'ending' && (
        <Ending
          state={room.state}
          onTakeaways={(t) => sendOnline({ t: 'takeaways', takeaways: t })}
          onRestart={leaveRoom}
          onTitle={toTitle}
          restartLabel="离开房间"
        />
      )}
      {settings}
    </>
  )
}
