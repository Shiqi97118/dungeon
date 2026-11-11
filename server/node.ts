import { requireIdentity } from '../cursor/identity.js'
import { anonymousViewer, setPlatform } from './platform.js'
import { MemoryStore, type Store } from './store.js'
import { PgStore } from './pgStore.js'
import { MemoryProfileStore, type ProfileStore } from './profileStore.js'
import { configureProfileRules } from './profile.js'
import { judgeAchievements } from '../src/iselan/achievements/index.js'

configureProfileRules({ judge: judgeAchievements })

const g = globalThis as unknown as { __echoStore?: Store | null; __echoProfiles?: ProfileStore | null }

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
  // Profiles live in D1 on the Cloudflare deployment; Node hosts only get them for local development.
  profiles() {
    if (g.__echoProfiles === undefined) g.__echoProfiles = isDeployed() ? null : new MemoryProfileStore()
    return g.__echoProfiles
  },
})
