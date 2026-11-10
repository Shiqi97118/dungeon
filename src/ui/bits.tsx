import type { Character } from '../game/types'

export const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`)

export function Sigil({ c, size = 40 }: { c: Pick<Character, 'sigil' | 'hue' | 'name'>; size?: number }) {
  return (
    <div className="sigil" style={{ width: size, height: size, fontSize: size * 0.46, ['--hue' as string]: c.hue }} aria-label={c.name}>
      {c.sigil}
    </div>
  )
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
}

export function Die({ value, rolling, size = 64, tone }: { value: number; rolling?: boolean; size?: number; tone?: string }) {
  return (
    <svg className={`die ${rolling ? 'rolling' : 'landed'} ${tone ?? ''}`} width={size} height={size} viewBox="0 0 100 100">
      <rect x="4" y="4" width="92" height="92" rx="18" className="die-body" />
      {PIPS[value]?.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="8.5" className="die-pip" />)}
    </svg>
  )
}

export function Boxes({ n, max, kind }: { n: number; max: number; kind: 'stress' | 'adv' }) {
  return (
    <span className={`boxes ${kind}`}>
      {Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}
    </span>
  )
}
