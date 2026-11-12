/** 12 §10.2: 8 characters, no look-alikes (0/O, 1/I/L). */
export const LINK_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const LINK_CODE_LENGTH = 8
export const LINK_CODE_TTL_MS = 10 * 60_000

export function newLinkCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LINK_CODE_LENGTH * 2))
  let out = ''
  // Rejection sampling keeps every character equally likely.
  for (const b of bytes) {
    if (out.length === LINK_CODE_LENGTH) break
    if (b < 256 - (256 % LINK_CODE_ALPHABET.length)) out += LINK_CODE_ALPHABET[b % LINK_CODE_ALPHABET.length]
  }
  return out.length === LINK_CODE_LENGTH ? out : newLinkCode()
}

/** Accepts lower case, spaces and dashes as typed on a phone; null when it cannot be a code. */
export function normalizeLinkCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const c = raw.toUpperCase().replace(/[\s-]/g, '')
  if (c.length !== LINK_CODE_LENGTH) return null
  return [...c].every((ch) => LINK_CODE_ALPHABET.includes(ch)) ? c : null
}
