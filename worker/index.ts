import { anonymousViewer, setPlatform } from '../server/platform.js'
import { D1Store } from '../server/d1Store.js'
import { handleRoom } from '../server/rooms.js'
import { handleGm } from '../server/gmProxy.js'
import { json } from '../server/http.js'

let store: D1Store | null = null
let db: D1Database | null | undefined = null

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (db !== env.DB) {
      db = env.DB
      // Previews have no D1 binding (wrangler.jsonc `previews`).
      store = env.DB ? new D1Store(env.DB) : null
    }
    setPlatform({ viewer: async (r) => anonymousViewer(r), store: () => store })
    const { pathname } = new URL(request.url)
    if (pathname === '/api/room') return handleRoom(request)
    if (pathname === '/api/gm') return handleGm(request)
    if (pathname.startsWith('/api/')) return json({ error: '不存在的接口' }, 404)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
