import { Check, Copy, Undo2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useMealCopy, type CopySuggestion } from '../lib/copyMeal'
import { useI18n } from '../lib/i18n'
import { Button } from './ui'

export function CopiedNotice({ kcal, onUndo, busy }: { kcal: number; onUndo: () => void; busy: boolean }) {
  const { t, num } = useI18n()
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-leaf-soft px-3 py-2" role="status">
      <Check className="size-5 shrink-0 text-leaf" aria-hidden />
      <span className="flex-1 font-semibold">{t('copyMeal.done', { kcal: num(kcal) })}</span>
      <button onClick={onUndo} disabled={busy} className="inline-flex min-h-10 items-center gap-1 rounded-xl px-2 font-semibold text-brand-ink active:bg-card">
        <Undo2 className="size-4" aria-hidden /> {t('copyMeal.undo')}
      </button>
    </div>
  )
}

/**
 * The Home button: "Copy yesterday's breakfast" when there is one to copy, otherwise "Copy a meal",
 * which opens yesterday's food log, where every meal can be copied to today.
 */
export function CopyMealButton({ suggestion, onChanged }: { suggestion: CopySuggestion | null; onChanged: () => void }) {
  const { t, num } = useI18n()
  const navigate = useNavigate()
  const { busy, copied, copy, undo } = useMealCopy(onChanged)
  if (copied) return <CopiedNotice kcal={copied.kcal} onUndo={() => void undo()} busy={busy} />
  return (
    <Button
      size="lg"
      variant="secondary"
      block
      loading={busy}
      onClick={() => (suggestion ? void copy(suggestion.entries) : navigate('/food', { state: { offset: 1 } }))}
    >
      <Copy className="size-6 text-brand" aria-hidden />
      {suggestion ? (
        <span>
          {t(`copyMeal.yesterday.${suggestion.meal}`)} <span className="font-normal text-ink-2">· {num(suggestion.kcal)} kcal</span>
        </span>
      ) : (
        t('copyMeal.any')
      )}
    </Button>
  )
}
