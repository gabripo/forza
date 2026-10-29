// The sections of the Home page and their default order. Shared by the app and Forza! Coach, so a coach
// can rearrange someone's Home page from the computer.

export const HOME_SECTIONS = [
  { id: 'log', en: 'Log food (photo, dictate, barcode)', it: 'Registra il cibo (foto, detta, codice)' },
  { id: 'tip', en: 'Tip of the day', it: 'Consiglio del giorno' },
  { id: 'checklist', en: 'Today’s checklist', it: 'Checklist di oggi' },
  { id: 'workout', en: 'Next workout', it: 'Prossimo allenamento', training: true },
  { id: 'lesson', en: 'Next lesson', it: 'Prossima lezione' },
  { id: 'weight', en: 'Weight', it: 'Peso' },
  { id: 'food', en: 'Food today', it: 'Cibo di oggi' },
  { id: 'points', en: 'Points and family challenge', it: 'Punti e sfida di famiglia' },
  { id: 'strength', en: 'Strength', it: 'Forza', training: true },
  { id: 'week', en: 'This week', it: 'Questa settimana' },
]

/**
 * A saved order made complete: unknown ids and repeats are dropped, and sections added in a later version
 * of Forza! take their default place (after the section that precedes them by default).
 */
export function homeOrder(saved) {
  const ids = HOME_SECTIONS.map((s) => s.id)
  const order = (Array.isArray(saved) ? saved : []).filter((id, i, all) => ids.includes(id) && all.indexOf(id) === i)
  for (const [i, id] of ids.entries()) {
    if (order.includes(id)) continue
    const before = ids.slice(0, i).reverse().find((p) => order.includes(p))
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id)
  }
  return order
}
