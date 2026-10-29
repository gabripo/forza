// Dates as Build With Science shows them ("Oct 26", no year). Shared by the extractor and the
// converter, which also run on the phone (no Node or Deno modules here).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Oct 26" → a date in the 12 months up to `now` (the history screen shows no year). */
export function sessionDate(label, now = new Date()) {
  const [mon, day] = label.split(' ')
  const month = MONTHS.indexOf(mon)
  const year = month > now.getMonth() || (month === now.getMonth() && Number(day) > now.getDate()) ? now.getFullYear() - 1 : now.getFullYear()
  return new Date(year, month, Number(day), 18, 0)
}
