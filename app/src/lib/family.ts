import { useEffect, useState } from 'react'
import { useApp } from './auth'
import { getFamilyCoach } from './data'

/**
 * Whether this person is the family coach (chosen in Forza! Coach): null while it is not known yet. Only the family
 * coach has the family overview on Home and can log meals for the others.
 */
export function useIsFamilyCoach(): boolean | null {
  const { session } = useApp()
  const me = session?.user.id
  const [coach, setCoach] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!me) return
    let alive = true
    void getFamilyCoach().then((id) => alive && setCoach(id))
    return () => {
      alive = false
    }
  }, [me])
  return coach === undefined || !me ? null : coach === me
}

/** What a person ate on a day, from their meals: calories and the three macros. */
export function eatenOf(meals: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }[]) {
  return meals.reduce(
    (a, m) => ({ kcal: a.kcal + Number(m.kcal), protein_g: a.protein_g + Number(m.protein_g), carbs_g: a.carbs_g + Number(m.carbs_g), fat_g: a.fat_g + Number(m.fat_g) }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  )
}
