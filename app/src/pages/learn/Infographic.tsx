import { Check, ChevronRight, Download, Printer } from 'lucide-react'
import { Component, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { Button, Loading, PageHeader, Segmented } from '../../components/ui'
import { translate, useI18n } from '../../lib/i18n'
import { Quiz } from '../../components/Quiz'
import { getLessonProgress, markLessonRead } from '../../lib/data'
import { quizOf, useKnowledge } from '../../lib/knowledge'
import { saveNodeAsImage } from '../../lib/share'
import type { L10n, Locale } from '../../lib/types'
import { type Block, type Tone, type Topic } from './content'
import { LESSON_SOURCES, SOURCES } from '../../data/sources'

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
  const navigate = useNavigate()
  const [lang, setLang] = useState<Locale>(locale)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [read, setRead] = useState(false)
  const knowledge = useKnowledge()
  const [quizPassed, setQuizPassed] = useState(false)
  useEffect(() => {
    if (!id) return
    void getLessonProgress()
      .then((rows) => {
        const row = rows.find((r) => r.lesson_id === id)
        setRead(Boolean(row))
        setQuizPassed(Boolean(row?.quiz_passed_at))
      })
      .catch(() => {})
  }, [id])
  const topic = knowledge.byId(id)
  if (!topic) return knowledge.settled ? <Navigate to="/learn" replace /> : <Loading />
  const track = knowledge.trackOf(topic.id) === 'expert' ? knowledge.expert : knowledge.course
  const next = track[track.findIndex((x) => x.id === topic.id) + 1]
  const questions = quizOf(topic)

  async function toggleRead() {
    const value = !read
    setRead(value)
    await markLessonRead(topic!.id, value).catch(() => setRead(!value))
  }
  const L = (x: L10n) => x[lang]

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
            <Button variant="secondary" onClick={() => navigate(`/learn/print/${topic.id}?lang=${lang}`)}>
              <Printer className="size-5" aria-hidden /> {t('learn.printA4')}
            </Button>
            <Button variant="secondary" onClick={saveImage} loading={saving}>
              <Download className="size-5" aria-hidden /> {t('learn.saveImage')}
            </Button>
          </div>
        </div>
      </div>

      <LessonArticle ref={ref} topic={topic} lang={lang} />

      <div className="no-print grid gap-3">
        {questions.length ? (
          <Quiz
            key={`${topic.id}-${lang}`}
            lessonId={topic.id}
            questions={questions}
            passedBefore={quizPassed}
            onPassed={() => {
              setQuizPassed(true)
              setRead(true)
            }}
          />
        ) : null}
        <Button size="lg" variant={read ? 'secondary' : 'leaf'} onClick={toggleRead}>
          <Check className="size-5" aria-hidden /> {read ? t('learn.markedRead') : t('learn.markRead')}
        </Button>
        {next ? (
          <Link
            to={`/learn/${next.id}`}
            onClick={() => {
              if (!read) void markLessonRead(topic.id).catch(() => {})
            }}
            className="flex items-center gap-3 rounded-3xl border border-line bg-card p-3"
          >
            <span className="text-3xl" aria-hidden>
              {next.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-ink-3">{t('learn.nextLesson')}</span>
              <span className="block font-bold">{next.title[locale]}</span>
            </span>
            <ChevronRight className="size-5 text-ink-3" aria-hidden />
          </Link>
        ) : null}
      </div>
    </div>
  )
}

/** One lesson as an infographic: on screen, saved as an image, or printed on A4. */
export function LessonArticle({ topic, lang, ref, className = '' }: { topic: Topic; lang: Locale; ref?: Ref<HTMLDivElement>; className?: string }) {
  const L = (x: L10n) => x[lang]
  const tone = TONES[topic.tone]
  return (
    <article
      ref={ref}
      lang={lang}
      className={`print-area overflow-hidden rounded-3xl shadow-sm ring-1 ring-black/5 ${className}`}
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
          <BlockGuard key={i}>
            <BlockView block={b} lang={lang} tone={topic.tone} />
          </BlockGuard>
        ))}
      </div>
      <References topic={topic} lang={lang} />
      <footer className="flex items-center gap-2 px-5 pb-5 text-xs" style={{ color: INK2 }}>
        <Logo size={22} />
        <span className="font-bold" style={{ color: INK }}>
          Forza!
        </span>
        <span>· {translate(lang, 'learn.disclaimer')}</span>
      </footer>
    </article>
  )
}

/** A block written in Coach that does not fit its type shows nothing, instead of breaking the lesson. */
class BlockGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** The lesson's sources, written out in full so they are readable on paper too. */
function References({ topic, lang }: { topic: Topic; lang: Locale }) {
  const refs = (topic.sources ?? LESSON_SOURCES[topic.id] ?? []).map((s) => (typeof s === 'string' ? SOURCES[s] : s)).filter(Boolean)
  if (!refs.length) return null
  return (
    <section className="px-5 pb-4 text-xs leading-snug" style={{ color: INK2 }}>
      <h2 className="mb-1 font-bold" style={{ color: INK }}>
        {translate(lang, 'sources.title')}
      </h2>
      <ol className="grid list-decimal gap-1 pl-4">
        {refs.map((s, i) => (
          <li key={i}>
            {s.authors ? `${s.authors} ` : ''}
            {s.year ? `(${s.year}). ` : ''}
            {s.title}.{s.journal ? <i> {s.journal}.</i> : null}{' '}
            {s.url ? (
              <a href={s.url} target="_blank" rel="noreferrer" className="underline" style={{ color: INK2 }}>
                {s.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
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

    case 'scale':
      return <ScaleDiagram lang={lang} />

    case 'stack':
      return <StackBars block={block} lang={lang} />
  }
}

/** One bar per item, its parts side by side with a thin gap; numbers inside the wide parts and all of them below. */
function StackBars({ block, lang }: { block: Extract<Block, { type: 'stack' }>; lang: Locale }) {
  const L = (x: L10n) => x[lang]
  const fmt = new Intl.NumberFormat(lang === 'it' ? 'it-IT' : 'en-GB').format
  const totals = block.items.map((it) => it.values.reduce((a, b) => a + b, 0))
  const max = Math.max(...totals)
  return (
    <section>
      <h2 className="mb-2 text-lg font-extrabold">{L(block.title)}</h2>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {block.parts.map((p, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="size-3.5 shrink-0 rounded" style={{ background: TONES[p.tone].accent }} aria-hidden />
            {L(p.label)}
          </li>
        ))}
      </ul>
      <ul className="grid gap-4">
        {block.items.map((it, i) => {
          const parts = it.values.map((v, j) => ({ v, part: block.parts[j] })).filter((x) => x.v > 0 && x.part)
          const said = parts.map((x) => `${L(x.part.label)} ${fmt(x.v)}`).join(' · ')
          return (
            <li key={i}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="leading-tight font-extrabold">
                  <span aria-hidden>{it.emoji}</span> {L(it.label)}
                </p>
                <p className="shrink-0 font-extrabold whitespace-nowrap">
                  {fmt(totals[i])} {block.unit}
                </p>
              </div>
              {it.note ? (
                <p className="text-sm leading-snug" style={{ color: INK2 }}>
                  {L(it.note)}
                </p>
              ) : null}
              <div className="mt-1.5 flex h-8 gap-0.5" style={{ width: `${(totals[i] / max) * 100}%` }} role="img" aria-label={`${L(it.label)}: ${said}`}>
                {parts.map((x, j) => (
                  <div
                    key={j}
                    title={`${L(x.part.label)}: ${fmt(x.v)} ${block.unit}`}
                    className="grid min-w-0 place-items-center overflow-hidden text-xs font-bold text-white"
                    style={{ flex: `${x.v} 1 0`, background: TONES[x.part.tone].accent, borderRadius: j === parts.length - 1 ? '0 4px 4px 0' : 0 }}
                  >
                    {x.v / totals[i] >= 0.12 ? fmt(x.v) : ''}
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs" style={{ color: INK2 }}>
                {said}
              </p>
            </li>
          )
        })}
      </ul>
      {block.note ? (
        <p className="mt-2 text-sm" style={{ color: INK2 }}>
          {L(block.note)}
        </p>
      ) : null}
    </section>
  )
}

// Four weeks of one person's morning weigh-ins (kg): water, salt and weekends around a real loss of 1 kg
// (70 → 69 kg, the line), with a first week that alone looks like a gain of almost 1 kg.
const SCALE_KG = [
  69.52, 69.6, 69.78, 69.96, 70.13, 70.31, 70.49, 70.17, 69.74, 69.33, 69.1, 69.18, 69.57, 69.94, 69.82, 69.39, 69.08, 68.85, 69.13, 69.51, 69.89, 69.56,
  69.15, 68.83, 68.9, 68.68, 69.06, 69.34,
]

function ScaleDiagram({ lang }: { lang: Locale }) {
  const tr = (k: string, vars?: Record<string, string | number>) => translate(lang, `learn.scale.${k}`, vars)
  const kgFmt = new Intl.NumberFormat(lang === 'it' ? 'it-IT' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format
  const x = (day: number) => 40 + day * 10.5
  const y = (kg: number) => 18 + (70.8 - kg) * 62
  const blue = TONES.blue.accent
  const orange = TONES.orange.accent
  return (
    <section>
      <h2 className="mb-2 text-lg font-extrabold">{tr('title')}</h2>
      <svg viewBox="0 0 340 196" className="w-full" role="img" aria-label={tr('aria')}>
        {/* Week 1, the misleading one */}
        <rect x={x(-0.5)} y={8} width={x(6.5) - x(-0.5)} height={y(68.5) - 8} rx={6} fill={TONES.orange.bg} />
        {[69, 70].map((kg) => (
          <g key={kg}>
            <line x1={x(-0.5)} x2={x(27.5)} y1={y(kg)} y2={y(kg)} stroke="#E7E5E4" strokeWidth={1} />
            <text x={34} y={y(kg) + 4} textAnchor="end" fontSize={11} fill={INK2}>
              {kg} kg
            </text>
          </g>
        ))}
        {[6.5, 13.5, 20.5].map((d) => (
          <line key={d} x1={x(d)} x2={x(d)} y1={8} y2={y(68.5)} stroke="#E7E5E4" strokeWidth={1} />
        ))}
        {[0, 1, 2, 3].map((w) => (
          <text key={w} x={x(w * 7 + 3)} y={190} textAnchor="middle" fontSize={11} fontWeight={700} fill={INK2}>
            {tr('week', { n: w + 1 })}
          </text>
        ))}
        {/* The trend of the 4 weeks, and what week 1 alone seems to say */}
        <line x1={x(0)} y1={y(70)} x2={x(27)} y2={y(69)} stroke={blue} strokeWidth={2.5} strokeLinecap="round" />
        <line x1={x(0)} y1={y(SCALE_KG[0])} x2={x(6)} y2={y(SCALE_KG[6])} stroke={orange} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" />
        {SCALE_KG.map((kg, d) => (
          <circle key={d} cx={x(d)} cy={y(kg)} r={4} fill="#57534E" stroke="#fff" strokeWidth={1.5}>
            <title>{tr('dot', { day: d + 1, kg: kgFmt(kg) })}</title>
          </circle>
        ))}
        <text x={x(0)} y={20} fontSize={11} fontWeight={800} fill={TONES.orange.fg}>
          {tr('week1')}
        </text>
        <text x={x(27)} y={20} textAnchor="end" fontSize={11} fontWeight={800} fill={TONES.blue.fg}>
          {tr('month')}
        </text>
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <li className="flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden>
            <circle cx="7" cy="7" r="4.5" fill="#57534E" />
          </svg>
          {tr('daily')}
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="22" height="14" aria-hidden>
            <line x1="2" y1="7" x2="20" y2="7" stroke={blue} strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          {tr('trend')}
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="22" height="14" aria-hidden>
            <line x1="2" y1="7" x2="20" y2="7" stroke={orange} strokeWidth="2" strokeDasharray="5 4" />
          </svg>
          {tr('weekOne')}
        </li>
      </ul>
      <p className="mt-2 text-sm" style={{ color: INK2 }}>
        {tr('note')}
      </p>
    </section>
  )
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
