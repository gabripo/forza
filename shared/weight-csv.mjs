// Weigh-ins from a CSV file: EufyLife's export ("Quando, Membri della famiglia, PESO (kg), … % GRASSO CORPOREO"),
// spreadsheets and other apps. Shared by the app (Weights → Import CSV) and Forza! Coach (Import), so both read
// a file the same way. Columns are found by name, in English or Italian; times without a zone are local.

/** Whole words only: "ora" must not match inside "CORPORATURA". */
const has = (header, words) => words.some((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'u').test(header))

const DATE = ['quando', 'when', 'date', 'data', 'time', 'timestamp', 'datetime', 'giorno', 'day', 'ora', 'date and time', 'data e ora']
const MEMBER = ['membri della famiglia', 'membro', 'member', 'family member', 'utente', 'user', 'nome', 'name', 'persona', 'person']
const WEIGHT = ['peso', 'weight', 'body weight']
const NOT_WEIGHT = ['target', 'obiettivo', 'goal', 'lean', 'magra', 'muscle', 'muscolare', 'bone', 'ossea', 'grassa', 'fat']
const FAT = ['grasso corporeo', 'body fat', 'bodyfat', 'fat']
const NOT_FAT = ['massa', 'mass', 'viscerale', 'visceral', 'sottocutaneo', 'subcutaneous', 'kg', 'lb']

function splitLine(line, sep) {
  const out = []
  let cur = ''
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted
    else if (ch === sep && !quoted) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

/** A date and time, as local time; null when it is not one. */
export function parseCsvDate(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  // 2026-10-27, 2026-10-27 07:12[:30], 2026/10/27T07:12
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 8), +(m[5] ?? 0), +(m[6] ?? 0))
  // 27/10/2026 or 10/27/2026 (day first unless impossible)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) {
    let [a, b] = [+m[1], +m[2]]
    if (b > 12 && a <= 12) [a, b] = [b, a]
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]
    return new Date(y, b - 1, a, +(m[4] ?? 8), +(m[5] ?? 0), +(m[6] ?? 0))
  }
  return null
}

const parseNumber = (raw) => Number(String(raw ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'))

/**
 * Reads the file. Rows are sorted oldest first; a weigh-in repeated in the file (same person, same second) counts
 * once; body fat is kept only between 1 and 80 % (EufyLife writes 0 when it did not measure it).
 * @param {string} text
 * @returns {{ rows: { measured_at: string, weight_kg: number, body_fat_pct: number | null, member: string | null }[], members: string[], error: 'empty' | 'columns' | null }}
 */
export function parseWeightCsv(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { rows: [], members: [], error: 'empty' }
  const sep = [';', '\t', ','].find((s) => lines[0].includes(s)) ?? ','
  const header = splitLine(lines[0], sep).map((h) => h.toLowerCase().replace(/\s+/g, ' ').trim())
  const dateCol = header.findIndex((h) => has(h, DATE))
  const memberCol = header.findIndex((h) => has(h, MEMBER))
  let weightCol = header.findIndex((h) => has(h, WEIGHT) && !has(h, NOT_WEIGHT))
  if (weightCol < 0) weightCol = header.findIndex((h) => /\b(kg|lb|lbs)\b/.test(h) && !has(h, NOT_WEIGHT))
  const fatCol = header.findIndex((h) => has(h, FAT) && !has(h, NOT_FAT))
  if (dateCol < 0 || weightCol < 0) return { rows: [], members: [], error: 'columns' }
  const isLb = /\blbs?\b/.test(header[weightCol])

  const seen = new Set()
  const rows = []
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, sep)
    const d = parseCsvDate(cells[dateCol])
    let kg = parseNumber(cells[weightCol])
    if (!d || !Number.isFinite(kg)) continue
    if (isLb) kg *= 0.45359237
    if (kg < 20 || kg > 400) continue
    const member = memberCol >= 0 ? (cells[memberCol] ?? '').trim() || null : null
    const measured_at = d.toISOString()
    const key = `${member ?? ''}|${measured_at}`
    if (seen.has(key)) continue
    seen.add(key)
    const fat = fatCol >= 0 ? parseNumber(cells[fatCol]) : NaN
    rows.push({
      measured_at,
      weight_kg: Math.round(kg * 100) / 100,
      body_fat_pct: Number.isFinite(fat) && fat >= 1 && fat <= 80 ? Math.round(fat * 10) / 10 : null,
      member,
    })
  }
  rows.sort((a, b) => a.measured_at.localeCompare(b.measured_at))
  const members = [...new Set(rows.map((r) => r.member).filter(Boolean))]
  return { rows, members, error: rows.length ? null : 'empty' }
}

/** A person's name and a member's name are the same person: equal, or one the start of the other ("Angela B."). */
export function sameName(name, member) {
  const a = String(name ?? '').trim().toLowerCase()
  const b = String(member ?? '').trim().toLowerCase()
  return Boolean(a && b) && (a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `))
}

/** The member of the file that is this person: the one with their name, or the only one. */
export function memberFor(name, members) {
  return members.find((m) => sameName(name, m)) ?? (members.length === 1 ? members[0] : null)
}
