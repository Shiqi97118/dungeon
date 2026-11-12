import { createSave, loadSave, serializeSave, type LoadResult, type SaveFile } from '../save'
import { snapshotOf, type Table } from './table'

/** Save v5 with the table's presentation alongside the log. */
export function tableSaveFile(t: Table): SaveFile {
  const s = snapshotOf(t)
  const { runId, events, responses, ...view } = t
  return createSave({ runId, seed: s.seed, createdAt: events[0]?.committedAt ?? '', events, aiResponses: responses, table: view })
}

/** Written after every decision. */
export const saveTable = (t: Table): string => serializeSave(tableSaveFile(t))

export type TableLoad = { readonly status: 'ok'; readonly table: Table } | Exclude<LoadResult, { status: 'ok' }>

const isArray = (x: unknown): x is unknown[] => Array.isArray(x)

/** The rules state always comes from replaying the log; the stored view only restores the screens and turn. */
export function loadTable(raw: string): TableLoad {
  const r = loadSave(raw)
  if (r.status !== 'ok') return r
  const v = r.save.table
  const problems: string[] = []
  if (!v) problems.push('存档里没有桌面记录')
  else {
    for (const k of ['party', 'screens', 'suggestions', 'gaps', 'recent', 'checkpoints'] as const) if (!isArray(v[k])) problems.push(`桌面记录缺少 ${k}`)
    if (!Number.isInteger(v.turn) || !Number.isInteger(v.n)) problems.push('桌面记录的轮次编号错误')
    if (isArray(v.party) && Number.isInteger(v.turn) && !(Number(v.turn) >= 0 && Number(v.turn) < v.party.length)) problems.push('当前席位超出队伍')
    if (isArray(v.checkpoints) && v.checkpoints.some((c) => !c || typeof c !== 'object' || Number((c as { events?: unknown }).events) > r.save.events.length)) problems.push('回退点超出事件日志')
  }
  if (problems.length) return { status: 'corrupt', problems }
  const table = { ...(v as unknown as Omit<Table, 'runId' | 'events' | 'responses'>), runId: r.save.runId, events: r.save.events, responses: r.save.aiResponses ?? [] }
  return { status: 'ok', table }
}

const toBase64 = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** A shared table as gzip in base64: a long run is mostly repeated text and packs about twentyfold. */
export async function packTable(t: Table): Promise<string> {
  const stream = new Blob([saveTable(t)]).stream().pipeThrough(new CompressionStream('gzip'))
  return toBase64(new Uint8Array(await new Response(stream).arrayBuffer()))
}

/** `trusted` skips replaying the log for checks: only for a table the server packed itself. */
export async function unpackTable(packed: string, trusted = false): Promise<TableLoad> {
  const bytes = Uint8Array.from(atob(packed), (c) => c.charCodeAt(0))
  const raw = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
  if (!trusted) return loadTable(raw)
  const save = JSON.parse(raw) as SaveFile
  return { status: 'ok', table: { ...(save.table as unknown as Omit<Table, 'runId' | 'events' | 'responses'>), runId: save.runId, events: save.events, responses: save.aiResponses ?? [] } }
}
