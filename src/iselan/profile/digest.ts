import { stableStringify } from '../events'
import { EXPORT_FORMAT, EXPORT_VERSION, type ProfileExport } from './types'

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

/** The hash stored in `gm_receipts` for one AI response (12 §8.4). Server and client must agree on it. */
export const responseHash = (text: string) => sha256Hex(text)

type ExportBody = Omit<ProfileExport, 'digest'>

export const exportDigest = (body: ExportBody) => sha256Hex(stableStringify(body))

export async function sealExport(body: Omit<ExportBody, 'format' | 'version'>): Promise<ProfileExport> {
  const full: ExportBody = { format: EXPORT_FORMAT, version: EXPORT_VERSION, ...body }
  return { ...full, digest: await exportDigest(full) }
}

/** Shape and digest check. Passing it does not make the contents true; the server still compares them with its records. */
export async function openExport(raw: string): Promise<{ ok: true; file: ProfileExport } | { ok: false; problem: string }> {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, problem: '文件不是有效的 JSON' }
  }
  const f = data as Partial<ProfileExport> | null
  if (!f || typeof f !== 'object' || f.format !== EXPORT_FORMAT) return { ok: false, problem: '不是伊瑟兰的档案文件' }
  if (f.version !== EXPORT_VERSION) return { ok: false, problem: `档案文件版本 ${String(f.version)} 无法识别` }
  if (
    typeof f.digest !== 'string' || typeof f.restoreKey !== 'string' || typeof f.exportedAt !== 'number' ||
    !f.profile || typeof f.profile.id !== 'string' || !Array.isArray(f.unlocks) || !Array.isArray(f.runs)
  ) {
    return { ok: false, problem: '档案文件缺少字段' }
  }
  const { digest, ...body } = f as ProfileExport
  if ((await exportDigest(body)) !== digest) return { ok: false, problem: '档案文件被改动过' }
  return { ok: true, file: f as ProfileExport }
}
