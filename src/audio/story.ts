import type { Paragraph } from '../ui/reading/pages'
import { sound } from './sound'

const cast = {
  narrator: { names: /Yunxi|Yunyang|Yunjian|Kangkang/i, rate: .94, pitch: .91 },
  rosa: { names: /Xiaoyi|Huihui|HsiaoChen/i, rate: 1.02, pitch: .96 },
  ludo: { names: /Yunxi|Yunze|Kangkang/i, rate: 1.05, pitch: 1.12 },
  cedric: { names: /Yunjian|Yunyang|Kangkang/i, rate: .86, pitch: .76 },
  felix: { names: /Yunxi|Yunfeng|Kangkang/i, rate: 1.13, pitch: 1.15 },
  agatha: { names: /Xiaoxiao|Huihui/i, rate: .95, pitch: 1.05 },
  memory: { names: /Xiaoshuang|HsiaoYu|Yaoyao|Huihui/i, rate: .83, pitch: .83 },
  messenger: { names: /Yunfeng|Yunjian|Kangkang/i, rate: .93, pitch: .79 },
}

type Voice = keyof typeof cast
type Line = { voice: Voice; text: string }

const sceneCast: Readonly<Record<string, Voice>> = {
  'GH-SCN-01': 'rosa',
  'GH-SCN-09': 'cedric',
  'GH-BEAT-05': 'memory',
  'GH-BEAT-08': 'cedric',
  'GEN-BEAT-02': 'rosa',
  'GEN-BEAT-03': 'messenger',
}

const keyDialogue: readonly [string, string, Voice][] = [
  ['罗莎', '第一杯算我的', 'rosa'],
  ['卢多', '是我签的字', 'ludo'],
  ['柯德里克', '灰港早就饿死了一半', 'cedric'],
  ['菲利克斯', '比会长更高的价', 'felix'],
  ['阿佳莎', '都是用他的钱印的', 'agatha'],
]

/** Speak only text the engine has already chosen to display. */
export function linesFor(p: Paragraph): Line[] {
  const dialogue = keyDialogue.find(([name, phrase]) => p.speaker?.includes(name) && p.text.includes(phrase))
  const character = dialogue?.[2] ?? sceneCast[p.source]
  const selected = dialogue || /^(GEN-BEAT-0[1-6]|GEN-BRG-A[12]|GH-BEAT-0[4-9]|GH-SCN-(01|09))$|^GEN-END-/.test(p.source) || p.heading === '第七声'
  if (!selected) return []

  const clean = (text: string) => text.replace(/\*\*/g, '').trim()
  const quotesOnly = p.source === 'GH-SCN-01' || p.source === 'GH-SCN-09'
  const parts = character ? p.text.split(/(“[^”]+”)/g) : [p.text]
  return parts.flatMap((part) => {
    const quoted = part.startsWith('“') && part.endsWith('”')
    const text = clean(quoted ? part.slice(1, -1) : part)
    if (!/[\p{L}\p{N}]/u.test(text) || (quotesOnly && !quoted)) return []
    return [{ voice: quoted ? character! : dialogue && parts.length === 1 ? dialogue[2] : 'narrator', text }]
  })
}

export function utterance(line: Line, voices: SpeechSynthesisVoice[]) {
  const profile = cast[line.voice]
  const chinese = voices.filter((v) => /^zh(?:[-_]|$)/i.test(v.lang))
  const u = new SpeechSynthesisUtterance(line.text)
  u.lang = 'zh-CN'
  const voice = chinese.find((v) => profile.names.test(v.name)) ?? chinese.find((v) => /^zh[-_]CN$/i.test(v.lang)) ?? chinese[0]
  if (voice) {
    u.voice = voice
    u.lang = voice.lang
  }
  u.rate = profile.rate
  u.pitch = profile.pitch
  return u
}

const chords = {
  tavern: [[110, 130.81, 164.81, 246.94], [87.31, 130.81, 174.61, 220], [98, 146.83, 196, 261.63]],
  streets: [[73.42, 110, 146.83, 174.61], [65.41, 98, 130.81, 196], [82.41, 123.47, 164.81, 196]],
  well: [[55, 82.41, 130.81, 155.56], [58.27, 87.31, 116.54, 146.83]],
  ending: [[65.41, 98, 130.81, 164.81], [55, 82.41, 110, 130.81], [87.31, 130.81, 174.61, 220]],
}

export function scoreFor(place: string | null | undefined, ending: boolean): keyof typeof chords {
  if (ending) return 'ending'
  if (place?.includes('well')) return 'well'
  if (!place || place.endsWith('.seven_lamps')) return 'tavern'
  return 'streets'
}

/** Original synthesized score, controlled by the reader's performance-audio switch. */
export function startScore(theme: keyof typeof chords) {
  sound.init()
  const ctx = sound.ctx
  if (!ctx) return null

  const fade = ctx.createGain()
  const mix = ctx.createGain()
  fade.gain.value = 0
  mix.gain.value = .19
  fade.connect(mix)
  mix.connect(ctx.destination)
  fade.gain.setTargetAtTime(1, ctx.currentTime, .65)

  const progression = chords[theme]
  let step = 0
  let nextAt = ctx.currentTime + .06
  const schedule = () => {
    if (ctx.state !== 'running' && step > 0) return
    if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + .06
    while (nextAt < ctx.currentTime + .75) {
      const chord = progression[step % progression.length]
      chord.forEach((freq, i) => {
        const note = ctx.createOscillator()
        const amp = ctx.createGain()
        const start = nextAt + i * .35
        const duration = i > 1 ? 3 : 5.6
        note.type = i > 1 ? 'sine' : 'triangle'
        note.frequency.value = freq
        amp.gain.setValueAtTime(0, start)
        amp.gain.linearRampToValueAtTime(i > 1 ? .075 : .085, start + .8)
        amp.gain.linearRampToValueAtTime(0, start + duration)
        note.connect(amp)
        amp.connect(fade)
        note.start(start)
        note.stop(start + duration)
      })
      nextAt += 5
      step++
    }
  }
  schedule()
  const timer = window.setInterval(schedule, 300)
  return {
    duck(active: boolean) { mix.gain.setTargetAtTime(active ? .063 : .19, ctx.currentTime, .22) },
    stop() {
      window.clearInterval(timer)
      fade.gain.setTargetAtTime(0, ctx.currentTime, .24)
      window.setTimeout(() => { fade.disconnect(); mix.disconnect() }, 1600)
    },
  }
}
