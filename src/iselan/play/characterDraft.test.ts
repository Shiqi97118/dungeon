import { describe, expect, it } from 'vitest'
import { customCharacter, parseCharacterDraft, randomCharacterDraft, specialtyBonus } from './characterDraft'
import { loadTable, saveTable } from './persist'
import { soloMember } from './pregens'
import { openTable, roll } from './table'

describe('Grayport character cards', () => {
  it('generates complete legal cards and keeps names distinct after the pool is used up', () => {
    const names: string[] = []
    for (let i = 0; i < 16; i++) {
      const draft = randomCharacterDraft(names, () => 0)
      expect(parseCharacterDraft(draft)).toEqual(draft)
      expect(names).not.toContain(draft.name)
      names.push(draft.name)
    }
    expect(names.slice(-4)).toEqual(['无名', '无名·2', '无名·3', '无名·4'])
  })

  it('preserves an edited card in a real save and applies its specialty once per check', async () => {
    const draft = {
      ...randomCharacterDraft([], () => 0),
      name: '灰港巡查员',
      stats: { str: -1, dex: 0, ins: 1, soc: 2 },
      specialties: ['侦察员', '记述者'] as const,
    }
    const card = parseCharacterDraft(draft)!
    const t = openTable({ runId: 'custom', seed: 'card', party: [soloMember(customCharacter(card, 'custom-test'))], openingHook: 'memento' })
    const loaded = loadTable(saveTable(t))
    expect(loaded.status).toBe('ok')
    if (loaded.status !== 'ok') throw Error('Could not load card')
    expect(loaded.table.party[0].draft).toEqual(card)
    expect(specialtyBonus(card, 'ins')).toBe(1)
    expect(specialtyBonus(card, 'soc')).toBe(0)
    const next = await roll({
      ...loaded.table,
      pending: { kind: 'check', seatId: 's1', text: '观察桌上的铜扣', request: { skill: '洞察', difficulty: 12, reason: '找到线索' }, stat: 'ins', intents: ['调查'] },
    }, null, {}, [4, 4])
    expect(next.screens.findLast((x) => x.kind === 'roll')?.paragraphs[1]).toContain('4 + 4 + 1 + 1（专长） = 10')
  })
})
