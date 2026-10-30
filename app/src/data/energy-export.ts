// The app's own calculations, for Forza! Coach: `npm run export-knowledge` bundles them into shared/energy.mjs,
// so Coach shows each person the same targets and meal scores as their phone.
export { computeEnergy } from '../lib/energy'
export { kcalFloor, PACE_KCAL, paceKcal, SALT_LIMIT_G, scorePlate, sodiumMg, sumItems } from '../lib/calc'
