import { describe, expect, it } from 'vitest'
import { linesFor, scoreFor } from './story'

describe('Grayport performance cues', () => {
  it('reads the opening and ending text actually shown, but leaves routine text silent', () => {
    expect(linesFor({ source: 'GEN-BEAT-01', text: '今夜，灰港下着暴雨。' }))
      .toEqual([{ voice: 'narrator', text: '今夜，灰港下着暴雨。' }])
    expect(linesFor({ source: 'ai', text: '酒馆里挤满了人。' })).toEqual([])
    expect(linesFor({ source: 'ai', heading: '第七声', text: '雨终于停了。' }))
      .toEqual([{ voice: 'narrator', text: '雨终于停了。' }])
  })

  it('gives critical dialogue its character voice and omits routine lines', () => {
    expect(linesFor({ source: 'GH-SCN-01', text: '罗莎说那是“给第七声留的”。' }))
      .toEqual([{ voice: 'rosa', text: '给第七声留的' }])
    expect(linesFor({ source: 'GH-DLG-卢多·费恩', speaker: '卢多·费恩', text: '“**她交出去的那七段——是我签的字。**”' }))
      .toEqual([{ voice: 'ludo', text: '她交出去的那七段——是我签的字。' }])
    expect(linesFor({ source: 'GH-DLG-卢多·费恩', speaker: '卢多·费恩', text: '你们来得真早。' })).toEqual([])
  })

  it('changes themes by location and resolves to the ending theme', () => {
    expect(scoreFor('gray_harbor.seven_lamps', false)).toBe('tavern')
    expect(scoreFor('gray_harbor.docks', false)).toBe('streets')
    expect(scoreFor('gray_harbor.tide_well', false)).toBe('well')
    expect(scoreFor('gray_harbor.tide_well', true)).toBe('ending')
  })
})
