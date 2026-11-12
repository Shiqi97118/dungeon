import type { CatalogView } from '../iselan/achievements/types'
import type { CloudSaveMeta, ProfileExport, ProfileView, UploadOutcome, UploadedResponse } from '../iselan/profile'
import { serializeSave, type SaveFile } from '../iselan/save'
import { call, post } from './api'

const PATH = 'api/profile'

/** 12 §10: this browser's profile, created on first call. */
export const profileApi = {
  me: () => call<ProfileView>(PATH),
  rename: (name: string) => post<ProfileView>(PATH, { op: 'rename', name }),
  /** 8 characters, valid for 10 minutes, usable once. */
  createLinkCode: () => post<{ code: string; expiresAt: number }>(PATH, { op: 'link_create' }),
  redeemLinkCode: (code: string) => post<ProfileView>(PATH, { op: 'link_redeem', code }),
  exportFile: async () => JSON.stringify(await post<ProfileExport>(PATH, { op: 'export' }), null, 2),
  importFile: (file: string) => post<ProfileView>(PATH, { op: 'import', file }),
  putSave: (save: SaveFile) => post<{ save: CloudSaveMeta }>(PATH, { op: 'save_put', save: serializeSave(save) }),
  /** The raw save text; pass it to `loadSave`. */
  getSave: () => post<{ save: string | null; meta: CloudSaveMeta | null }>(PATH, { op: 'save_get' }),
  /**
   * Single-player runs only: the server checks receipts, replays the log and decides the unlocks.
   * `earned` is everything this run achieved, including achievements the profile already had.
   */
  uploadRun: (save: SaveFile, responses: readonly UploadedResponse[] = save.aiResponses ?? []) =>
    post<UploadOutcome & { earned: readonly string[]; profile: ProfileView; achievements: CatalogView }>(PATH, { op: 'upload_run', save: serializeSave(save), responses }),
  /** The gallery, with locked hint and secret achievements already redacted by the server. */
  achievements: () => post<CatalogView>(PATH, { op: 'achievements' }),
  markNotified: (achievementIds: readonly string[]) => post<ProfileView>(PATH, { op: 'notified', ids: achievementIds }),
}
