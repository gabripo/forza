import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
// The publishable ("anon") key is designed to be public: row-level security protects the data.
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined

export const isConfigured = Boolean(url && key)

export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key', {
  auth: {
    // Sign in once: the session is kept on the device and refreshed automatically.
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'forza.auth',
  },
})

export const functionsUrl = `${url ?? ''}/functions/v1`
