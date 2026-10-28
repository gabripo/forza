import { localDay } from './calc'
import type { Activity, WorkoutSession, WorkoutTemplate } from './types'

/** 0 = Monday … 6 = Sunday */
export const weekdayOf = (d: Date) => (d.getDay() + 6) % 7

export interface NextWorkout {
  template: WorkoutTemplate
  /** 0 = today, 1 = tomorrow…; null when the plan simply rotates (no fixed days). */
  daysAway: number | null
}

/**
 * With fixed weekdays: today's workout if not done yet, otherwise the next scheduled day.
 * Without: the workout after the last one done, cycling through the plan in order.
 */
export function nextTemplate(templates: WorkoutTemplate[], sessions: WorkoutSession[], now = new Date()): NextWorkout | null {
  if (!templates.length) return null
  const scheduled = templates.filter((t) => t.weekday !== null && t.weekday !== undefined)
  if (scheduled.length) {
    const today = localDay(now)
    for (let offset = 0; offset < 7; offset++) {
      const day = new Date(now)
      day.setDate(day.getDate() + offset)
      const t = scheduled.find((x) => x.weekday === weekdayOf(day))
      if (!t) continue
      const doneToday = offset === 0 && sessions.some((s) => s.template_id === t.id && localDay(new Date(s.started_at)) === today)
      if (!doneToday) return { template: t, daysAway: offset }
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
  sessions: WorkoutSession[]
  activities: Activity[]
}

/** The current week, Monday to Sunday, with what is planned and what was done. */
export function weekPlan(templates: WorkoutTemplate[], sessions: WorkoutSession[], activities: Activity[], now = new Date()): DayPlan[] {
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - weekdayOf(monday))
  const today = localDay(now)
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    const day = localDay(date)
    return {
      date,
      weekday: i,
      isToday: day === today,
      templates: templates.filter((t) => t.weekday === i),
      sessions: sessions.filter((s) => localDay(new Date(s.started_at)) === day),
      activities: activities.filter((a) => localDay(new Date(a.started_at)) === day),
    }
  })
}

export function activityMinutes(a: Activity): number {
  return Math.max(0, Math.round((new Date(a.ended_at).getTime() - new Date(a.started_at).getTime()) / 60_000))
}
