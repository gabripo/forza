import { useEffect, useMemo } from 'react'
import { useApp } from './auth'
import { localDay } from './calc'
import { getFood, getFoodDays, getSessions, getSteps, getWeights, saveTargetDay, useAsync } from './data'
import { computeEnergy, type Energy } from './energy'

/**
 * Loads what's needed for the daily energy estimate (plus 28 days of food, and what the person said about past
 * days: a day not all logged is left out).
 */
export function useEnergy() {
  const { profile } = useApp()
  const q = useAsync(() => Promise.all([getWeights(120), getSteps(30), getSessions(60), getFood(28), getFoodDays(60).catch(() => [])]), [])
  const energy = useMemo(() => {
    if (!q.data || !profile) return null
    const [weights, steps, sessions, food, notes] = q.data
    return computeEnergy(profile, weights, steps, sessions, food, notes)
  }, [q.data, profile])
  useKeepTargets(energy)
  return { energy, food: q.data?.[3] ?? [], weights: q.data?.[0] ?? [], notes: q.data?.[4] ?? [], loading: q.loading, reload: q.reload }
}

const KEPT = 'forza.targetsKept'

/** Keeps today's targets for their history (once a day, or again when they change during the day). */
export function useKeepTargets(energy: Energy | null) {
  useEffect(() => {
    if (!energy) return
    const tg = energy.targets
    const row = { day: localDay(new Date()), kcal: tg.kcal, protein_g: tg.protein_g, carbs_g: tg.carbs_g, fat_g: tg.fat_g, tdee: energy.tdee.tdee, method: energy.tdee.method, weight_kg: Math.round(energy.weightKg * 100) / 100 }
    const key = JSON.stringify(row)
    try {
      if (localStorage.getItem(KEPT) === key) return
    } catch {
      // kept again: no harm
    }
    void saveTargetDay(row).then(
      () => {
        try {
          localStorage.setItem(KEPT, key)
        } catch {
          // kept again next time
        }
      },
      () => {},
    )
  }, [energy])
}
