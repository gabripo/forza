// Signs a phone in again with its own device key (see migration 20261126000001_device_keys.sql), when the server
// has ended its usual sign-in. The answer is a one-time sign-in token, used at once by the app (verifyOtp), as with
// the setup codes made by Forza! Coach.
//
// Body (JSON): { key }   → { token_hash } | 401 { error: 'unknown_key' }
import { adminClient, corsHeaders, json, sha256Hex } from '../_shared/util.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let key = ''
  try {
    key = String(((await req.json()) as { key?: unknown }).key ?? '')
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!/^fd_[0-9a-f]{64}$/.test(key)) return json({ error: 'unknown_key' }, 401)

  const admin = adminClient()
  const hash = await sha256Hex(key)
  const { data: found } = await admin.from('device_keys').select('user_id').eq('key_hash', hash).maybeSingle()
  if (!found) return json({ error: 'unknown_key' }, 401)

  const { data: who, error } = await admin.auth.admin.getUserById(found.user_id)
  if (error || !who.user?.email) return json({ error: 'unknown_key' }, 401)
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: who.user.email })
  if (link.error) return json({ error: 'server' }, 500)

  await admin.from('device_keys').update({ used_at: new Date().toISOString() }).eq('key_hash', hash)
  return json({ token_hash: link.data.properties.hashed_token })
})
