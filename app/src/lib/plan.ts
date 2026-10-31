import { localDay } from './calc'
import type { Activity, WorkoutSession, WorkoutTemplate } from './types'

/** 0 = Monday … 6 = Sunday */
export const weekdayOf = (d: Date) => (d.getDay() + 6) % 7

export interface NextWorkout {
  template: WorkoutTemplate
  /** 0 = today, 1 = tomorrow…; null when the plan simply rotates (no fixed days). */
  daysAway: number | null
}

/** A planned workout done on another day, this time only (the plan keeps its days). */
export interface WorkoutMove {
  id: string
  template_id: string
  /** yyyy-MM-dd: the day it was planned for. */
  from_day: string
  /** yyyy-MM-dd: the day it is done instead. */
  to_day: string
}

export interface Planned {
  template: WorkoutTemplate
  /** The day it was planned for, when it was moved here. */
  movedFrom: string | null
  move: WorkoutMove | null
}

/** What is planned on a day: the plan's workouts for that weekday, less those moved away, plus those moved there. */
export function plannedOn(templates: WorkoutTemplate[], moves: WorkoutMove[], date: Date): Planned[] {
  const day = localDay(date)
  const own = templates
    .filter((t) => t.weekday === weekdayOf(date) && !moves.some((m) => m.template_id === t.id && m.from_day === day))
    .map((template) => ({ template, movedFrom: null, move: null }))
  const moved = moves
    .filter((m) => m.to_day === day)
    .flatMap((m) => {
      const template = templates.find((t) => t.id === m.template_id)
      return template ? [{ template, movedFrom: m.from_day, move: m }] : []
    })
  return [...own, ...moved]
}

/**
 * With fixed weekdays (and any workout moved to another day): today's workout if not done yet, otherwise the next
 * planned day. Without: the workout after the last one done, cycling through the plan in order.
 */
export function nextTemplate(templates: WorkoutTemplate[], sessions: WorkoutSession[], now = new Date(), moves: WorkoutMove[] = []): NextWorkout | null {
  if (!templates.length) return null
  if (templates.some((x) => x.weekday !== null && x.weekday !== undefined) || moves.length) {
    const today = localDay(now)
    for (let offset = 0; offset < 14; offset++) {
      const day = new Date(now)
      day.setDate(day.getDate() + offset)
      const t = plannedOn(templates, moves, day).find(
        (p) => offset > 0 || !sessions.some((s) => s.template_id === p.template.id && localDay(new Date(s.started_at)) === today),
      )
      if (t) return { template: t.template, daysAway: offset }
    }
  }
  const last = sessions.find((s) => s.template_id && templates.some((t) => t.id === s.template_id))
  if (!last) return { template: templates[0], daysAway: null }
  const i = templates.findIndex((t) => t.id === last.template_id)
  return { template: templates[(i + 1) % templates.length], daysAway: null }
}

export interface DayPlan {
  date: Date
  weekday: number
  isToday: boolean
  templates: WorkoutTemplate[]
  planned: Planned[]
  sessions: WorkoutSession[]
  activities: Activity[]
}

/** The current week, Monday to Sunday, with what is planned (moves included) and what was done. */
export function weekPlan(templates: WorkoutTemplate[], sessions: WorkoutSession[], activities: Activity[], now = new Date(), moves: WorkoutMove[] = []): DayPlan[] {
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - weekdayOf(monday))
  const today = localDay(now)
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    const day = localDay(date)
    const planned = plannedOn(templates, moves, date)
    return {
      date,
      weekday: i,
      isToday: day === today,
      templates: planned.map((p) => p.template),
      planned,
      sessions: sessions.filter((s) => localDay(new Date(s.started_at)) === day),
      activities: activities.filter((a) => localDay(new Date(a.started_at)) === day),
    }
  })
}

export function activityMinutes(a: Activity): number {
  return Math.max(0, Math.round((new Date(a.ended_at).getTime() - new Date(a.started_at).getTime()) / 60_000))
}
