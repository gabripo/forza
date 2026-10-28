// Tolerant CSV reader for weight exports (EufyLife "Export all data", spreadsheets, other apps).
// Finds the date and weight columns by name, in English or Italian.

export interface ParsedWeight {
  measured_at: string
  weight_kg: number
  body_fat_pct: number | null
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = []
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

function parseDate(raw: string): Date | null {
  const s = raw.trim()
  if (!s) return null
  // 2026-10-27, 2026-10-27 07:12, 2026/10/27
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 8), +(m[5] ?? 0))
  // 27/10/2026 or 10/27/2026 (day first unless impossible)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2}))?/)
  if (m) {
    let [a, b] = [+m[1], +m[2]]
    if (b > 12 && a <= 12) [a, b] = [b, a]
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]
    return new Date(y, b - 1, a, +(m[4] ?? 8), +(m[5] ?? 0))
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseNumber(raw: string): number {
  return Number(raw.replace(/[^\d.,-]/g, '').replace(',', '.'))
}

export function parseWeightCsv(text: string): { rows: ParsedWeight[]; error: string | null } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { rows: [], error: 'empty' }
  const sep = [';', '\t', ','].find((s) => lines[0].includes(s)) ?? ','
  const header = splitLine(lines[0], sep).map((h) => h.toLowerCase())
  const dateCol = header.findIndex((h) => /date|time|data|giorno|ora/.test(h))
  let weightCol = header.findIndex((h) => /weight|peso/.test(h) && !/target|obiettivo|lean|magra|muscle|bone/.test(h))
  if (weightCol < 0) weightCol = header.findIndex((h) => /\b(kg|lb|lbs)\b/.test(h))
  const fatCol = header.findIndex((h) => /body fat|fat %|grasso|bodyfat/.test(h))
  if (dateCol < 0 || weightCol < 0) return { rows: [], error: 'columns' }
  const isLb = /lb/.test(header[weightCol])

  const rows: ParsedWeight[] = []
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, sep)
    const d = parseDate(cells[dateCol] ?? '')
    let kg = parseNumber(cells[weightCol] ?? '')
    if (!d || !Number.isFinite(kg)) continue
    if (isLb) kg *= 0.45359237
    if (kg < 20 || kg > 400) continue
    const fat = fatCol >= 0 ? parseNumber(cells[fatCol] ?? '') : NaN
    rows.push({
      measured_at: d.toISOString(),
      weight_kg: Math.round(kg * 100) / 100,
      body_fat_pct: Number.isFinite(fat) && fat > 1 && fat < 80 ? fat : null,
    })
  }
  return { rows, error: rows.length ? null : 'empty' }
}
