import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api, type RoomView, type Seat } from './api'

export interface RoomConn {
  room: RoomView | null
  presence: Record<string, number>
  skew: number
  error: string | null
  fatal: boolean
  refresh: () => void
}

export function useRoom(seat: Seat | null): RoomConn {
  const [room, setRoom] = useState<RoomView | null>(null)
  const [presence, setPresence] = useState<Record<string, number>>({})
  const [skew, setSkew] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [fatal, setFatal] = useState(false)
  const version = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const inflight = useRef(false)
  const again = useRef(false)

  const poll = useCallback(async () => {
    if (!seat) return
    if (inflight.current) { again.current = true; return }
    inflight.current = true
    window.clearTimeout(timer.current)
    try {
      const r = await api.poll(seat, version.current)
      setPresence(r.presence)
      setSkew(r.now - Date.now())
      if (r.room) {
        version.current = r.room.version
        setRoom(r.room)
      }
      setError(null)
    } catch (e) {
      const err = e as ApiError
      setError(err.message)
      if (err.status === 403 || err.status === 404) setFatal(true)
    } finally {
      inflight.current = false
      const wait = again.current ? 0 : document.hidden ? 5000 : 1100
      again.current = false
      timer.current = window.setTimeout(poll, wait)
    }
  }, [seat])

  useEffect(() => {
    version.current = 0
    setRoom(null)
    setFatal(false)
    if (!seat) return
    poll()
    const onVis = () => { if (!document.hidden) poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [seat, poll])

  return { room, presence, skew, error, fatal, refresh: poll }
}

export const ONLINE_MS = 45_000

export function isOnline(presence: Record<string, number>, pid: string, skew: number) {
  return (presence[pid] ?? 0) > Date.now() + skew - ONLINE_MS
}

/** Mirrors the server's seat-control rule so the UI only offers moves the server will accept. */
export function canControl(room: RoomView, presence: Record<string, number>, skew: number, pid: string, charId: string | null) {
  if (!charId) return true
  const owner = room.players.find((p) => p.seats.includes(charId))
  if (owner?.id === pid) return true
  if (owner && isOnline(presence, owner.id, skew)) return false
  if (room.hostId === pid) return true
  return !isOnline(presence, room.hostId, skew)
}

export function controllerName(room: RoomView, presence: Record<string, number>, skew: number, charId: string | null) {
  if (!charId) return undefined
  const owner = room.players.find((p) => p.seats.includes(charId))
  if (owner && isOnline(presence, owner.id, skew)) return owner.name
  return room.players.find((p) => p.id === room.hostId)?.name
}
