import { createClient } from '@supabase/supabase-js'

// Which Forza! server (Supabase project) this phone talks to. The family's coach shares it with a
// setup QR code (see lib/connect.ts), so one copy of the app can serve every family. A build-time
// default (VITE_SUPABASE_URL / VITE_SUPABASE_KEY) is used until a code is scanned.
export const SERVER_KEY = 'forza.server'

interface Server {
  url: string
  key: string
}

function savedServer(): Server | null {
  try {
    const s = JSON.parse(localStorage.getItem(SERVER_KEY) ?? 'null') as Server | null
    return s?.url && s.key ? s : null
  } catch {
    return null
  }
}

const server = savedServer() ?? {
  url: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '',
  // The publishable ("anon") key is designed to be public: row-level security protects the data.
  key: (import.meta.env.VITE_SUPABASE_KEY as string | undefined) ?? '',
}

export const isConfigured = Boolean(server.url && server.key)
export const serverUrl = server.url
export const serverKey = server.key

export const supabase = createClient(server.url || 'http://localhost:54321', server.key || 'missing-key', {
  auth: {
    // Sign in once: the session is kept on the device and refreshed automatically.
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'forza.auth',
  },
})

export const functionsUrl = `${server.url}/functions/v1`
