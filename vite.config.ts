import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

const ROUTES: Record<string, [string, string]> = {
  '/api/room': ['/server/rooms.ts', 'handleRoom'],
  '/api/gm': ['/server/gmProxy.ts', 'handleGm'],
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks)
  return new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, { method: req.method, headers, body })
}

function devApi(): Plugin {
  return {
    name: 'echo-well-dev-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const path = (req.url ?? '').split('?')[0]
        const route = ROUTES[path]
        if (!route) return next()
        try {
          const mod = await server.ssrLoadModule(route[0])
          const out: Response = await mod[route[1]](await toRequest(req))
          res.statusCode = out.status
          out.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await out.arrayBuffer()))
        } catch (e) {
          res.statusCode = 500
          res.end(String((e as Error).message))
        }
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), devApi()],
})
