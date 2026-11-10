type Amb = 'rain' | 'cave' | 'water' | 'crystal' | 'core' | 'none'

export const BELL_FREQS = [220, 261.63, 293.66, 329.63, 392, 440]

class SoundEngine {
  ctx: AudioContext | null = null
  master!: GainNode
  fx!: GainNode
  amb!: GainNode
  echoIn!: GainNode
  muted = false
  private layers: { stop: () => void }[] = []
  private current: Amb = 'none'
  private pressure = 1
  private noiseBuf: AudioBuffer | null = null
  private dripTimer: number | null = null

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.9
    this.master.connect(this.ctx.destination)
    this.fx = this.ctx.createGain()
    this.fx.gain.value = 0.8
    this.fx.connect(this.master)
    this.amb = this.ctx.createGain()
    this.amb.gain.value = 0.5
    this.amb.connect(this.master)

    this.echoIn = this.ctx.createGain()
    const delay = this.ctx.createDelay(2)
    delay.delayTime.value = 0.42
    const fb = this.ctx.createGain()
    fb.gain.value = 0.38
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2200
    this.echoIn.connect(delay)
    delay.connect(lp)
    lp.connect(fb)
    fb.connect(delay)
    lp.connect(this.fx)

    const len = this.ctx.sampleRate * 2
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noiseBuf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      last = (last + 0.02 * w) / 1.02
      data[i] = w * 0.5 + last * 3
    }
    if (this.current !== 'none') {
      const c = this.current
      this.current = 'none'
      this.setAmbience(c, this.pressure)
    }
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.2)
  }

  private noise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    return src
  }

  setAmbience(kind: Amb, pressure: number) {
    this.pressure = pressure
    if (!this.ctx) { this.current = kind; return }
    if (kind === this.current) { this.updatePressure(); return }
    this.current = kind
    const t = this.ctx.currentTime
    for (const l of this.layers) l.stop()
    this.layers = []
    if (this.dripTimer) { clearInterval(this.dripTimer); this.dripTimer = null }
    if (kind === 'none') return

    const bus = this.ctx.createGain()
    bus.gain.value = 0
    bus.gain.setTargetAtTime(1, t, 1.2)
    bus.connect(this.amb)
    const nodes: AudioScheduledSourceNode[] = []

    const drone = (freq: number, gain: number, cutoff: number) => {
      const g = this.ctx!.createGain()
      g.gain.value = gain
      const f = this.ctx!.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = cutoff
      for (const det of [-7, 6]) {
        const o = this.ctx!.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = freq
        o.detune.value = det
        o.connect(f)
        o.start()
        nodes.push(o)
      }
      const lfo = this.ctx!.createOscillator()
      lfo.frequency.value = 0.07
      const lg = this.ctx!.createGain()
      lg.gain.value = cutoff * 0.4
      lfo.connect(lg)
      lg.connect(f.frequency)
      lfo.start()
      nodes.push(lfo)
      f.connect(g)
      g.connect(bus)
      return g
    }

    if (kind === 'rain') {
      const n = this.noise()
      const f = this.ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 1400
      const g = this.ctx.createGain()
      g.gain.value = 0.32
      n.connect(f); f.connect(g); g.connect(bus)
      n.start(); nodes.push(n)
      const n2 = this.noise()
      const hp = this.ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 5000
      const g2 = this.ctx.createGain()
      g2.gain.value = 0.05
      n2.connect(hp); hp.connect(g2); g2.connect(bus)
      n2.start(0, 0.7); nodes.push(n2)
      drone(55, 0.05, 180)
    } else {
      const base = kind === 'core' ? 41.2 : kind === 'crystal' ? 82.4 : 55
      drone(base, kind === 'core' ? 0.12 : 0.08, kind === 'crystal' ? 500 : 220)
      if (kind === 'water') {
        const n = this.noise()
        const bp = this.ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = 600
        bp.Q.value = 0.6
        const g = this.ctx.createGain()
        g.gain.value = 0.12
        n.connect(bp); bp.connect(g); g.connect(bus)
        n.start(); nodes.push(n)
      }
      if (kind === 'crystal' || kind === 'core') {
        const freqs = kind === 'crystal' ? [1318.5, 1975.5, 2637] : [329.6, 493.9, 659.3]
        for (const fq of freqs) {
          const o = this.ctx.createOscillator()
          o.type = 'sine'
          o.frequency.value = fq
          const g = this.ctx.createGain()
          g.gain.value = 0
          const lfo = this.ctx.createOscillator()
          lfo.frequency.value = 0.05 + Math.random() * 0.12
          const lg = this.ctx.createGain()
          lg.gain.value = kind === 'crystal' ? 0.012 : 0.02
          lfo.connect(lg); lg.connect(g.gain)
          o.connect(g); g.connect(bus)
          o.start(); lfo.start()
          nodes.push(o, lfo)
        }
      }
      this.dripTimer = window.setInterval(() => {
        if (Math.random() < 0.45) this.drip()
      }, 1700)
    }

    this.layers.push({
      stop: () => {
        const now = this.ctx!.currentTime
        bus.gain.setTargetAtTime(0, now, 0.6)
        setTimeout(() => { nodes.forEach((n) => { try { n.stop() } catch { /* already stopped */ } }); bus.disconnect() }, 3000)
      },
    })
    this.updatePressure()
  }

  private updatePressure() {
    if (!this.ctx) return
    this.amb.gain.setTargetAtTime(0.4 + this.pressure * 0.07, this.ctx.currentTime, 1)
  }

  private drip() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator()
    o.type = 'sine'
    const f0 = 900 + Math.random() * 1400
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.12)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
    o.connect(g); g.connect(this.amb); g.connect(this.echoIn)
    o.start(t); o.stop(t + 0.3)
  }

  bell(freq: number, vol = 0.35) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const partials = [[1, 1, 4], [2.0, 0.5, 2.8], [2.76, 0.35, 2.2], [5.4, 0.18, 1.2], [8.93, 0.08, 0.7], [0.5, 0.25, 5]]
    const out = this.ctx.createGain()
    out.gain.value = vol
    out.connect(this.fx)
    out.connect(this.echoIn)
    for (const [ratio, amp, dur] of partials) {
      const o = this.ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = freq * ratio
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(amp, t + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g); g.connect(out)
      o.start(t); o.stop(t + dur + 0.1)
    }
  }

  dice() {
    if (!this.ctx) return
    const t0 = this.ctx.currentTime
    for (let i = 0; i < 7; i++) {
      const t = t0 + i * 0.07 + Math.random() * 0.04
      const n = this.noise()
      const bp = this.ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 1800 + Math.random() * 2400
      bp.Q.value = 6
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.5 * (1 - i / 9), t + 0.003)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
      n.connect(bp); bp.connect(g); g.connect(this.fx)
      n.start(t, Math.random()); n.stop(t + 0.06)
    }
  }

  land(tier: 'hit' | 'partial' | 'miss') {
    if (!this.ctx) return
    if (tier === 'hit') { this.bell(523.25, 0.25); setTimeout(() => this.bell(783.99, 0.2), 120) }
    else if (tier === 'partial') this.bell(392, 0.25)
    else this.thump()
  }

  chime() {
    if (!this.ctx) return
    ;[659.25, 987.77, 1318.5].forEach((f, i) => setTimeout(() => this.bell(f, 0.12), i * 90))
  }

  thump() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(90, t)
    o.frequency.exponentialRampToValueAtTime(32, t + 0.9)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4)
    o.connect(g); g.connect(this.fx); g.connect(this.echoIn)
    o.start(t); o.stop(t + 1.5)
    this.whisper(0.6)
  }

  whisper(vol = 0.3) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const n = this.noise()
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 8
    bp.frequency.setValueAtTime(700, t)
    bp.frequency.linearRampToValueAtTime(2400, t + 1.6)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(vol * 0.25, t + 0.9)
    g.gain.linearRampToValueAtTime(0.0001, t + 2)
    n.connect(bp); bp.connect(g); g.connect(this.fx); g.connect(this.echoIn)
    n.start(t, Math.random()); n.stop(t + 2.1)
  }

  click() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.value = 1400
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
    o.connect(g); g.connect(this.fx)
    o.start(t); o.stop(t + 0.08)
  }
}

export const sound = new SoundEngine()
