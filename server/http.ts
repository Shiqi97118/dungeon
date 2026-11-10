export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** State-changing requests must come from our own page: a custom header forces a CORS preflight we never grant. */
export function assertSameSite(request: Request) {
  if (request.headers.get('x-echo-client') !== '1') throw new HttpError(403, '请求来源无效')
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, '请求来源无效')
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) throw new HttpError(415, '需要 JSON')
}

export async function readJson(request: Request, limit: number): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (text.length > limit) throw new HttpError(413, '请求过大')
  try {
    const v = JSON.parse(text)
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('bad')
    return v as Record<string, unknown>
  } catch {
    throw new HttpError(400, '请求格式错误')
  }
}

export function fail(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status)
  console.error('echo-well api error:', (e as Error)?.message ?? 'unknown')
  return json({ error: '服务器出了点问题，请稍后再试' }, 500)
}
