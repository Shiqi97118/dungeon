import data from '../../../docs/product/narrative-v1/data/achievements.v1.json' with { type: 'json' }
import type { AchievementDef } from './types'

/** Server only: the full catalog, secret names and descriptions included. Its shape is checked by achievements.test.ts. */
export const CATALOG = data.achievements as unknown as readonly AchievementDef[]

/** 12 §6.1: the achievements v1 judges; the other 40 show 后续版本开放. */
export const V1_ACHIEVEMENTS: readonly string[] = ['ST01', 'ST02', 'ST03', 'ST05', 'ST11', 'RE01', 'RE03', 'SB01', 'SB02', 'LG07']
