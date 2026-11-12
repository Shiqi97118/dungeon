import type { DirectionId } from '../data'

/** 12 §10.3 `profiles`. */
export interface Profile {
  readonly id: string
  readonly displayName: string
  readonly createdAt: number
}

/** 12 §10.3 `unlocks`; `(profileId, achievementId)` is unique. */
export interface UnlockRecord {
  readonly achievementId: string
  readonly runId: string
  readonly eventId: string
  readonly unlockedAt: number
  readonly notified: boolean
}

/** 12 §10.3 `run_records`: one row per finished run, owned by the profile that first uploaded it. */
export interface RunRecord {
  readonly runId: string
  readonly directionId: DirectionId | null
  /** Three-axis ending summary (06 §6); filled by the ending page (UI-02). */
  readonly axes: Readonly<Record<string, string>> | null
  readonly chronicle: readonly string[]
  readonly endedAt: number
  /** Every AI response in the log matched a server receipt (12 §8.4). */
  readonly verified: boolean
}

export interface CloudSaveMeta {
  readonly runId: string
  readonly version: number
  readonly updatedAt: number
}

export interface ProfileView {
  readonly profile: Profile
  readonly unlocks: readonly UnlockRecord[]
  readonly runs: readonly RunRecord[]
  readonly save: CloudSaveMeta | null
}

export const EXPORT_FORMAT = 'iselan-profile'
export const EXPORT_VERSION = 1

/** 12 §10.2 backup file. `restoreKey` lets a new device rejoin the profile; `digest` covers everything else. */
export interface ProfileExport {
  readonly format: typeof EXPORT_FORMAT
  readonly version: typeof EXPORT_VERSION
  readonly exportedAt: number
  readonly profile: Profile
  readonly unlocks: readonly UnlockRecord[]
  readonly runs: readonly RunRecord[]
  readonly restoreKey: string
  readonly digest: string
}

/** An AI response as the client kept it, for the server to hash and match against `gm_receipts`. */
export interface UploadedResponse {
  readonly seq: number
  readonly text: string
}

export type UploadOutcome =
  | { readonly verified: true; readonly unlocked: readonly string[] }
  | { readonly verified: false; readonly reason: string; readonly unlocked: readonly [] }
