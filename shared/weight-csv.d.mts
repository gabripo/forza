export interface CsvWeight {
  measured_at: string
  weight_kg: number
  body_fat_pct: number | null
  /** The family member the row belongs to (EufyLife exports everyone), when the file says. */
  member: string | null
}

export function parseCsvDate(raw: string | null | undefined): Date | null
export function parseWeightCsv(text: string): { rows: CsvWeight[]; members: string[]; error: 'empty' | 'columns' | null }
export function sameName(name: string | null | undefined, member: string | null | undefined): boolean
export function memberFor(name: string | null | undefined, members: string[]): string | null
