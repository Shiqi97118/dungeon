import { useEffect, useRef } from 'react'

type Mode = 'rain' | 'dust' | 'crystal' | 'core'

export default function Atmosphere({ mode, intensity = 1 }: { mode: Mode; intensity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const cfg = useRef({ mode, intensity })
  cfg.current = { mode, intensity }

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, raf = 0
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)
    type P = { x: number; y: number; v: number; l: number; a: number; s: number; ph: number }
    const ps: P[] = Array.from({ length: 220 }, () => spawn(true))
    function spawn(initial = false): P {
      return {
        x: Math.random() * (w || 1200),
        y: initial ? Math.random() * (h || 800) : -20,
        v: 0.4 + Math.random(),
        l: 8 + Math.random() * 18,
        a: 0.1 + Math.random() * 0.35,
        s: 0.5 + Math.random() * 2.2,
        ph: Math.random() * Math.PI * 2,
      }
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let t = 0
    const tick = () => {
      t += 1
      const { mode: m, intensity: k } = cfg.current
      ctx.clearRect(0, 0, w, h)
      const count = m === 'rain' ? 220 : Math.round(60 + 20 * k)
      for (let i = 0; i < count; i++) {
        const p = ps[i]
        if (m === 'rain') {
          p.y += p.v * 14
          p.x -= p.v * 2.2
          if (p.y > h + 20 || p.x < -20) Object.assign(p, spawn(), { x: Math.random() * (w + 200) })
          ctx.strokeStyle = `rgba(190,210,230,${p.a * 0.55})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x + p.l * 0.16, p.y - p.l)
          ctx.stroke()
        } else {
          p.y -= p.v * 0.18
          p.x += Math.sin(t * 0.004 + p.ph) * 0.25
          if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w }
          const tw = 0.5 + 0.5 * Math.sin(t * 0.02 + p.ph)
          const col = m === 'crystal' ? '220,235,255' : m === 'core' ? '120,230,220' : '230,190,140'
          ctx.fillStyle = `rgba(${col},${p.a * tw * (m === 'dust' ? 0.5 : 0.8)})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.s * (m === 'dust' ? 0.8 : 1), 0, Math.PI * 2)
          ctx.fill()
        }
      }
      if (!reduce) raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} className="atmo" aria-hidden />
}
