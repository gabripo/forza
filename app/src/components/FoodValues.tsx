import { useState } from 'react'
import type { LoggedItem } from '../lib/foodDb'
import { useI18n } from '../lib/i18n'
import { itemFromValues, OPTIONAL_VALUES, VALUE_KEYS, valuesOf, type Values } from '../lib/foodValues'
import type { FoodItem } from '../lib/types'
import { Button, Field, Input, NumberInput, Sheet } from './ui'

/** Calories, protein, carbs and fat, then fibre, sugar, saturated fat and salt (these may be left out). */
export function NutrientFields({ values, onChange }: { values: Values; onChange: (v: Values) => void }) {
  const { t } = useI18n()
  const label: Record<keyof Values, string> = {
    kcal: 'kcal',
    protein_g: `${t('macro.protein')} (g)`,
    carbs_g: `${t('macro.carbs')} (g)`,
    fat_g: `${t('macro.fat')} (g)`,
    fiber_g: `${t('macro.fiber')} (g)`,
    sugar_g: `${t('macro.sugar')} (g)`,
    satfat_g: `${t('macro.satfat')} (g)`,
    salt_g: `${t('macro.salt')} (g)`,
  }
  return (
    <div className="grid grid-cols-2 items-end gap-3">
      {VALUE_KEYS.map((k) => (
        <Field key={k} label={label[k]} hint={OPTIONAL_VALUES.has(k) ? t('manual.optional') : undefined}>
          <NumberInput value={values[k]} onChange={(v) => onChange({ ...values, [k]: v })} />
        </Field>
      ))}
    </div>
  )
}

/**
 * A food with its values typed in, for the amount used (100 g to type them as on a label): a food that is in no list,
 * or one whose values need correcting (`initial`). The form starts afresh each time it opens.
 */
export function FoodValuesSheet({ open, initial, title, saveLabel, onClose, onSave }: { open: boolean; initial?: FoodItem | null; title: string; saveLabel: string; onClose: () => void; onSave: (item: LoggedItem) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {open ? <ValuesForm initial={initial ?? null} saveLabel={saveLabel} onSave={onSave} /> : null}
    </Sheet>
  )
}

function ValuesForm({ initial, saveLabel, onSave }: { initial: FoodItem | null; saveLabel: string; onSave: (item: LoggedItem) => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(initial?.name ?? '')
  const [grams, setGrams] = useState<number | null>(initial ? initial.grams || null : 100)
  const [values, setValues] = useState<Values>(() => valuesOf(initial ?? undefined))
  return (
    <div className="grid gap-3">
      <Field label={t('picker.name')}>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </Field>
      <Field label={t('manual.customGrams')} hint={t('manual.customHint')}>
        <NumberInput decimals={false} value={grams} onChange={setGrams} />
      </Field>
      <NutrientFields values={values} onChange={setValues} />
      <Button size="lg" block disabled={!name.trim() || values.kcal == null} onClick={() => onSave({ ...itemFromValues(name, grams ?? 0, values), origin: 'manual' })}>
        {saveLabel}
      </Button>
    </div>
  )
}
