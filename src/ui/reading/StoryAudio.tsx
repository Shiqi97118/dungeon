import { useEffect, useMemo, useRef, useState } from 'react'
import { linesFor, startScore, utterance, type scoreFor } from '../../audio/story'
import type { Paragraph } from './pages'
import './storyAudio.css'

type Theme = ReturnType<typeof scoreFor>

export default function StoryAudio({ paragraphs, theme, batch, muted }: {
  paragraphs?: readonly Paragraph[]
  theme: Theme
  batch: string | number
  muted: boolean
}) {
  const [enabled, setEnabled] = useState(!muted)
  const [playing, setPlaying] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const spoken = useRef(new Set<string>())
  const active = useRef<SpeechSynthesisUtterance | null>(null)
  const score = useRef<ReturnType<typeof startScore>>(null)
  const synth = typeof window === 'undefined' ? undefined : window.speechSynthesis
  const cues = useMemo(() => (paragraphs ?? []).flatMap((p) => {
    const lines = linesFor(p)
    return lines.length ? [{ key: p.source + '\n' + p.text, lines }] : []
  }), [paragraphs])

  useEffect(() => {
    if (!enabled) return
    const music = startScore(theme)
    score.current = music
    music?.duck(!!active.current)
    return () => { score.current = null; music?.stop() }
  }, [enabled, theme])

  useEffect(() => {
    spoken.current.clear()
    setPlaying(false)
    return () => {
      if (active.current) {
        active.current = null
        synth?.cancel()
      }
      score.current?.duck(false)
    }
  }, [batch, synth])

  const nextCue = cues.find((cue) => !spoken.current.has(cue.key))

  const play = () => {
    if (!synth || !nextCue || active.current) return
    const cue = nextCue
    const voices = synth.getVoices()
    const finish = () => {
      active.current = null
      score.current?.duck(false)
      setPlaying(false)
    }
    const say = (index: number) => {
      const line = cue.lines[index]
      if (!line) {
        spoken.current.add(cue.key)
        finish()
        return
      }
      const u = utterance(line, voices)
      active.current = u
      u.onend = () => { if (active.current === u) say(index + 1) }
      u.onerror = () => {
        if (active.current !== u) return
        setBlocked(true)
        finish()
      }
      synth.speak(u)
    }
    score.current?.duck(true)
    setPlaying(true)
    say(0)
  }

  // A page change makes another cue eligible but never cancels the active paragraph.
  useEffect(() => {
    if (enabled && !playing && !blocked) play()
  }, [enabled, playing, blocked, nextCue])

  const toggle = () => {
    if (enabled) {
      if (active.current) {
        active.current = null
        synth?.cancel()
      }
      setPlaying(false)
    } else {
      setBlocked(false)
      play()
    }
    setEnabled(!enabled)
  }

  return (
    <div className="rd-audio">
      <button type="button" className="btn ghost small" onClick={toggle}>{enabled ? '关闭演出声音' : '开启演出声音'}</button>
      {enabled && blocked && nextCue && <button type="button" className="btn ghost small" onClick={() => { setBlocked(false); play() }}>播放配音</button>}
    </div>
  )
}
