import { CheckCircle2, Undo2, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../lib/auth'
import { deleteFood, getFamilyCoach, getFamilyPeople } from '../lib/data'
import { useI18n } from '../lib/i18n'
import type { FoodLog } from '../lib/types'
import { Button, Card, cx } from './ui'

const KEY = 'forza.logFor'
const read = () => {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}
const write = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(KEY, id)
    else sessionStorage.removeItem(KEY)
  } catch {
    // Not kept between pages: the choice is made again.
  }
}

/** Where the Food page goes after a meal logged for someone else: what it was, to undo it. */
export interface LoggedFor {
  id: string
  name: string
  title: string
  kcal: number
}

/**
 * For the family coach (chosen in Forza! Coach): whose meal this is. Their own unless they choose someone; then the
 * meal goes into that person's food log, marked as logged by the coach, and that person's app scores it against
 * their own target. The choice holds while moving between the ways to log (photo, voice, by hand) until the meal is
 * saved. For everyone else, nothing changes.
 */
export function useLogFor() {
  const { session, profile } = useApp()
  const me = session?.user.id
  const [people, setPeople] = useState<{ id: string; display_name: string }[]>([])
  const [forId, setForId] = useState<string | null>(read)
  useEffect(() => {
    if (!me) return
    let alive = true
    void getFamilyCoach()
      .then(async (coach) => (coach === me ? getFamilyPeople(me) : []))
      .then((list) => alive && setPeople(list))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [me])
  const person = people.find((p) => p.id === forId) ?? null
  return {
    /** The others, when this person is the family coach; empty otherwise. */
    people,
    /** Whose meal it is when not the coach's own. */
    person,
    choose(id: string | null) {
      write(id)
      setForId(id)
    },
    /** What the meal needs to go into the other person's log: no score, it is worked out on their phone. */
    fields(): Partial<FoodLog> {
      if (!person || !me) return {}
      return { user_id: person.id, logged_by: me, origin: profile?.display_name || null, score_fat_loss: null, score_muscle_gain: null }
    },
    /** Saved: the choice is over, and the Food page says where the meal went. */
    saved(id: string, title: string, kcal: number): { logged: true; loggedIds: string[] } | { loggedFor: LoggedFor } {
      write(null)
      return person ? { loggedFor: { id, name: person.display_name, title, kcal: Math.round(kcal) } } : { logged: true, loggedIds: [id] }
    },
  }
}

export type LogFor = ReturnType<typeof useLogFor>

/** After a meal logged for someone: whose log it went into, and Undo for a meal logged for the wrong person. */
export function LoggedForCard({ logged }: { logged: LoggedFor }) {
  const { t, num } = useI18n()
  const [state, setState] = useState<'logged' | 'undoing' | 'undone' | 'failed'>('logged')
  async function undo() {
    setState('undoing')
    try {
      await deleteFood(logged.id)
      setState('undone')
    } catch {
      setState('failed')
    }
  }
  if (state === 'undone') return <Card tone="sun">{t('logFor.undone', { name: logged.name })}</Card>
  return (
    <Card tone="leaf">
      <p className="flex items-center gap-2 font-semibold">
        <CheckCircle2 className="size-5 text-leaf" aria-hidden /> {t('logFor.done', { name: logged.name })}
      </p>
      <p className="mt-1 text-ink-2">
        {logged.title} · {num(logged.kcal)} kcal
      </p>
      {state === 'failed' ? <p className="mt-2 rounded-xl bg-danger-soft p-2 text-sm">{t('logFor.undoError')}</p> : null}
      <Button variant="secondary" className="mt-3" onClick={() => void undo()} loading={state === 'undoing'}>
        <Undo2 className="size-5" aria-hidden /> {t('logFor.undo')}
      </Button>
    </Card>
  )
}

/** "Whose meal is it?": the coach, or someone of the family. Shown to the family coach only. */
export function LogForPicker({ logFor }: { logFor: LogFor }) {
  const { t } = useI18n()
  if (!logFor.people.length) return null
  const options = [{ id: null, name: t('logFor.me') }, ...logFor.people.map((p) => ({ id: p.id, name: p.display_name }))]
  const chosen = logFor.person?.id ?? null
  return (
    <Card tone={logFor.person ? 'sky' : undefined}>
      <p className="mb-2 flex items-center gap-2 font-semibold">
        <UserRound className="size-5" aria-hidden /> {t('logFor.question')}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id ?? 'me'}
            type="button"
            onClick={() => logFor.choose(o.id)}
            aria-pressed={chosen === o.id}
            className={cx('min-h-11 rounded-full px-4 text-sm font-semibold transition', chosen === o.id ? 'bg-brand text-white dark:text-black' : 'bg-card-2 text-ink-2')}
          >
            {o.name}
          </button>
        ))}
      </div>
      {logFor.person ? <p className="mt-2 text-sm text-ink-2">{t('logFor.note', { name: logFor.person.display_name })}</p> : null}
    </Card>
  )
}
