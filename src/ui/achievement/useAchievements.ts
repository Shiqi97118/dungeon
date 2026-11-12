import { useCallback, useEffect, useState } from 'react'
import type { CatalogView } from '../../iselan/achievements/types'
import { profileApi } from '../../net/profile'
import { withNotified } from './toastQueue'

/** Optional hook for screens that show the gallery or toasts; UI-02 decides where to mount it. */
export function useAchievements() {
  const [view, setView] = useState<CatalogView | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    profileApi.achievements().then(setView, (e: Error) => setError(e.message))
  }, [])
  useEffect(refresh, [refresh])

  const markNotified = useCallback((ids: readonly string[]) => {
    setView((v) => (v ? withNotified(v, ids) : v))
    profileApi.markNotified(ids).catch((e: Error) => setError(e.message))
  }, [])

  return { view, error, setView, refresh, markNotified }
}
