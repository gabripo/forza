import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { finishPendingSignIn } from './connect'
import { getProfile, loadExercises, updateProfile, CATALOGUE } from './data'
import { forgetDevice, hasDeviceKey, rememberDevice, signInAgain } from './deviceKey'
import { useI18n } from './i18n'
import { supabase } from './supabase'
import type { Exercise, Profile } from './types'
import { flushOutbox } from './workout'

interface AppState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  /** A setup code that could not sign in (expired or already used). */
  connectError: 'expired' | null
  exercises: Map<string, Exercise>
  saveProfile: (patch: Partial<Profile>) => Promise<void>
  /** Reads the profile again (for values that Forza! Coach or the phone helper change). */
  refreshProfile: () => Promise<void>
  refreshExercises: () => Promise<void>
  signOut: () => Promise<void>
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const { setLocale } = useI18n()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [connectError, setConnectError] = useState<'expired' | null>(null)
  const [exercises, setExercises] = useState(() => new Map(CATALOGUE.map((e) => [e.id, e])))

  useEffect(() => {
    // Signed out by the server, not by the person (see lib/deviceKey.ts): the phone signs in again with its own key,
    // the sign-in screen is shown only if that cannot work. Returns false when there is nothing to try.
    let retrying = false
    const signedOutByServer = () => {
      // While it tries, the client's own "signed out" news changes nothing on screen.
      if (retrying) return true
      if (!hasDeviceKey()) return false
      retrying = true
      setLoading(true)
      // Outside the sign-in event: the client must not be called back from inside it.
      window.setTimeout(() => {
        void signInAgain()
          .catch(() => 'offline' as const)
          .then((result) => {
            retrying = false
            if (result === 'done') return
            setSession(null)
            setProfile(null)
            setLoading(false)
          })
      }, 0)
      return true
    }

    // Finish a setup-code sign-in started before the app reloaded on the new server.
    void finishPendingSignIn()
      .then((err) => setConnectError(err))
      .then(() => supabase.auth.getSession())
      .then(({ data }) => {
        if (data.session) setSession(data.session)
        else if (!signedOutByServer()) setLoading(false)
      })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!s && signedOutByServer()) return
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
      void rememberDevice(userId).catch(() => {})
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

  const refreshProfile = useCallback(async () => {
    if (!userId) return
    const p = await getProfile(userId)
    if (p) setProfile(p)
  }, [userId])

  const refreshExercises = useCallback(async () => {
    setExercises(await loadExercises())
  }, [])

  // "Sign out from this phone": the other phones stay signed in, this one's key stops working.
  const signOut = useCallback(async () => {
    await forgetDevice()
    await supabase.auth.signOut({ scope: 'local' })
  }, [])

  return (
    <AppContext.Provider value={{ session, profile, loading, connectError, exercises, saveProfile, refreshProfile, refreshExercises, signOut }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp outside AppProvider')
  return ctx
}
