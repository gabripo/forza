import type { L10n } from '../lib/types'

/** Peer-reviewed sources behind what the Training section says. Each link is the paper's DOI. */
export interface Source {
  id: string
  authors: string
  year: number
  title: string
  journal: string
  url: string
}

const S = (id: string, authors: string, year: number, title: string, journal: string, doi: string): Source => ({ id, authors, year, title, journal, url: `https://doi.org/${doi}` })

export const SOURCES: Record<string, Source> = Object.fromEntries(
  [
    S('who2020', 'Bull FC et al.', 2020, 'World Health Organization 2020 guidelines on physical activity and sedentary behaviour', 'British Journal of Sports Medicine 54:1451–1462', '10.1136/bjsports-2020-102955'),
    S('fragala2019', 'Fragala MS et al.', 2019, 'Resistance Training for Older Adults: Position Statement From the National Strength and Conditioning Association', 'Journal of Strength and Conditioning Research 33(8):2019–2052', '10.1519/JSC.0000000000003230'),
    S('peterson2010', 'Peterson MD et al.', 2010, 'Resistance exercise for muscular strength in older adults: a meta-analysis', 'Ageing Research Reviews 9(3):226–237', '10.1016/j.arr.2010.03.004'),
    S('acsm2009', 'American College of Sports Medicine', 2009, 'Progression Models in Resistance Training for Healthy Adults (position stand)', 'Medicine & Science in Sports & Exercise 41(3):687–708', '10.1249/MSS.0b013e3181915670'),
    S('schoenfeld2017load', 'Schoenfeld BJ et al.', 2017, 'Strength and Hypertrophy Adaptations Between Low- vs. High-Load Resistance Training: A Systematic Review and Meta-analysis', 'Journal of Strength and Conditioning Research 31(12):3508–3523', '10.1519/JSC.0000000000002200'),
    S('schoenfeld2017volume', 'Schoenfeld BJ et al.', 2017, 'Dose-response relationship between weekly resistance training volume and increases in muscle mass: a systematic review and meta-analysis', 'Journal of Sports Sciences 35(11):1073–1082', '10.1080/02640414.2016.1210197'),
    S('schoenfeld2016frequency', 'Schoenfeld BJ et al.', 2016, 'Effects of Resistance Training Frequency on Measures of Muscle Hypertrophy: A Systematic Review and Meta-Analysis', 'Sports Medicine 46(11):1689–1697', '10.1007/s40279-016-0543-8'),
    S('grgic2022', 'Grgic J et al.', 2022, 'Effects of resistance training performed to repetition failure or non-failure on muscular strength and hypertrophy: a systematic review and meta-analysis', 'Journal of Sport and Health Science 11(2):202–211', '10.1016/j.jshs.2021.01.007'),
    S('zourdos2016', 'Zourdos MC et al.', 2016, 'Novel Resistance Training–Specific Rating of Perceived Exertion Scale Measuring Repetitions in Reserve', 'Journal of Strength and Conditioning Research 30(1):267–275', '10.1519/JSC.0000000000001049'),
    S('fradkin2010', 'Fradkin AJ et al.', 2010, 'Effects of Warming-up on Physical Performance: A Systematic Review With Meta-analysis', 'Journal of Strength and Conditioning Research 24(1):140–148', '10.1519/JSC.0b013e3181c643a0'),
    S('grgic2018', 'Grgic J et al.', 2018, 'Effects of Rest Interval Duration in Resistance Training on Measures of Muscular Strength: A Systematic Review', 'Sports Medicine 48(1):137–151', '10.1007/s40279-017-0788-x'),
    S('weakley2017', 'Weakley JJS et al.', 2017, 'The effects of traditional, superset, and tri-set resistance training structures on perceived intensity and physiological responses', 'European Journal of Applied Physiology 117(9):1877–1889', '10.1007/s00421-017-3680-3'),
    S('morton2018', 'Morton RW et al.', 2018, 'A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults', 'British Journal of Sports Medicine 52(6):376–384', '10.1136/bjsports-2017-097608'),
  ].map((s) => [s.id, s]),
)

/** The main ideas behind the Training section, each with its sources. */
export const TRAINING_FACTS: { id: string; emoji: string; text: L10n; sources: string[] }[] = [
  {
    id: 'twice',
    emoji: '📅',
    text: {
      en: 'Strength training on 2 or more days a week is recommended for every adult, older adults included.',
      it: 'Allenare la forza 2 o più giorni a settimana è raccomandato a tutti gli adulti, anche dopo i 65 anni.',
    },
    sources: ['who2020', 'fragala2019'],
  },
  {
    id: 'any_age',
    emoji: '💪',
    text: {
      en: 'Muscles get stronger at any age: older adults gain strength with regular resistance training.',
      it: 'I muscoli si rinforzano a ogni età: anche da anziani si guadagna forza con un allenamento regolare.',
    },
    sources: ['peterson2010', 'fragala2019'],
  },
  {
    id: 'progression',
    emoji: '📈',
    text: {
      en: 'Add a little weight only when you reach the top of the rep range on every set: small, steady steps (“progressive overload”).',
      it: 'Aumenta un po’ il peso solo quando arrivi al massimo delle ripetizioni in tutte le serie: piccoli passi costanti (il “sovraccarico progressivo”).',
    },
    sources: ['acsm2009'],
  },
  {
    id: 'no_failure',
    emoji: '🙂',
    text: {
      en: 'No need to go to exhaustion: stopping with 1–3 reps “in reserve” builds strength and muscle about as well.',
      it: 'Non serve arrivare allo sfinimento: fermarsi con 1–3 ripetizioni “di riserva” dà quasi gli stessi risultati in forza e muscolo.',
    },
    sources: ['grgic2022', 'zourdos2016'],
  },
  {
    id: 'light_ok',
    emoji: '🪶',
    text: {
      en: 'Light weights work too when the sets are hard enough; heavier weights build a bit more strength.',
      it: 'Anche i pesi leggeri funzionano, se le serie sono abbastanza impegnative; i pesi più pesanti danno un po’ più forza.',
    },
    sources: ['schoenfeld2017load'],
  },
  {
    id: 'volume',
    emoji: '🧮',
    text: {
      en: 'More sets a week, and each muscle trained twice a week rather than once, bring more muscle: start with a few sets and add more over the months.',
      it: 'Più serie a settimana, e ogni muscolo allenato due volte a settimana invece di una, danno più muscolo: inizia con poche serie e aggiungine nei mesi.',
    },
    sources: ['schoenfeld2017volume', 'schoenfeld2016frequency'],
  },
  {
    id: 'warmup',
    emoji: '🔥',
    text: {
      en: 'Warming up with lighter sets improves performance in the sets that count.',
      it: 'Scaldarsi con serie più leggere migliora la prestazione nelle serie che contano.',
    },
    sources: ['fradkin2010'],
  },
  {
    id: 'rest',
    emoji: '⏱️',
    text: {
      en: 'Rest 1–3 minutes between sets: longer rests help heavy lifts, shorter ones are fine for beginners and lighter exercises.',
      it: 'Riposa 1–3 minuti tra le serie: pause più lunghe aiutano con i pesi pesanti, più brevi vanno bene per chi inizia e per gli esercizi leggeri.',
    },
    sources: ['grgic2018'],
  },
  {
    id: 'supersets',
    emoji: '🔗',
    text: {
      en: 'Supersets (two exercises alternated) save time, at the cost of feeling a little harder.',
      it: 'I superset (due esercizi alternati) fanno risparmiare tempo, ma si sentono un po’ più faticosi.',
    },
    sources: ['weakley2017'],
  },
  {
    id: 'protein',
    emoji: '🥚',
    text: {
      en: 'Enough protein (about 1.6 g per kg of body weight a day) adds to the muscle and strength gained by training.',
      it: 'Abbastanza proteine (circa 1,6 g per kg di peso al giorno) aumentano il muscolo e la forza guadagnati con l’allenamento.',
    },
    sources: ['morton2018'],
  },
]
