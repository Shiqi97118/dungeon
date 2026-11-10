import { useCallback, useEffect, useReducer, useState } from 'react'
import type { Character, GameState } from './game/types'
import { SAVE_VERSION, newGame, reduce, type GameAction } from './game/engine'
import { sound } from './audio/sound'
import { loadAiConfig, saveAiConfig, type AiConfig } from './game/ai'
import Title from './ui/Title'
import Setup from './ui/Setup'
import Game from './ui/Game'
import Ending from './ui/Ending'
import Settings from './ui/Settings'

const SAVE_KEY = 'echo-well-save'

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

type Screen = 'title' | 'setup' | 'game'

function gameReducer(s: GameState | null, a: GameAction | { type: 'new'; state: GameState } | { type: 'clear' }): GameState | null {
  if (a.type === 'new') return a.state
  if (a.type === 'clear') return null
  if (!s) return s
  return reduce(s, a)
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('title')
  const [state, dispatchRaw] = useReducer(gameReducer, null)
  const [saved, setSaved] = useState<GameState | null>(() => loadSave())
  const [muted, setMuted] = useState(() => localStorage.getItem('echo-well-muted') === '1')
  const [ai, setAi] = useState<AiConfig>(() => loadAiConfig())
  const [showSettings, setShowSettings] = useState(false)

  const dispatch = useCallback((a: GameAction) => dispatchRaw(a), [])

  useEffect(() => {
    if (state && screen === 'game') {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state))
    }
  }, [state, screen])

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
    if (screen === 'title' || screen === 'setup') sound.setAmbience('rain', 1)
  }, [screen])

  const start = (party: Character[], safety: GameState['safety']) => {
    dispatchRaw({ type: 'new', state: newGame(party, safety) })
    setScreen('game')
  }

  const resume = () => {
    if (!saved) return
    dispatchRaw({ type: 'new', state: saved })
    setScreen('game')
  }

  const quit = () => {
    setSaved(loadSave())
    setScreen('title')
  }

  const restart = () => {
    localStorage.removeItem(SAVE_KEY)
    setSaved(null)
    dispatchRaw({ type: 'clear' })
    setScreen('setup')
  }

  const updateAi = (c: AiConfig) => {
    setAi(c)
    saveAiConfig(c)
  }

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
          aiOn={ai.enabled && !!ai.apiKey}
        />
      )}
      {screen === 'setup' && <Setup onStart={start} onBack={() => setScreen('title')} />}
      {screen === 'game' && state && state.phase === 'play' && (
        <Game
          state={state}
          dispatch={dispatch}
          ai={ai}
          muted={muted}
          onMute={() => setMuted(!muted)}
          onSettings={() => setShowSettings(true)}
          onQuit={quit}
        />
      )}
      {screen === 'game' && state && state.phase === 'ending' && (
        <Ending state={state} dispatch={dispatch} onRestart={restart} onTitle={quit} />
      )}
      {showSettings && <Settings config={ai} onChange={updateAi} onClose={() => setShowSettings(false)} />}
    </>
  )
}
