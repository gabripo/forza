import { useEffect, useMemo, useReducer } from 'react'
import { TIPS, type Tip } from '../data/tips'
import { ALL_TOPICS, EXPERT_TOPICS, TOPICS, type Topic } from '../pages/learn/content'
import { supabase } from './supabase'
import type { L10n } from './types'

/**
 * The knowledge base as the family coach shaped it in Forza! Coach: built-in lessons changed, moved or
 * hidden, new lessons, and tips of the day. Coach's changes (tables kb_lessons and kb_tips) are laid over
 * the lessons built into the app; the last copy is kept on the phone, so lessons work offline too.
 */

interface LessonRow {
  id: string
  track: 'course' | 'expert'
  position: number | null
  hidden: boolean
  content: Partial<Topic>
}

interface TipRow {
  id: string
  text_en: string
  text_it: string
  topic: string | null
  hidden: boolean
}

interface Rows {
  lessons: LessonRow[]
  tips: TipRow[]
}

export interface Knowledge {
  course: Topic[]
  expert: Topic[]
  all: Topic[]
  tips: Tip[]
  byId: (id: string | undefined) => Topic | undefined
  trackOf: (id: string) => 'course' | 'expert'
  /** Coach's version has been read (or could not be): a lesson missing now does not exist. */
  settled: boolean
}

const CACHE = 'forza.knowledge'
const TONES = new Set(['orange', 'green', 'blue', 'yellow', 'pink', 'purple'])

let rows: Rows | null = readCache()
let loading: Promise<void> | null = null
let settled = false
const listeners = new Set<() => void>()

function readCache(): Rows | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? 'null') as Rows | null
  } catch {
    return null
  }
}

/** Reads Coach's changes once per app start; a server without them (or offline) keeps the built-in ones. */
function load(): Promise<void> {
  loading ??= Promise.all([supabase.from('kb_lessons').select('*'), supabase.from('kb_tips').select('*')])
    .then(([lessons, tips]) => {
      if (lessons.error || tips.error) return
      rows = { lessons: (lessons.data ?? []) as LessonRow[], tips: (tips.data ?? []) as TipRow[] }
      try {
        localStorage.setItem(CACHE, JSON.stringify(rows))
      } catch {
        // the built-in lessons still work
      }
      listeners.forEach((l) => l())
    })
    .catch(() => {})
    .finally(() => {
      settled = true
      listeners.forEach((l) => l())
    })
  return loading
}

const isL10n = (v: unknown): v is L10n => typeof v === 'object' && v !== null && typeof (v as L10n).en === 'string' && typeof (v as L10n).it === 'string'

/** A lesson written in Coach, with safe defaults for anything missing. */
function lessonOf(row: LessonRow, base?: Topic): Topic {
  const c = row.content ?? {}
  return {
    id: row.id,
    emoji: typeof c.emoji === 'string' && c.emoji ? c.emoji : (base?.emoji ?? '📘'),
    tone: c.tone && TONES.has(c.tone) ? c.tone : (base?.tone ?? 'blue'),
    title: isL10n(c.title) ? c.title : (base?.title ?? { en: row.id, it: row.id }),
    subtitle: isL10n(c.subtitle) ? c.subtitle : (base?.subtitle ?? { en: '', it: '' }),
    blocks: Array.isArray(c.blocks) ? c.blocks : (base?.blocks ?? []),
    sources: Array.isArray(c.sources) ? c.sources : base?.sources,
  }
}

export function merge(r: Rows | null, done = true): Knowledge {
  const course = [...TOPICS]
  const expert = [...EXPERT_TOPICS]
  // In the order of their places, so a whole track moved in Coach comes out in that order.
  for (const row of [...(r?.lessons ?? [])].sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9))) {
    const base = ALL_TOPICS.find((t) => t.id === row.id)
    const from = course.some((t) => t.id === row.id) ? course : expert.some((t) => t.id === row.id) ? expert : null
    const at = from ? from.findIndex((t) => t.id === row.id) : -1
    if (from) from.splice(at, 1)
    if (row.hidden) continue
    const to = row.track === 'expert' ? expert : course
    // A changed lesson stays where it was, unless the coach moved it.
    const place = row.position ?? (from === to && at >= 0 ? at : to.length)
    to.splice(Math.max(0, Math.min(place, to.length)), 0, lessonOf(row, base))
  }
  let tips = [...TIPS]
  for (const row of r?.tips ?? []) {
    const i = tips.findIndex((t) => t.id === row.id)
    if (row.hidden) {
      if (i >= 0) tips.splice(i, 1)
      continue
    }
    const tip: Tip = { id: row.id, text: { en: row.text_en, it: row.text_it || row.text_en }, topic: row.topic ?? '' }
    if (i >= 0) tips[i] = tip
    else tips.push(tip)
  }
  tips = tips.filter((t) => t.text.en || t.text.it)
  const all = [...course, ...expert]
  return {
    course,
    expert,
    all,
    tips: tips.length ? tips : TIPS,
    byId: (id) => all.find((t) => t.id === id),
    trackOf: (id) => (expert.some((t) => t.id === id) ? 'expert' : 'course'),
    settled: done,
  }
}

/** The lessons and tips to show: the built-in ones at once, Coach's version as soon as it is read. */
export function useKnowledge(): Knowledge {
  const [version, refresh] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    listeners.add(refresh)
    void load()
    return () => {
      listeners.delete(refresh)
    }
  }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => merge(rows, settled), [version])
}
