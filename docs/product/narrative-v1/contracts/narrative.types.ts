/** 伊瑟兰叙事/成就协议草案；不是已集成的现有游戏代码。 */
export type AchievementCategory = 'ST' | 'RE' | 'EX' | 'SB' | 'LG'
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type Visibility = 'public' | 'hint' | 'secret'
export type AchievementScope = 'run' | 'character' | 'party'
export type JsonScalar = string | number | boolean | null
export type Where = Record<string, JsonScalar>

export type AchievementRule =
  | { op: 'event'; type: string; where: Where }
  | { op: 'count'; type: string; min: number; distinctBy?: string; where: Where }
  | { op: 'all' | 'any'; rules: AchievementRule[] }

export interface AchievementDefinition {
  id: string // e.g. ST01
  name: string
  description: string
  flavor: string
  category: AchievementCategory
  categoryName: string
  rarity: Rarity
  visibility: Visibility
  hint: string
  scope: AchievementScope
  iconKey: string
  icon: string // Local allowlisted URI; not an arbitrary URL
  png: string
  rule: AchievementRule
  reward: { kind: 'gallery_badge' | 'title' | 'profile_frame' | 'chronicle_card'; value: string }
  version: number
}

export interface CanonicalEvent {
  schemaVersion: 1
  eventId: string
  runId: string
  seq: number  // strictly ascending inside run
  type: string
  actorIds: string[]
  accountIds: string[]
  partyId: string | null
  regionId?: string
  subjectId?: string
  payload: Record<string, JsonScalar | JsonScalar[]>
  sourceIntentId: string
  committedAt: string // ISO 8601
  visibility: 'public' | 'party' | 'private'
}

export interface UnlockRecord {
  id: string
  achievementId: string
  accountId: string
  runId: string
  actorId?: string
  sourceEventIds: string[]
  unlockedAt: string
  verified: boolean
  /** UI queued by id; duplicate delivery must not reopen toast. */
  notificationState: 'new' | 'shown' | 'acknowledged'
}

export interface RunAchievementRecord {
  runId: string
  achievementId: string
  actorId?: string
  sourceEventIds: string[]
  achievedAt: string
}

export interface NarrativeEntity {
  id: string
  type: 'person' | 'faction' | 'region' | 'player_project' | 'place' | 'object'
  status: string
  lastSourceEventId: string
}
export interface BeliefRecord {
  beliefId: string
  position: string
  evidenceEventIds: string[]
  changedAt?: string
}
export interface PersonKnowledge {
  observerId: string
  factIds: string[]
  rumorIds: string[]
  observedAtSeq: number
}
export interface PlayerProject {
  id: string
  creatorActorIds: string[]
  kind: 'tavern' | 'guild' | 'caravan' | 'sanctuary' | 'home' | 'custom'
  description: string
  regionId: string
  stage: 'idea' | 'founded' | 'operational' | 'stable' | 'closed'
  memberIds: string[]
  resources: Record<string, number>
  eventIds: string[]
}
export interface ChronicleEntry {
  id: string
  runId: string
  title: string
  summary: string
  eventIds: string[] // required sources for story assertions
  actorIds: string[]
  impact: 'personal' | 'regional' | 'world'
  visibility: 'private' | 'party' | 'public'
  generated: boolean
  reviewed: boolean
}

export type InteractionTemplate =
  | 'memory-assembly' | 'resonance' | 'mechanism' | 'evidence'
  | 'dialogue-gesture' | 'crisis-action'
export interface NarrativeInteraction {
  interactionInstanceId: string
  runId: string
  actorId: string
  template: InteractionTemplate
  sourceTextId: string
  sceneId: string
  seed: string
  phase: 'offered' | 'active' | 'resolved' | 'cancelled'
  publicPrompt: string
  allowedOutcomeIds: string[]
  accessibleAlternative: string
  /** Resolution validated by server/engine, not trusted from client. */
  committedOutcomeId?: string
  version: number
}

/** Server output to unearned profiles must not include secret name/rule/iconPath. */
export type PublicAchievement = Pick<AchievementDefinition,
  'id' | 'category' | 'categoryName' | 'rarity' | 'visibility' | 'scope' | 'version'> & {
  name: string // '???' for secret
  description: string
  icon: string // LOCKED.svg for secret
}

/** Design-only function signatures; future implementation must add auth, replay and test validation. */
export interface NarrativeRulesPort {
  validateProposal(proposal: unknown, runId: string): Promise<CanonicalEvent[]>
  commitEvents(runId: string, expectedVersion: number, events: CanonicalEvent[]): Promise<void>
  evaluateAchievements(runId: string, actorId?: string): Promise<UnlockRecord[]>
  getPublicAchievements(accountId: string): Promise<PublicAchievement[]>
}
