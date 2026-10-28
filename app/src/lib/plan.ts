import type { WorkoutSession, WorkoutTemplate } from './types'

/** The workout after the last one done, cycling through the plan in order. */
export function nextTemplate(templates: WorkoutTemplate[], sessions: WorkoutSession[]): WorkoutTemplate | null {
  if (!templates.length) return null
  const last = sessions.find((s) => s.template_id && templates.some((t) => t.id === s.template_id))
  if (!last) return templates[0]
  const i = templates.findIndex((t) => t.id === last.template_id)
  return templates[(i + 1) % templates.length]
}
