import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { getProfile, loadExercises, updateProfile, CATALOGUE } from './data'
import { useI18n } from './i18n'
import { supabase } from './supabase'
import type { Exercise, Profile } from './types'
import { flushOutbox } from './workout'

interface AppState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  exercises: Map<string, Exercise>
  saveProfile: (patch: Partial<Profile>) => Promise<void>
  refreshExercises: () => Promise<void>
  signOut: () => Promise<void>
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const { setLocale } = useI18n()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [exercises, setExercises] = useState(() => new Map(CATALOGUE.map((e) => [e.id, e])))

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setLoading(false)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void (async () => {
      try {
        const p = await getProfile(userId)
        if (cancelled) return
        setProfile(p)
        if (p?.onboarded_at) setLocale(p.locale)
      } finally {
        if (!cancelled) setLoading(false)
      }
      loadExercises().then((m) => !cancelled && setExercises(m)).catch(() => {})
      void flushOutbox()
    })()
    return () => {
      cancelled = true
    }
  }, [userId, setLocale])

  // Upload workouts saved while offline as soon as the connection is back.
  useEffect(() => {
    const onOnline = () => void flushOutbox()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  const saveProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (!userId) return
      const p = await updateProfile(userId, patch)
      setProfile(p)
      if (patch.locale) setLocale(patch.locale)
    },
    [userId, setLocale],
  )

  const refreshExercises = useCallback(async () => {
    setExercises(await loadExercises())
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <AppContext.Provider value={{ session, profile, loading, exercises, saveProfile, refreshExercises, signOut }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp outside AppProvider')
  return ctx
}
