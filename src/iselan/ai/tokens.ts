/**
 * Rough token count for budgeting (12 §8.1). DeepSeek's tokenizer is not available in the
 * browser; Han characters and full-width punctuation are counted as one token each and other
 * text as one token per three characters, which over-counts slightly and so stays inside budget.
 */
export function estimateTokens(text: string): number {
  let wide = 0
  let narrow = 0
  for (const ch of text) {
    if (/[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch)) wide++
    else narrow++
  }
  return wide + Math.ceil(narrow / 3)
}

/** Cuts `text` so that it fits in `tokens`, at a line break when one is near. */
export function clipToTokens(text: string, tokens: number): string {
  if (estimateTokens(text) <= tokens) return text
  const chars = [...text]
  let lo = 0
  let hi = chars.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (estimateTokens(chars.slice(0, mid).join('')) <= tokens - 1) lo = mid
    else hi = mid - 1
  }
  const cut = chars.slice(0, lo).join('')
  const nl = cut.lastIndexOf('\n')
  return `${nl > cut.length * 0.6 ? cut.slice(0, nl) : cut}…`
}
