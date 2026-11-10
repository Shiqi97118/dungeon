import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Character, GameState } from './game/types'
import { SAVE_VERSION, newGame } from './game/engine'
import { configGm, runIntent, type Intent } from './game/session'
import { sound } from './audio/sound'
import { aiReady, loadAiConfig, saveAiConfig, type AiConfig } from './game/ai'
import { api, loadSeat, proxyGm, saveSeat, serverInfo, type Seat, type ServerInfo } from './net/api'
import { canControl, controllerName, isOnline, useRoom } from './net/useRoom'
import Title from './ui/Title'
import Setup from './ui/Setup'
import Game, { type Control } from './ui/Game'
import Ending from './ui/Ending'
import Settings from './ui/Settings'
import { Lobby, OnlineEntry } from './ui/Online'

const SAVE_KEY = 'echo-well-save'
const BUILTIN_KEY = 'echo-well-builtin-ai'

function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as GameState
    return s.version === SAVE_VERSION ? s : null
  } catch {
    return null
  }
}

type Screen = 'title' | 'setup' | 'game' | 'online' | 'osetup' | 'room'

const SOLO_CTL: Control = { online: false, can: () => true, who: () => undefined }

const msg = (e: unknown) => String((e as Error)?.message ?? e)

export default function App() {
  const inviteCode = useMemo(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '', [])
  const [screen, setScreen] = useState<Screen>(inviteCode ? 'online' : 'title')
  const [solo, setSolo] = useState<GameState | null>(null)
  const soloRef = useRef<GameState | null>(null)
  const [saved, setSaved] = useState<GameState | null>(() => loadSave())
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

  const startSolo = (party: Character[], safety: GameState['safety'], turns: boolean) => {
    setSoloState(newGame(party, safety, { turns }))
    setErr(null)
    setScreen('game')
  }

  const resume = () => {
    if (!saved) return
    setSoloState(saved)
    setScreen('game')
  }

  const toTitle = () => {
    setSaved(loadSave())
    setStoredSeat(loadSeat())
    setErr(null)
    setScreen('title')
  }

  const restart = () => {
    localStorage.removeItem(SAVE_KEY)
    setSaved(null)
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

  const updateAi = (c: AiConfig) => {
    setAi(c)
    saveAiConfig(c)
  }

  const room = conn.room
  const onlineCtl: Control | null = room && seat
    ? {
      online: true,
      can: (charId) => canControl(room, conn.presence, conn.skew, seat.pid, charId),
      who: (charId) => controllerName(room, conn.presence, conn.skew, charId),
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
          hasSave={!!saved && saved.phase === 'play'}
          onNew={() => setScreen('setup')}
          onResume={resume}
          onSettings={() => setShowSettings(true)}
          muted={muted}
          onMute={() => setMuted(!muted)}
          aiLabel={`AI 主持人：${soloAiLabel === '离线主持' ? '未启用（可选）' : soloAiLabel.replace('AI 主持人 · ', '')}`}
          onOnline={() => { setErr(null); setScreen('online') }}
          roomCode={storedSeat?.code}
          onRejoin={() => storedSeat && enterRoom(storedSeat)}
        />
      )}
      {screen === 'setup' && <Setup onStart={startSolo} onBack={() => setScreen('title')} />}
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
          ctl={SOLO_CTL}
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
