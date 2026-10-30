// Weigh-ins from a CSV file (EufyLife's export and others) into Forza!, from Forza! Coach. A file can hold
// the whole family (EufyLife exports every member): each member is matched to a person.
import { parseWeightCsv, sameName } from '../../shared/weight-csv.mjs'

const SAME_WEIGH_IN_MS = 2 * 60_000
const MAX_TEXT = 5_000_000

function check({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

const bad = (message) => Object.assign(new Error(message), { status: 400 })

function read(text) {
  if (typeof text !== 'string' || !text.trim()) throw bad('The file is empty')
  if (text.length > MAX_TEXT) throw bad('The file is too large (up to 5 MB)')
  const parsed = parseWeightCsv(text)
  if (parsed.error === 'columns') throw bad('No date and weight columns found in this file')
  if (parsed.error) throw bad('No weigh-ins found in this file')
  return parsed
}

/** Who is in the file, how many weigh-ins each, and the person each one probably is. */
export function previewWeights(text, people) {
  const { rows, members } = read(text)
  const groups = members.length ? members : [null]
  return {
    members: groups.map((member) => {
      const mine = rows.filter((r) => r.member === member)
      const person = member ? people.find((p) => sameName(p.name, member)) : null
      return { member, count: mine.length, withFat: mine.filter((r) => r.body_fat_pct != null).length, from: mine[0]?.measured_at ?? null, to: mine.at(-1)?.measured_at ?? null, person: person?.id ?? null }
    }),
  }
}

/**
 * Imports the weigh-ins of each member into the person chosen for it ({ member: userId }; "" is the member of a
 * file without names). A weigh-in already in Forza! within 2 minutes (synced from the phone, typed in, or a
 * file imported before) is skipped, so importing twice adds nothing.
 */
export async function importWeights(db, text, map) {
  const { rows } = read(text)
  const result = []
  for (const [member, userId] of Object.entries(map ?? {})) {
    if (!userId) continue
    const mine = rows.filter((r) => (r.member ?? '') === member)
    if (!mine.length) continue
    const from = new Date(new Date(mine[0].measured_at).getTime() - SAME_WEIGH_IN_MS).toISOString()
    const to = new Date(new Date(mine.at(-1).measured_at).getTime() + SAME_WEIGH_IN_MS).toISOString()
    const existing = []
    for (let start = 0; ; start += 1000) {
      const page = check(await db.from('body_weights').select('measured_at').eq('user_id', userId).gte('measured_at', from).lte('measured_at', to).order('measured_at').range(start, start + 999))
      existing.push(...page.map((w) => new Date(w.measured_at).getTime()))
      if (page.length < 1000) break
    }
    const fresh = mine.filter((r) => !existing.some((t) => Math.abs(t - new Date(r.measured_at).getTime()) < SAME_WEIGH_IN_MS))
    for (let i = 0; i < fresh.length; i += 500) {
      const chunk = fresh.slice(i, i + 500).map(({ member: _m, ...r }) => ({ ...r, user_id: userId, source: 'eufy_csv' }))
      check(await db.from('body_weights').upsert(chunk, { onConflict: 'user_id,measured_at,source', ignoreDuplicates: true }))
    }
    result.push({ member: member || null, user_id: userId, added: fresh.length, skipped: mine.length - fresh.length })
  }
  return { result }
}
