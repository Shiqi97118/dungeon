import { describe, expect, it } from 'vitest'
import { openTable, PREGENS, snapshotOf, soloMember } from '../../iselan/play'
import { GRAYPORT, pagesOf, statusLine } from './view'

const table = () => openTable({ runId: 'view', seed: 'view', party: [soloMember(PREGENS[0]!)], openingHook: 'memento' })

describe('journey view', () => {
  it('turns the opening into reader pages that keep every paragraph', () => {
    const t = table()
    const pages = pagesOf(t.screens)
    const shown = pages.flatMap((p) => p.paragraphs.map((x) => x.text))
    expect(shown).toEqual(t.screens.flatMap((s) => s.paragraphs))
    expect(pages.length).toBeGreaterThan(0)
  })

  it('names the speaker of dialogue texts', () => {
    const t = table()
    const dlg = t.screens.filter((s) => s.textId?.includes('-DLG-'))
    if (!dlg.length) return
    const speakers = pagesOf(dlg).flatMap((p) => p.paragraphs.map((x) => x.speaker))
    expect(speakers.every(Boolean)).toBe(true)
  })

  it('lists only Grayport places and shows where the party is', () => {
    expect(GRAYPORT.length).toBeGreaterThan(3)
    expect(GRAYPORT.some((p) => p.id === 'gray_harbor.seven_lamps')).toBe(true)
    expect(statusLine(snapshotOf(table()))).toContain('七灯')
  })
})
