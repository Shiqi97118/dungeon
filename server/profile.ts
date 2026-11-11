import { catalogView } from '../src/iselan/achievements/index.js'
import { reduceEvents, type AnyEvent, type Snapshot } from '../src/iselan/events/index.js'
import { loadSave, serializeSave, type SaveFile } from '../src/iselan/save.js'
import {
  LINK_CODE_TTL_MS, attributable, bareSummary, newLinkCode, noAchievements, normalizeLinkCode, openExport, responseHash, sealExport, sha256Hex,
  type AchievementJudge, type Profile, type ProfileView, type RunSummarizer, type UploadOutcome, type UploadedResponse,
} from '../src/iselan/profile/index.js'
import { HttpError, assertSameSite, fail, json, readJson } from './http.js'
import { platform, type Viewer } from './platform.js'
import { RECEIPT_RETAIN_MS, type ProfileStore } from './profileStore.js'

const ATTEMPTS_PER_DAY = 20
const LINK_CODES_PER_DAY = 20
const PROFILES_PER_IP_DAY = 30
const MAX_SAVE_CHARS = 1_000_000
const MAX_RESPONSES = 2_000

let rules: { judge: AchievementJudge; summarize: RunSummarizer } = { judge: noAchievements, summarize: bareSummary }

/** Achievement rules (ACH-01) and the ending summary (UI-02) register here at startup. */
export function configureProfileRules(next: Partial<typeof rules>) {
  rules = { ...rules, ...next }
}

const randomId = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('')
const randomKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Only a per-browser id or a sign-in can own a profile; an IP address is shared by too many people. */
async function deviceHash(v: Viewer) {
  if (v.sub.startsWith('ip:')) throw new HttpError(400, '需要浏览器编号才能使用档案，请允许本站保存本地数据')
  return sha256Hex(`${v.stage}\n${v.sub}`)
}

const cleanName = (v: unknown) =>
  typeof v === 'string' ? Array.from(Array.from(v).filter((ch) => ch.charCodeAt(0) >= 32).join('').trim()).slice(0, 16).join('') : ''

async function view(store: ProfileStore, profile: Profile): Promise<ProfileView> {
  const [unlocks, runs, save] = await Promise.all([store.unlocks(profile.id), store.runs(profile.id), store.getSave(profile.id)])
  return { profile, unlocks, runs, save: save?.meta ?? null }
}

/** The profile for this browser, created on first visit (12 §10.2). */
async function ensureProfile(store: ProfileStore, v: Viewer, now: number) {
  const dev = await deviceHash(v)
  const found = await store.profileByDevice(dev)
  if (found) return { profile: found, dev }
  if (v.ip && !(await store.countAttempt(`create:${v.ip}`, PROFILES_PER_IP_DAY, now))) throw new HttpError(429, '今天这个网络新建的档案太多了，明天再试')
  const profile: Profile = { id: randomId(16), displayName: cleanName(v.name) || '旅人', createdAt: now }
  await store.createProfile(profile, dev)
  return { profile, dev }
}

function soloSave(raw: unknown): { save: SaveFile; snapshot: Snapshot } {
  if (typeof raw !== 'string' || raw.length > MAX_SAVE_CHARS) throw new HttpError(400, '存档缺失或过大')
  const r = loadSave(raw)
  if (r.status === 'outdated') throw new HttpError(400, r.message)
  if (r.status === 'corrupt') throw new HttpError(400, `存档无法读取：${r.problems.slice(0, 3).join('；')}`)
  if (r.snapshot.mode !== 'solo') throw new HttpError(400, '只有单人局存档可以上传；联机局由房间服务端直接判定')
  return { save: r.save, snapshot: r.snapshot }
}

function cleanResponses(raw: unknown): UploadedResponse[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > MAX_RESPONSES) throw new HttpError(400, 'AI 回应列表格式错误')
  const seen = new Set<number>()
  return raw.map((x) => {
    const r = x as Partial<UploadedResponse> | null
    if (!r || !Number.isInteger(r.seq) || (r.seq as number) < 0 || typeof r.text !== 'string' || seen.has(r.seq as number)) {
      throw new HttpError(400, 'AI 回应列表格式错误')
    }
    seen.add(r.seq as number)
    return { seq: r.seq as number, text: r.text }
  })
}

/**
 * 12 §8.4: every AI response in the run must match a receipt written when the server returned it,
 * no older than 30 days. A run with no AI responses at all has nothing the server vouched for.
 */
export async function verifyResponses(
  store: ProfileStore,
  runId: string,
  responses: readonly UploadedResponse[],
  now: number,
  events: readonly AnyEvent[] = [],
): Promise<string | null> {
  if (!responses.length) return '这一局没有 AI 回执，无法验证'
  const have = new Set(responses.map((r) => r.seq))
  for (const e of events) {
    const seq = /^ai:(\d+)$/.exec(e.sourceIntentId ?? '')?.[1]
    if (seq !== undefined && !have.has(Number(seq))) return `事件 ${e.seq} 来自第 ${seq} 条 AI 回应，但存档里没有这条回应`
  }
  for (const r of responses) {
    const receipt = await store.receipt(runId, r.seq)
    if (!receipt) return `第 ${r.seq} 条 AI 回应没有回执`
    if (now - receipt.createdAt > RECEIPT_RETAIN_MS) return '回执已超过 30 天'
    if (receipt.hash !== (await responseHash(r.text))) return `第 ${r.seq} 条 AI 回应与回执不符`
  }
  return null
}

/**
 * Judges a replayed run and stores each achievement once per profile. `earned` is everything the
 * run achieved (for the ending page); `unlocked` only what this profile did not have yet.
 */
async function unlockEarned(store: ProfileStore, profileId: string, runId: string, s: Snapshot, events: readonly AnyEvent[], now: number) {
  const earned: string[] = []
  const unlocked: string[] = []
  for (const e of attributable(rules.judge(s, events), events)) {
    earned.push(e.achievementId)
    if (await store.unlock(profileId, { achievementId: e.achievementId, runId, eventId: e.eventId, unlockedAt: now, notified: false })) {
      unlocked.push(e.achievementId)
    }
  }
  return { earned, unlocked }
}

/**
 * 12 §10.3: online runs are judged by the room server on its own committed log, with no upload
 * and no receipts. The room calls this once per participating profile (UI-02).
 */
export async function judgeRoomRun(store: ProfileStore, profileId: string, runId: string, events: readonly AnyEvent[], now = Date.now()) {
  return unlockEarned(store, profileId, runId, reduceEvents(runId, events), events, now)
}

async function uploadRun(store: ProfileStore, profile: Profile, body: Record<string, unknown>, now: number): Promise<UploadOutcome & { earned: readonly string[] }> {
  const { save, snapshot: s } = soloSave(body.save)
  const owner = await store.runOwner(save.runId)
  if (owner && owner !== profile.id) throw new HttpError(409, '这一局已经属于另一份档案')
  const responses = cleanResponses(body.responses ?? save.aiResponses)
  const problem = await verifyResponses(store, save.runId, responses, now, save.events)
  const result = problem ? null : await unlockEarned(store, profile.id, save.runId, s, save.events, now)
  if (s.ending) {
    await store.putRun(profile.id, { runId: save.runId, directionId: s.ending.directionId, ...rules.summarize(s, save.events), endedAt: now, verified: !problem })
  }
  return result ? { verified: true, ...result } : { verified: false, reason: problem ?? '', unlocked: [], earned: [] }
}

async function importFile(store: ProfileStore, raw: unknown, dev: string, now: number) {
  if (typeof raw !== 'string' || raw.length > MAX_SAVE_CHARS) throw new HttpError(400, '档案文件缺失或过大')
  const opened = await openExport(raw)
  if (!opened.ok) throw new HttpError(400, opened.problem)
  const f = opened.file
  const owner = await store.profileByExportKey(await sha256Hex(f.restoreKey))
  const profile = owner === f.profile.id ? await store.getProfile(owner) : null
  if (!profile) throw new HttpError(400, '档案文件无效或已被改动')
  // The file is only a key and a copy: every unlock and record in it must already be on the server.
  const [unlocks, runs] = await Promise.all([store.unlocks(profile.id), store.runs(profile.id)])
  const okUnlocks = f.unlocks.every((u) => unlocks.some((x) => x.achievementId === u.achievementId && x.runId === u.runId && x.eventId === u.eventId))
  const okRuns = f.runs.every((r) => runs.some((x) => x.runId === r.runId && x.verified === r.verified && x.directionId === r.directionId))
  if (!okUnlocks || !okRuns) throw new HttpError(400, '档案文件与服务端记录不一致，已拒绝')
  await store.bindDevice(dev, profile.id, now)
  return profile
}

export async function handleProfile(request: Request): Promise<Response> {
  try {
    const p = platform()
    const store = p.profiles?.() ?? null
    if (!store) return json({ error: '档案服务暂不可用' }, 503)
    const v = await p.viewer(request)
    if (v instanceof Response) return v
    const now = Date.now()

    if (request.method === 'GET') {
      const { profile } = await ensureProfile(store, v, now)
      return json(await view(store, profile))
    }
    if (request.method !== 'POST') throw new HttpError(405, '不支持的请求方法')
    assertSameSite(request)
    const body = await readJson(request, MAX_SAVE_CHARS + 200_000)
    const { profile, dev } = await ensureProfile(store, v, now)

    switch (body.op) {
      case 'rename': {
        const name = cleanName(body.name)
        if (!name) throw new HttpError(400, '名字不能为空')
        await store.renameProfile(profile.id, name)
        return json(await view(store, { ...profile, displayName: name }))
      }
      case 'link_create': {
        if (!(await store.countAttempt(`link:${profile.id}`, LINK_CODES_PER_DAY, now))) throw new HttpError(429, '今天生成的绑定码太多了，明天再试')
        const code = newLinkCode()
        const expiresAt = now + LINK_CODE_TTL_MS
        await store.putLinkCode(await sha256Hex(code), profile.id, expiresAt)
        return json({ code, expiresAt })
      }
      case 'link_redeem': {
        if (!(await store.countAttempt(`redeem:${dev}`, ATTEMPTS_PER_DAY, now))) throw new HttpError(429, '尝试次数太多，明天再试')
        const code = normalizeLinkCode(body.code)
        const target = code ? await store.redeemLinkCode(await sha256Hex(code), now) : null
        const linked = target ? await store.getProfile(target) : null
        if (!linked) throw new HttpError(400, '绑定码无效、已用过或已过期')
        await store.bindDevice(dev, linked.id, now)
        return json(await view(store, linked))
      }
      case 'export': {
        const restoreKey = randomKey()
        await store.putExportKey(await sha256Hex(restoreKey), profile.id, now)
        const [unlocks, runs] = await Promise.all([store.unlocks(profile.id), store.runs(profile.id)])
        return json(await sealExport({ exportedAt: now, profile, unlocks, runs, restoreKey }))
      }
      case 'import': {
        if (!(await store.countAttempt(`redeem:${dev}`, ATTEMPTS_PER_DAY, now))) throw new HttpError(429, '尝试次数太多，明天再试')
        return json(await view(store, await importFile(store, body.file, dev, now)))
      }
      case 'save_put': {
        const { save } = soloSave(body.save)
        const meta = { runId: save.runId, version: save.version, updatedAt: now }
        await store.putSave(profile.id, meta, serializeSave(save))
        return json({ save: meta })
      }
      case 'save_get': {
        const saved = await store.getSave(profile.id)
        return json({ save: saved?.data ?? null, meta: saved?.meta ?? null })
      }
      case 'upload_run': {
        const outcome = await uploadRun(store, profile, body, now)
        const v = await view(store, profile)
        return json({ ...outcome, profile: v, achievements: catalogView(v.unlocks) })
      }
      case 'achievements':
        return json(catalogView(await store.unlocks(profile.id)))
      case 'notified': {
        const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 100) : []
        await store.markNotified(profile.id, ids)
        return json(await view(store, profile))
      }
      default:
        throw new HttpError(400, '未知操作')
    }
  } catch (e) {
    if (e instanceof Response) return e
    return fail(e)
  }
}
