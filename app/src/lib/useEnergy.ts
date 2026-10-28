import { useMemo } from 'react'
import { useApp } from './auth'
import { getFood, getSessions, getSteps, getWeights, useAsync } from './data'
import { computeEnergy } from './energy'

/** Loads what's needed for the daily energy estimate (plus 28 days of food). */
export function useEnergy() {
  const { profile } = useApp()
  const q = useAsync(() => Promise.all([getWeights(120), getSteps(30), getSessions(60), getFood(28)]), [])
  const energy = useMemo(() => {
    if (!q.data || !profile) return null
    const [weights, steps, sessions, food] = q.data
    return computeEnergy(profile, weights, steps, sessions, food)
  }, [q.data, profile])
  return { energy, food: q.data?.[3] ?? [], weights: q.data?.[0] ?? [], loading: q.loading, reload: q.reload }
}
