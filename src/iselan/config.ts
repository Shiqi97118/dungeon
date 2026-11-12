// Every tunable number of the 灰港 slice (docs/story/12-开工规格.md §7, plus §3–§10 where
// noted). Game and server code read these instead of writing the numbers inline, so
// playtest tuning only edits this file. config.test.ts keeps it in step with §7.

export const CONFIG = {
  // ---- 12 §7 ----
  /** 02 R1: effective choices every seat needs before the finale. */
  minChoicesPerSeat: 31,
  /** 02 R1a–R1b: own choices a seat joined mid-run needs, on top of the inherited count. */
  minOwnChoicesAfterJoin: 6,
  /** 02 §7: choice thresholds of depth tiers 1–3. */
  tierChoices: [40, 50, 60],
  /** 02 R2: rounds between faction-plan / clock checks. */
  clockCheckEvery: 6,
  /** 02 R3: rounds between escalations once the world crisis has started. */
  crisisEscalateEvery: 2,
  /** 02 R6: last actions in act 4; actions that push the chosen direction count double. */
  act4LastActions: { perCharacter: 1, directionPushMultiplier: 2 },
  /** 02 R7: bell hearts needed to enter the nameless city (fewer with a great-bell guide). */
  cityEntryBellHearts: { required: 3, withGreatBellGuide: 2 },
  /** 09 §3.2: soft-trigger score a text needs before it can be picked. */
  softThreshold: 3,
  /** 09 §3.4: ENV / RST / TRV texts may come back after this many rounds ... */
  reuseCooldownRounds: 20,
  /** ... and at most this many times per run. */
  reuseMaxPerRun: 2,
  /** 09 §3.3a: minimum characters on one screen. */
  screenMinChars: 180,
  /** 07 §2: length of the AI narration of an action result. */
  narrationChars: { min: 120, max: 250 },
  /** 09 §3.3a: rounds a scene lasts at least before a scene change. */
  sceneMinRounds: 2,
  /** 05 §2: recent impressions an NPC keeps. */
  recentImpressions: 3,
  /** 05 §2: rounds before a rumour reaches NPCs who were not there. */
  rumorDelayRounds: { min: 1, max: 3 },
  /** 05 §2: attitude change per event, normally and for major events. */
  attitudeDeltaMax: 1,
  majorDeltaMax: 2,
  /** 04 §2: faction relation change per event. */
  factionDeltaPerEvent: 2,
  /** 02 §9: concurrent world + regional story lines, and personal lines per character. */
  storyLinesWorldRegional: 8,
  personalPerCharacter: 2,
  /** 06: finale candidates, exclusion score, and weight = max(score, floor) + add. */
  candidateCount: 3,
  excludeAtOrBelow: -3,
  candidateWeight: { floor: 0, add: 1 },
  /** 09 §2.1: interactive moments per adventure (T1) and per core adventure (T2). */
  t1PerAdventure: { min: 1, max: 3 },
  t2PerCoreAdventure: 1,
  /** 08 §3: past rounds summarised in each AI call. */
  recentRoundsInPrompt: 6,
  /** 09 §3.4: recently used text ids listed in each AI call. */
  usedTextDigest: 30,
  /** 12 §6.3: effective actions in distinct rounds that take a project from founded to operational. */
  projectOperationalActions: 3,

  // ---- other numbers fixed by 12 ----
  /** 12 §5 */
  saveVersion: 5,
  /** 12 §3.4: distinct pieces of evidence before a dark line can be revealed. */
  darkLineRevealEvidence: 2,
  /** 12 §6.5: confirmed signals a direction other than D01 needs to become a candidate. */
  directionSignalsRequired: 1,
  /** 12 §11: a party block stops the main plan for this many rounds. */
  planBlockedRounds: 6,
  /** 12 §6.1: the slice is played only here; leaving ends the run as D01 "远行". */
  sliceRegion: 'gray_harbor',
  sliceDirections: ['D01', 'D02', 'D03', 'D07'],
  sliceInteractions: ['evidence', 'dialogue-gesture'],
  sliceAchievements: ['ST01', 'ST02', 'ST03', 'ST05', 'ST11', 'RE01', 'RE03', 'SB01', 'SB02', 'LG07'],

  // ---- pacing the table chose; not in 12, tune after playtest ----
  /**
   * Rounds between core-adventure beats. A3 must be able to finish the well before the clock
   * reaches 4 (first possible at round 4 × clockCheckEvery = 24): six beats at this gap end by round 21.
   */
  beatGapRounds: 4,
  /** Rounds per stretch of the day (dusk, night, dawn, day); equal to clockCheckEvery so a day is four checks. */
  roundsPerTimeOfDay: 6,

  /** 12 §8 */
  ai: {
    fixedPrefixTokens: 1500,
    roundTokenBudget: 2500,
    maxIntents: 2,
    maxEmotions: 1,
    suggestionCount: 3,
    parseRetries: 1,
    /** Offline host: a social action towards someone present is checked at this difficulty, ±1 attitude on the result. */
    offlineCheckDifficulty: 12,
  },

  /** 12 §9: daily AI spend. Prices in 元 per million tokens; check DeepSeek's price page before changing. */
  cost: {
    dailyBudgetYuan: 30,
    hardCapYuan: 28,
    timeZone: 'Asia/Shanghai',
    /** Weekday hours (local time, [start, end)) billed at peak price; other hours are idle price. */
    peakHours: [
      [9, 12],
      [14, 18],
    ],
    prices: {
      'deepseek-flash': {
        peak: { cacheHit: 0.04, cacheMiss: 2, output: 8 },
        idle: { cacheHit: 0.02, cacheMiss: 1, output: 4 },
      },
      'deepseek-v4-pro': {
        peak: { cacheHit: 0.3, cacheMiss: 9, output: 27 },
        idle: { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 },
      },
    },
    /** Worst case used to decide, before calling, whether the call still fits under the cap. */
    worstCase: {
      turn: { inputTokens: 4000, outputTokens: 1200 },
      ending: { inputTokens: 8000, outputTokens: 6000 },
    },
    maxOutputTokens: { turn: 1200, ending: 6000 },
    dailyLimits: { global: 1500, user: 600, ip: 1000, room: 1500, endingGlobal: 20 },
  },

  /** 12 §8.4 and §10 */
  profile: {
    linkCodeLength: 8,
    linkCodeTtlMinutes: 10,
    cloudSaveSlots: 1,
    receiptRetentionDays: 30,
  },
} as const

export type Config = typeof CONFIG
