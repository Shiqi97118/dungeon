import type { BudgetStore } from './budget.js'
import type { ProfileStore } from './profileStore.js'
import type { Store } from './store.js'

export interface Viewer {
  /** Stable key for this person, used to rejoin rooms and to count quotas. */
  sub: string
  name: string | null
  /** Keeps preview data apart from production data on hosts that have both. */
  stage: string
  /** Whether `sub` is trustworthy enough to hand a returning player their old seat. */
  reuse: boolean
  ip: string | null
  /** Anyone on the internet can reach this deployment, so global spending caps apply. */
  open: boolean
}

export interface Platform {
  viewer(request: Request): Promise<Viewer | Response>
  store(): Store | null
  /** 12 §10 profiles; null where the host has no database for them. */
  profiles?(): ProfileStore | null
  /** 12 §9.3 spending ledger; null where the host has no shared database for it. */
  budget?(): BudgetStore | null
}

const g = globalThis as unknown as { __echoPlatform?: Platform }

export function setPlatform(p: Platform) {
  g.__echoPlatform = p
}

export function platform(): Platform {
  if (!g.__echoPlatform) throw new Error('platform not configured')
  return g.__echoPlatform
}

const UID = /^[A-Za-z0-9_-]{16,64}$/

/** For public deployments without sign-in: each browser keeps a random id, and quotas also count per IP. */
export function anonymousViewer(request: Request): Viewer {
  const h = request.headers
  const ip = h.get('cf-connecting-ip') ?? h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const uid = h.get('x-echo-uid') ?? ''
  const ok = UID.test(uid)
  return { sub: ok ? `anon:${uid}` : `ip:${ip ?? 'unknown'}`, name: null, stage: 'production', reuse: ok, ip, open: true }
}
