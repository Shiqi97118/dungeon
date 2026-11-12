import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PREGENS, makeCharacter } from '../src/game/data/characters.js'
import { availableActions } from '../src/game/engine.js'
import type { GameState } from '../src/game/types.js'
import './node.js'
import { handleRoom } from './rooms.js'

type Json = Record<string, unknown>
const g = globalThis as unknown as { __echoStore?: unknown }

async function call(method: 'GET' | 'POST', body?: Json, token?: string, query = ''): Promise<{ status: number; data: Json }> {
  const headers: Record<string, string> = { 'x-echo-client': '1', 'content-type': 'application/json' }
  if (token) headers['x-echo-token'] = token
  const res = await handleRoom(new Request(`http://localhost/api/room${query}`, { method, headers, body: body ? JSON.stringify(body) : undefined }))
  return { status: res.status, data: (await res.json()) as Json }
}

const party = ['helan', 'qilan'].map((id) => makeCharacter(PREGENS.find((p) => p.id === id)!))
const solo = party.slice(0, 1)

async function poll(code: string, token: string) {
  const r = await call('GET', undefined, token, `?code=${code}&v=0`)
  return r.data.room as { state: GameState; players: { id: string; seats: string[] }[]; hostId: string; status: string }
}

function suite(name: string, url: string | undefined) {
  describe.skipIf(name === 'postgres' && !url)(`room api (${name})`, () => {
    beforeEach(() => {
      g.__echoStore = undefined
      if (url) process.env.DATABASE_URL = url
      else delete process.env.DATABASE_URL
    })
    afterEach(() => { vi.useRealTimers() })
    afterAll(() => { delete process.env.DATABASE_URL; g.__echoStore = undefined })

    it('creates, joins, claims seats and enforces turn order', async () => {
      const info = await call('GET')
      expect(info.data.online).toBe(true)

      const bad = await handleRoom(new Request('http://localhost/api/room', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"op":"create"}' }))
      expect(bad.status).toBe(403)

      const created = await call('POST', { op: 'create', name: '阿岚', party, safety: {} })
      expect(created.status).toBe(200)
      const host = created.data as { code: string; pid: string; token: string }
      const joined = (await call('POST', { op: 'join', code: host.code, name: '小周' })).data as { pid: string; token: string }
      expect(joined.pid).not.toBe(host.pid)

      expect((await call('GET', undefined, 'nope', `?code=${host.code}`)).status).toBe(403)

      let room = await poll(host.code, host.token)
      expect(room.status).toBe('lobby')
      expect(room.state.turns?.activeId).toBeTruthy()
      expect(JSON.stringify(room)).not.toContain('tokenHash')

      expect((await call('POST', { op: 'claim', code: host.code, charId: 'helan' }, host.token)).status).toBe(200)
      expect((await call('POST', { op: 'claim', code: host.code, charId: 'helan' }, joined.token)).status).toBe(409)
      expect((await call('POST', { op: 'claim', code: host.code, charId: 'qilan' }, joined.token)).status).toBe(200)
      expect((await call('POST', { op: 'start', code: host.code }, joined.token)).status).toBe(403)
      expect((await call('POST', { op: 'start', code: host.code }, host.token)).status).toBe(200)
      await poll(host.code, joined.token)

      room = await poll(host.code, host.token)
      const active = room.state.turns!.activeId!
      const [mine, theirs] = active === 'helan' ? [host, joined] : [joined, host]
      const wrong = await call('POST', { op: 'act', code: host.code, intent: { t: 'perform', id: 'gate_enter' } }, theirs.token)
      expect(wrong.status).toBe(403)
      const right = await call('POST', { op: 'act', code: host.code, intent: { t: 'perform', id: 'gate_enter' } }, mine.token)
      expect(right.status).toBe(200)

      room = await poll(host.code, host.token)
      expect(room.state.location).toBe('A')
      const next = room.state.turns!.activeId!
      const nextSeat = next === 'helan' ? host : joined
      const rollAct = availableActions(room.state).find((a) => a.roll)!
      const start = await call('POST', { op: 'act', code: host.code, intent: { t: 'rollStart', kind: 'action', id: rollAct.id, actorId: next, boost: { kind: 'none' } } }, nextSeat.token)
      expect(start.status).toBe(200)
      room = await poll(host.code, host.token)
      expect(room.state.rolling?.dice.length).toBe(2)
      expect((await call('POST', { op: 'act', code: host.code, intent: { t: 'rollCommit' } }, nextSeat.token)).status).toBe(200)

      expect((await call('POST', { op: 'chat', code: host.code, text: '先去宿舍？' }, joined.token)).status).toBe(200)
      const after = (await call('GET', undefined, host.token, `?code=${host.code}&v=0`)).data.room as { chat: { text: string }[] }
      expect(after.chat.some((m) => m.text === '先去宿舍？')).toBe(true)

      expect((await call('POST', { op: 'leave', code: host.code }, host.token)).status).toBe(200)
      const final = await poll(host.code, joined.token)
      expect(final.hostId).toBe(joined.pid)
    })

    it('runs free actions through the server-side AI host', async () => {
      const realFetch = globalThis.fetch
      process.env.OPENAI_API_KEY = 'test-key'
      process.env.GM_BASE_URL = 'https://api.deepseek.com'
      let calls = 0
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const u = String(input)
        if (!u.startsWith('https://api.deepseek.com/')) return realFetch(input, init)
        calls++
        expect(JSON.parse(String(init?.body)).messages[1].content).toContain('当前行动者')
        const content = JSON.stringify({ narration: '井壁回应了你的敲击。「再敲一次。」', roll: null, effects: { pressure: 0, conds: [{ charId: 'helan', id: 'focus' }] } })
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }) as typeof fetch
      try {
        const host = (await call('POST', { op: 'create', name: 'x', party: solo, safety: {} })).data as { code: string; token: string }
        await call('POST', { op: 'claim', code: host.code, charId: 'helan' }, host.token)
        await call('POST', { op: 'start', code: host.code }, host.token)
        const before = await call('GET', undefined, host.token, `?code=${host.code}&v=0`)
        const r = await call('POST', { op: 'act', code: host.code, intent: { t: 'free', text: '敲击井壁' } }, host.token)
        expect(r.status).toBe(200)
        expect(r.data.version).toBe((before.data.version as number) + 2)
        const room = await poll(host.code, host.token)
        expect(calls).toBe(1)
        expect(room.state.log.some((e) => e.kind === 'ai' && e.text.includes('井壁'))).toBe(true)
        expect(room.state.thinking).toBeNull()
      } finally {
        globalThis.fetch = realFetch
        delete process.env.OPENAI_API_KEY
        delete process.env.GM_BASE_URL
      }
    })

    it('gives each player one seat and lets companions play the rest at a watchable pace', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const host = (await call('POST', { op: 'create', name: '阿岚', party, safety: {} })).data as { code: string; pid: string; token: string }
      await call('POST', { op: 'claim', code: host.code, charId: 'qilan' }, host.token)
      await call('POST', { op: 'claim', code: host.code, charId: 'helan' }, host.token)
      let room = await poll(host.code, host.token)
      expect(room.players[0].seats).toEqual(['helan'])
      await call('POST', { op: 'start', code: host.code }, host.token)

      let mine = 0
      let theirs = 0
      for (let i = 0; i < 120 && theirs < 4; i++) {
        vi.setSystemTime(Date.now() + 3000)
        room = await poll(host.code, host.token)
        const st = room.state
        if (st.turns?.activeId === 'qilan' && !st.queue.length && !st.rolling) {
          expect((await call('POST', { op: 'act', code: host.code, intent: { t: 'pass' } }, host.token)).status).toBe(403)
        }
        if (st.turns?.activeId === 'helan' && !st.queue.length && !st.rolling && !st.rollReq) {
          const r = await call('POST', { op: 'act', code: host.code, intent: { t: 'pass' } }, host.token)
          expect(r.status).toBe(200)
          mine++
        }
        theirs = st.log.filter((e) => e.kind === 'player' && e.speaker === '祁岚').length
      }
      expect(mine).toBeGreaterThan(0)
      expect(theirs).toBeGreaterThan(0)

      const before = await call('GET', undefined, host.token, `?code=${host.code}&v=0`)
      const again = await call('GET', undefined, host.token, `?code=${host.code}&v=0`)
      expect(again.data.version).toBe(before.data.version)
    })

    it('rejects malformed parties and intents', async () => {
      expect((await call('POST', { op: 'create', name: 'x', party: [], safety: {} })).status).toBe(400)
      const host = (await call('POST', { op: 'create', name: 'x', party, safety: {} })).data as { code: string; token: string }
      await call('POST', { op: 'start', code: host.code }, host.token)
      expect((await call('POST', { op: 'act', code: host.code, intent: { t: 'ai', narration: 'hack' } }, host.token)).status).toBe(400)
      expect((await call('POST', { op: 'act', code: host.code, intent: { t: 'roll', id: 'x', dice: [6, 6] } }, host.token)).status).toBe(400)
    })
  })
}

suite('memory', undefined)
suite('postgres', process.env.TEST_DATABASE_URL)
