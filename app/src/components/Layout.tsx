import { BookOpen, Dumbbell, Home, LineChart, Utensils } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { loadActive } from '../lib/workout'
import { cx } from './ui'

const TABS = [
  { to: '/', key: 'nav.home', Icon: Home },
  { to: '/train', key: 'nav.train', Icon: Dumbbell },
  { to: '/check', key: 'nav.check', Icon: LineChart },
  { to: '/food', key: 'nav.food', Icon: Utensils },
  { to: '/learn', key: 'nav.learn', Icon: BookOpen },
]

export function Layout() {
  const { t } = useI18n()
  const active = loadActive()
  return (
    <div className="mx-auto min-h-dvh max-w-xl">
      <main className="px-4 pb-28">
        <Outlet />
      </main>
      {active ? (
        <NavLink
          to="/train/active"
          className="no-print fixed inset-x-0 bottom-[4.6rem] z-30 mx-auto flex max-w-xl items-center justify-center px-4"
        >
          <span className="flex w-full items-center justify-center gap-2 rounded-2xl bg-leaf px-4 py-3 font-bold text-white shadow-lg dark:text-black">
            <Dumbbell className="size-5" aria-hidden /> {t('train.resume', { name: active.name })}
          </span>
        </NavLink>
      ) : null}
      <nav className="no-print pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur" aria-label="Main">
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {TABS.map(({ to, key, Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cx('flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold', isActive ? 'text-brand-ink' : 'text-ink-3')
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cx('grid h-8 w-14 place-items-center rounded-full transition', isActive && 'bg-brand-soft')}>
                      <Icon className="size-6" aria-hidden strokeWidth={isActive ? 2.4 : 2} />
                    </span>
                    {t(key)}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
