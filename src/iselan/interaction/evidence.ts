import type { InteractionId } from '../data/vocab.generated'

/** A spot on the evidence. Layout belongs to the UI; this is only what the spot means. */
export interface Hotspot {
  readonly id: string
  readonly label: string
  /** What the party reads once the spot is inspected. */
  readonly detail: string
  /** Needed to complete; the others are colour. */
  readonly key: boolean
  /** Too small to read until the page is zoomed. */
  readonly needsZoom: boolean
}

export interface EvidenceDef {
  readonly template: Extract<InteractionId, 'evidence'>
  readonly textId: string
  readonly title: string
  readonly publicPrompt: string
  readonly hotspots: readonly Hotspot[]
  /** Skip settles as an ordinary check (`12` §6 交互). */
  readonly skipCheck: { readonly skill: string; readonly difficulty: number; readonly reason: string }
}

/** GH-BEAT-04: every finding restates the BEAT's own lines, so inspecting never reveals more than the text. */
export const LEDGER: EvidenceDef = {
  template: 'evidence',
  textId: 'GH-BEAT-04',
  title: '菲利克斯的账本',
  publicPrompt: '账本摊开在桌上。哪几处不对劲？',
  hotspots: [
    { id: 'columns', label: '表头', detail: '日期、姓名、住址、“收取量”——整整齐齐，像一本普通的进货账。', key: false, needsZoom: false },
    { id: 'unit', label: '收取量的单位', detail: '收取量用的单位很奇怪——“段”。', key: true, needsZoom: false },
    { id: 'lastRow', label: '最后一行', detail: '最近一页的最后一行，是一个你们认识的名字。', key: false, needsZoom: false },
    { id: 'seven', label: '七段', detail: '名字后面跟着一个数字：七段。', key: true, needsZoom: false },
    { id: 'margin', label: '页边小字', detail: '页边有一行后来补上的小字：“本月市场预言准确率：九成。”', key: true, needsZoom: true },
  ],
  skipCheck: { skill: '洞察', difficulty: 12, reason: '不细看账本，凭经验判断哪里不对' },
}

export const keyHotspots = (def: EvidenceDef): string[] => def.hotspots.filter((h) => h.key).map((h) => h.id)

export function missingKeys(def: EvidenceDef, inspected: readonly string[]): string[] {
  const seen = new Set(inspected)
  return keyHotspots(def).filter((id) => !seen.has(id))
}
