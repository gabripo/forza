import { AlertTriangle, Check } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { MEAL_KCAL_MAX, MEAL_PROTEIN_MAX, type MealCheck } from '../lib/mealCheck'
import { Button } from './ui'

/**
 * "Save the meal", at the top of the page. A meal that looks like a mistake is saved only at the second tap: the
 * first one brings the warning under the button into view and asks to check the amounts.
 */
export function SaveMealButton({ check, onSave, loading, disabled }: { check: MealCheck; onSave: () => void; loading?: boolean; disabled?: boolean }) {
  const { t } = useI18n()
  const confirm = Boolean(check.odd) && !check.asked
  return (
    <Button
      variant="leaf"
      block
      loading={loading}
      disabled={disabled}
      onClick={() => {
        if (!confirm) return onSave()
        check.ask()
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }}
    >
      <Check className="size-5" aria-hidden /> {check.odd && check.asked ? t('mealCheck.saveAnyway') : t('snap.save')}
    </Button>
  )
}

/** Under the save button: what looks wrong, and the foods to check first. */
export function MealCheckWarning({ check, onFix }: { check: MealCheck; onFix?: () => void }) {
  const { t, num } = useI18n()
  const odd = check.odd
  if (!odd) return null
  return (
    <div role="status" className={`rounded-2xl bg-sun-soft p-3 ${check.asked ? 'ring-2 ring-sun' : ''}`}>
      <p className="flex gap-2 font-bold">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-sun" aria-hidden />
        {odd.reason === 'kcal' ? t('mealCheck.kcal', { kcal: num(odd.kcal), max: num(MEAL_KCAL_MAX) }) : t('mealCheck.protein', { protein: num(odd.protein), max: num(MEAL_PROTEIN_MAX) })}
      </p>
      <p className="mt-2 text-sm font-semibold">{t('mealCheck.check')}</p>
      <ul className="mt-1 grid gap-0.5 text-sm">
        {odd.check.map((i, n) => (
          <li key={n}>
            • {i.name}: {num(i.grams)} g · {num(i.kcal)} kcal · {t('macro.protein')} {num(i.protein_g)} g
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-ink-2">{check.asked ? t('mealCheck.again') : t('mealCheck.before')}</p>
      {onFix ? (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onFix}>
          {t('mealCheck.fix')}
        </Button>
      ) : null}
    </div>
  )
}
