import { Download, Printer } from 'lucide-react'
import { useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { Button, PageHeader, Segmented } from '../../components/ui'
import { translate, useI18n } from '../../lib/i18n'
import { saveNodeAsImage } from '../../lib/share'
import type { L10n, Locale } from '../../lib/types'
import { TOPICS, type Block, type Tone } from './content'

// Infographics always use this fixed light palette so they print and export identically.
export const TONES: Record<Tone, { bg: string; fg: string; accent: string }> = {
  orange: { bg: '#FFF1E8', fg: '#9A3412', accent: '#C2410C' },
  green: { bg: '#EAF7EE', fg: '#166534', accent: '#15803D' },
  blue: { bg: '#E8F3FA', fg: '#075985', accent: '#0369A1' },
  yellow: { bg: '#FDF6E3', fg: '#854D0E', accent: '#A16207' },
  pink: { bg: '#FDECF3', fg: '#9D174D', accent: '#BE185D' },
  purple: { bg: '#F1EEFD', fg: '#5B21B6', accent: '#6D28D9' },
}
const INK = '#1C1917'
const INK2 = '#57534E'

export function Infographic() {
  const { id } = useParams()
  const { t, locale } = useI18n()
  const [lang, setLang] = useState<Locale>(locale)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const topic = TOPICS.find((x) => x.id === id)
  if (!topic) return <Navigate to="/learn" replace />
  const L = (x: L10n) => x[lang]
  const tone = TONES[topic.tone]

  async function saveImage() {
    if (!ref.current) return
    setSaving(true)
    try {
      await saveNodeAsImage(ref.current, `forza-${topic!.id}-${lang}.png`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="no-print">
        <PageHeader title={L(topic.title)} back="/learn" />
        <div className="grid gap-3">
          <Segmented<Locale>
            value={lang}
            onChange={setLang}
            options={[
              { value: 'it', label: '🇮🇹 Italiano' },
              { value: 'en', label: '🇬🇧 English' },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="size-5" aria-hidden /> {t('learn.print')}
            </Button>
            <Button variant="secondary" onClick={saveImage} loading={saving}>
              <Download className="size-5" aria-hidden /> {t('learn.saveImage')}
            </Button>
          </div>
        </div>
      </div>

      <article
        ref={ref}
        lang={lang}
        className="print-area overflow-hidden rounded-3xl shadow-sm ring-1 ring-black/5"
        style={{ background: '#FFFFFF', color: INK, fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}
      >
        <header style={{ background: tone.accent, color: '#fff' }} className="px-5 py-6">
          <div className="flex items-center gap-3">
            <span className="text-5xl" aria-hidden>
              {topic.emoji}
            </span>
            <div>
              <h1 className="text-2xl leading-tight font-extrabold">{L(topic.title)}</h1>
              <p className="mt-1 opacity-90">{L(topic.subtitle)}</p>
            </div>
          </div>
        </header>
        <div className="grid gap-5 p-5">
          {topic.blocks.map((b, i) => (
            <BlockView key={i} block={b} lang={lang} tone={topic.tone} />
          ))}
        </div>
        <footer className="flex items-center gap-2 px-5 pb-5 text-xs" style={{ color: INK2 }}>
          <Logo size={22} />
          <span className="font-bold" style={{ color: INK }}>
            Forza!
          </span>
          <span>· {translate(lang, 'learn.disclaimer')}</span>
        </footer>
      </article>
    </div>
  )
}

function BlockView({ block, lang, tone }: { block: Block; lang: Locale; tone: Tone }) {
  const L = (x: L10n) => x[lang]
  const main = TONES[tone]
  switch (block.type) {
    case 'intro':
      return <p className="text-lg leading-snug">{L(block.text)}</p>

    case 'cards':
      return (
        <section>
          {block.title ? <h2 className="mb-2 text-lg font-extrabold">{L(block.title)}</h2> : null}
          <div className={`grid gap-2 ${block.cols === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
            {block.items.map((c, i) => {
              const tn = TONES[c.tone ?? tone]
              return (
                <div key={i} className="rounded-2xl p-3" style={{ background: tn.bg }}>
                  <div className="text-3xl" aria-hidden>
                    {c.emoji}
                  </div>
                  <p className="mt-1 leading-tight font-extrabold" style={{ color: tn.fg }}>
                    {L(c.title)}
                  </p>
                  <p className="mt-1 text-sm leading-snug" style={{ color: INK }}>
                    {L(c.text)}
                  </p>
                </div>
              )
            })}
          </div>
        </section>
      )

    case 'steps':
      return (
        <section>
          {block.title ? <h2 className="mb-2 text-lg font-extrabold">{L(block.title)}</h2> : null}
          <ol className="grid gap-2">
            {block.items.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full font-extrabold text-white" style={{ background: main.accent }}>
                  {i + 1}
                </span>
                <div className="pt-1">
                  <p className="leading-tight font-bold">{L(s.title)}</p>
                  {s.text ? (
                    <p className="text-sm" style={{ color: INK2 }}>
                      {L(s.text)}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )

    case 'dodont':
      return (
        <section className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl p-3" style={{ background: TONES.green.bg }}>
            <p className="mb-1 font-extrabold" style={{ color: TONES.green.fg }}>
              ✅ {translate(lang, 'learn.do')}
            </p>
            <ul className="grid gap-1 text-sm">
              {block.dos.map((d, i) => (
                <li key={i}>• {L(d)}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl p-3" style={{ background: '#FDECEC' }}>
            <p className="mb-1 font-extrabold" style={{ color: '#991B1B' }}>
              ✋ {translate(lang, 'learn.avoid')}
            </p>
            <ul className="grid gap-1 text-sm">
              {block.donts.map((d, i) => (
                <li key={i}>• {L(d)}</li>
              ))}
            </ul>
          </div>
        </section>
      )

    case 'swaps':
      return (
        <section>
          <h2 className="mb-2 text-lg font-extrabold">{L(block.title)}</h2>
          <ul className="grid gap-1.5">
            {block.items.map((s, i) => (
              <li key={i} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                <span className="rounded-xl px-2 py-1.5 text-center" style={{ background: '#F4F1EC', color: INK2 }}>
                  {L(s.from)}
                </span>
                <span className="font-extrabold" style={{ color: main.accent }} aria-hidden>
                  →
                </span>
                <span className="rounded-xl px-2 py-1.5 text-center font-bold" style={{ background: TONES.green.bg, color: TONES.green.fg }}>
                  {L(s.to)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )

    case 'plate':
      return <PlateDiagram lang={lang} />

    case 'hands':
      return (
        <section>
          <h2 className="mb-2 text-lg font-extrabold">{translate(lang, 'learn.hands.title')}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ['✋', 'palm', 'blue'],
                ['✊', 'fist', 'green'],
                ['🤲', 'cupped', 'orange'],
                ['👍', 'thumb', 'yellow'],
              ] as const
            ).map(([emoji, key, tn]) => (
              <div key={key} className="rounded-2xl p-3 text-center" style={{ background: TONES[tn].bg }}>
                <div className="text-4xl" aria-hidden>
                  {emoji}
                </div>
                <p className="font-extrabold" style={{ color: TONES[tn].fg }}>
                  {translate(lang, `learn.hands.${key}`)}
                </p>
                <p className="text-sm">{translate(lang, `learn.hands.${key}_d`)}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm" style={{ color: INK2 }}>
            {translate(lang, 'learn.hands.note')}
          </p>
        </section>
      )

    case 'bars': {
      const max = Math.max(...block.items.map((x) => x.value))
      return (
        <section>
          <h2 className="mb-2 text-lg font-extrabold">{L(block.title)}</h2>
          <ul className="grid gap-2">
            {block.items.map((x, i) => (
              <li key={i}>
                <div className="flex justify-between text-sm">
                  <span>{L(x.label)}</span>
                  <b>
                    {x.value} {block.unit}
                  </b>
                </div>
                <div className="mt-0.5 h-4 rounded-r" style={{ width: `${(x.value / max) * 100}%`, background: main.accent, borderRadius: '0 4px 4px 0' }} />
              </li>
            ))}
          </ul>
        </section>
      )
    }

    case 'timeline':
      return (
        <section>
          {block.title ? <h2 className="mb-2 text-lg font-extrabold">{L(block.title)}</h2> : null}
          <ol className="relative grid gap-3 pl-1">
            {block.items.map((x, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full text-xl" style={{ background: main.bg }} aria-hidden>
                    {x.emoji}
                  </span>
                  {i < block.items.length - 1 ? <span className="mt-1 w-0.5 flex-1" style={{ background: main.bg }} /> : null}
                </div>
                <div className="pb-1">
                  <p className="font-extrabold" style={{ color: main.fg }}>
                    {L(x.time)}
                  </p>
                  <p className="text-sm leading-snug">{L(x.text)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )

    case 'foods':
      return (
        <section className="grid gap-2 sm:grid-cols-2">
          {block.groups.map((g, i) => {
            const tn = TONES[g.tone]
            return (
              <div key={i} className="rounded-2xl p-3" style={{ background: tn.bg }}>
                <p className="font-extrabold" style={{ color: tn.fg }}>
                  <span aria-hidden>{g.emoji}</span> {L(g.title)}
                </p>
                {g.note ? (
                  <p className="text-xs font-bold" style={{ color: tn.accent }}>
                    {L(g.note)}
                  </p>
                ) : null}
                <p className="mt-1 text-sm leading-snug">{L(g.foods)}</p>
              </div>
            )
          })}
        </section>
      )

    case 'meals':
      return (
        <section className="grid gap-3 sm:grid-cols-2">
          {block.groups.map((g, i) => (
            <div key={i} className="rounded-2xl p-3" style={{ background: Object.values(TONES)[i % 6].bg }}>
              <p className="mb-1 font-extrabold" style={{ color: Object.values(TONES)[i % 6].fg }}>
                {L(g.title)}
              </p>
              <ul className="grid gap-1.5">
                {g.items.map((m, j) => (
                  <li key={j} className="flex gap-2 text-sm">
                    <span aria-hidden>{m.emoji}</span>
                    <span className="flex-1 leading-snug">{L(m.name)}</span>
                    <span className="shrink-0 font-bold whitespace-nowrap" style={{ color: TONES.blue.fg }}>
                      ~{m.protein} g P
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs sm:col-span-2" style={{ color: INK2 }}>
            {translate(lang, 'learn.proteinApprox')}
          </p>
        </section>
      )

    case 'callout':
      return (
        <div className="flex items-start gap-3 rounded-2xl border-2 p-3" style={{ borderColor: main.accent, background: main.bg }}>
          <span className="text-2xl" aria-hidden>
            {block.emoji}
          </span>
          <p className="font-bold" style={{ color: main.fg }}>
            {L(block.text)}
          </p>
        </div>
      )
  }
}

function PlateDiagram({ lang }: { lang: Locale }) {
  const tr = (k: string) => translate(lang, `learn.plate.${k}`)
  // Half vegetables (left), quarter protein (top right), quarter carbs (bottom right).
  return (
    <section className="grid items-center gap-4 sm:grid-cols-[220px_1fr]">
      <svg viewBox="0 0 240 240" className="mx-auto w-56" role="img" aria-label={tr('aria')}>
        <circle cx="120" cy="120" r="116" fill="#F4F1EC" />
        <circle cx="120" cy="120" r="100" fill="#FFFFFF" />
        <path d="M120 24 A96 96 0 0 0 120 216 Z" fill="#86EFAC" />
        <path d="M120 24 A96 96 0 0 1 216 120 L120 120 Z" fill="#93C5FD" />
        <path d="M216 120 A96 96 0 0 1 120 216 L120 120 Z" fill="#FDBA74" />
        <line x1="120" y1="22" x2="120" y2="218" stroke="#fff" strokeWidth="4" />
        <line x1="120" y1="120" x2="218" y2="120" stroke="#fff" strokeWidth="4" />
        <text x="72" y="116" textAnchor="middle" fontSize="30">🥦</text>
        <text x="72" y="148" textAnchor="middle" fontSize="13" fontWeight="800" fill="#166534">{tr('vegShort')}</text>
        <text x="160" y="80" textAnchor="middle" fontSize="26">🍗</text>
        <text x="160" y="104" textAnchor="middle" fontSize="12" fontWeight="800" fill="#075985">{tr('proteinShort')}</text>
        <text x="160" y="160" textAnchor="middle" fontSize="26">🍝</text>
        <text x="160" y="184" textAnchor="middle" fontSize="12" fontWeight="800" fill="#9A3412">{tr('carbsShort')}</text>
      </svg>
      <ul className="grid gap-2">
        {(
          [
            ['#86EFAC', 'veg'],
            ['#93C5FD', 'protein'],
            ['#FDBA74', 'carbs'],
            ['#FDE68A', 'fat'],
            ['#BAE6FD', 'water'],
          ] as const
        ).map(([color, key]) => (
          <li key={key} className="flex items-start gap-2">
            <span className="mt-1 size-4 shrink-0 rounded" style={{ background: color }} aria-hidden />
            <span>
              <b>{tr(key)}</b> <span style={{ color: INK2 }}>{tr(`${key}_d`)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
