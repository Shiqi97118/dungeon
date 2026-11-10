import { requireIdentity } from '../cursor/identity.js'
import { anonymousViewer, setPlatform } from './platform.js'
import { MemoryStore, type Store } from './store.js'
import { PgStore } from './pgStore.js'

const g = globalThis as unknown as { __echoStore?: Store | null }

const isDeployed = () => !!(process.env.VERCEL || process.env.CURSOR_APP_ID)
const isPublic = () => process.env.ECHO_PUBLIC === '1'

setPlatform({
  async viewer(request) {
    if (isPublic()) return anonymousViewer(request)
    const id = await requireIdentity(request)
    if (id instanceof Response) return id
    return {
      sub: id.sub,
      name: id.name || id.email.split('@')[0] || null,
      stage: id.stage,
      reuse: !id.simulated,
      ip: null,
      open: false,
    }
  },
  store() {
    if (g.__echoStore !== undefined) return g.__echoStore
    const url = process.env.DATABASE_URL
    g.__echoStore = url ? new PgStore(url) : isDeployed() ? null : new MemoryStore()
    return g.__echoStore
  },
})
