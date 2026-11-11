/** 32-bit string hash (xmur3 finaliser) for seeding. */
function hash(text: string): number {
  let h = 1779033703 ^ text.length
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

export type Rng = () => number

/**
 * Deterministic generator for one decision: the run seed plus a purpose label (and e.g. the
 * round) so separate draws never share a stream and replays give the same numbers.
 */
export function rngFor(seed: string, ...salt: (string | number)[]): Rng {
  let a = hash([seed, ...salt].join('|'))
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Weighted draw without replacement; weights must be positive. */
export function drawWeighted<T>(items: readonly { readonly item: T; readonly weight: number }[], count: number, rng: Rng): T[] {
  const pool = [...items]
  const out: T[] = []
  while (out.length < count && pool.length) {
    const total = pool.reduce((n, x) => n + x.weight, 0)
    let r = rng() * total
    let i = 0
    while (i < pool.length - 1 && (r -= pool[i].weight) >= 0) i++
    out.push(pool[i].item)
    pool.splice(i, 1)
  }
  return out
}
