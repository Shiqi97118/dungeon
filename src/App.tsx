import { useEffect, useMemo, useState } from 'react'
import { sound } from './audio/sound'
import { api, loadSeat, saveSeat, serverInfo, type Seat, type ServerInfo } from './net/api'
import { useRoom } from './net/useRoom'
import Title from './ui/Title'
import Settings from './ui/Settings'
import { OnlineEntry } from './ui/Online'
import Journey, { JOURNEY_KEY } from './ui/journey/Journey'
import JourneySetup from './ui/journey/JourneySetup'
import { RoomJourney, RoomLobby } from './ui/journey/Room'
import { loadTable, openTable, soloMember, type Table } from './iselan/play'
import { proxyModels } from './net/iselanGm'
import { aiReady, customModels, loadAiConfig, saveAiConfig, type AiConfig } from './net/customAi'
import { OUTDATED_SAVE_ACTION } from './iselan/save'

/** Saves from the earlier chapter; only their presence matters now (A12). */
const OLD_SAVE_KEY = 'echo-well-save'
const BUILTIN_KEY = 'echo-well-builtin-ai'

type Screen = 'title' | 'setup' | 'online' | 'room' | 'journey' | 'notice'

const msg = (e: unknown) => String((e as Error)?.message ?? e)

export default function App() {
  const inviteCode = useMemo(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '', [])
  const [screen, setScreen] = useState<Screen>(inviteCode ? 'online' : 'title')
  const [journey, setJourney] = useState<Table | null>(null)
  const [hasJourney, setHasJourney] = useState(() => !!localStorage.getItem(JOURNEY_KEY) || !!localStorage.getItem(OLD_SAVE_KEY))
  const [notice, setNotice] = useState<string | null>(null)
  const [muted, setMuted] = useState(() => localStorage.getItem('echo-well-muted') === '1')
  const [ai, setAi] = useState<AiConfig>(() => loadAiConfig())
  const [builtin, setBuiltin] = useState(() => localStorage.getItem(BUILTIN_KEY) !== '0')
  const [info, setInfo] = useState<ServerInfo | null | undefined>(undefined)
  const [showSettings, setShowSettings] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [seat, setSeat] = useState<Seat | null>(null)
  const [storedSeat, setStoredSeat] = useState<Seat | null>(() => loadSeat())
  const conn = useRoom(screen === 'room' ? seat : null)

  useEffect(() => { serverInfo().then(setInfo) }, [])

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
    if (screen === 'title' || screen === 'setup' || screen === 'online' || (screen === 'room' && conn.room?.status === 'lobby')) sound.setAmbience('rain', 1)
  }, [screen, conn.room?.status])

  const custom = aiReady(ai)
  const hosted = !!info?.gm && builtin
  const journeyModel = useMemo(
    () => (!journey ? null : custom ? customModels(ai, journey.responses) : hosted ? proxyModels(journey.runId, journey.responses) : null),
    // A new model per run (and per load) so response numbers continue from the save.
    [journey?.runId, custom, ai, hosted],
  )
  const journeyLabel = custom ? 'AI 主持人 · 自定义' : hosted ? 'AI 主持人 · 内置' : '离线主持'

  const startJourney = (pc: Parameters<typeof soloMember>[0]) => {
    localStorage.removeItem(OLD_SAVE_KEY)
    const runId = crypto.randomUUID()
    setJourney(openTable({ runId, seed: runId.slice(0, 8), party: [soloMember(pc)], openingHook: 'memento' }))
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
    localStorage.removeItem(OLD_SAVE_KEY)
    setHasJourney(false)
    setNotice(null)
    setScreen('setup')
  }

  const toTitle = () => {
    setHasJourney(!!localStorage.getItem(JOURNEY_KEY) || !!localStorage.getItem(OLD_SAVE_KEY))
    setStoredSeat(loadSeat())
    setErr(null)
    setScreen('title')
  }

  const enterRoom = (s: Seat) => {
    saveSeat(s)
    setStoredSeat(s)
    setSeat(s)
    setErr(null)
    setScreen('room')
    if (inviteCode) history.replaceState(null, '', location.pathname)
  }

  const createRoom = async (name: string) => {
    setBusy(true)
    setErr(null)
    try { enterRoom(await api.create(name, 'memento')) } catch (e) { setErr(msg(e)) } finally { setBusy(false) }
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

  const updateAi = (c: AiConfig) => {
    setAi(c)
    saveAiConfig(c)
  }

  const room = conn.room

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
          onOnline={() => { setErr(null); setScreen('online') }}
          roomCode={storedSeat?.code}
          onRejoin={() => storedSeat && enterRoom(storedSeat)}
        />
      )}
      {screen === 'setup' && <JourneySetup onStart={startJourney} onBack={() => setScreen('title')} />}
      {screen === 'journey' && journey && <Journey key={journey.runId} initial={journey} models={journeyModel} aiLabel={journeyLabel} onQuit={toTitle} />}
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
        <OnlineEntry info={info} initialCode={inviteCode} busy={busy} error={err} onCreate={createRoom} onJoin={joinRoom} onBack={toTitle} />
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
        <RoomLobby room={room} seat={seat} conn={conn} busy={busy} error={err ?? (conn.error && !conn.fatal ? `连接不稳定：${conn.error}` : null)} op={roomOp} onLeave={leaveRoom} />
      )}
      {screen === 'room' && room && seat && room.status === 'play' && <RoomJourney room={room} seat={seat} conn={conn} onLeave={leaveRoom} onQuit={toTitle} />}
      {showSettings && (
        <Settings
          config={ai}
          onChange={updateAi}
          onClose={() => setShowSettings(false)}
          builtin={{ available: !!info?.gm, enabled: builtin, onToggle: (v) => { setBuiltin(v); localStorage.setItem(BUILTIN_KEY, v ? '1' : '0') } }}
        />
      )}
    </>
  )
}
