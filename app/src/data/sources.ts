import type { L10n } from '../lib/types'

/** The sources behind what Forza! teaches: the Training section and every lesson. Papers link to their DOI. */
export interface Source {
  id: string
  authors: string
  year: number
  title: string
  journal: string
  url: string
}

const S = (id: string, authors: string, year: number, title: string, journal: string, doi: string): Source => ({ id, authors, year, title, journal, url: `https://doi.org/${doi}` })
/** A reference website (food tables, public-health guidance). */
const W = (id: string, authors: string, year: number, title: string, url: string): Source => ({ id, authors, year, title, journal: new URL(url).hostname, url })

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
    // Lessons
    S('cruzjentoft2019', 'Cruz-Jentoft AJ et al.', 2019, 'Sarcopenia: revised European consensus on definition and diagnosis', 'Age and Ageing 48(1):16–31', '10.1093/ageing/afy169'),
    S('trumbo2002', 'Trumbo P et al.', 2002, 'Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein and Amino Acids', 'Journal of the American Dietetic Association 102(11):1621–1630', '10.1016/S0002-8223(02)90346-9'),
    S('willett2019', 'Willett W et al.', 2019, 'Food in the Anthropocene: the EAT–Lancet Commission on healthy diets from sustainable food systems', 'The Lancet 393(10170):447–492', '10.1016/S0140-6736(18)31788-4'),
    S('estruch2018', 'Estruch R et al.', 2018, 'Primary Prevention of Cardiovascular Disease with a Mediterranean Diet Supplemented with Extra-Virgin Olive Oil or Nuts', 'New England Journal of Medicine 378(25):e34', '10.1056/NEJMoa1800389'),
    S('bauer2013', 'Bauer J et al.', 2013, 'Evidence-based recommendations for optimal dietary protein intake in older people: a position paper from the PROT-AGE Study Group', 'Journal of the American Medical Directors Association 14(8):542–559', '10.1016/j.jamda.2013.05.021'),
    S('leidy2015', 'Leidy HJ et al.', 2015, 'The role of protein in weight loss and maintenance', 'American Journal of Clinical Nutrition 101(6):1320S–1329S', '10.3945/ajcn.114.084038'),
    S('reynolds2019', 'Reynolds A et al.', 2019, 'Carbohydrate quality and human health: a series of systematic reviews and meta-analyses', 'The Lancet 393(10170):434–445', '10.1016/S0140-6736(18)31809-9'),
    S('bird2017', 'Bird SR, Hawley JA', 2017, 'Update on the effects of physical activity on insulin sensitivity in humans', 'BMJ Open Sport & Exercise Medicine 2(1):e000143', '10.1136/bmjsem-2016-000143'),
    S('colberg2016', 'Colberg SR et al.', 2016, 'Physical Activity/Exercise and Diabetes: A Position Statement of the American Diabetes Association', 'Diabetes Care 39(11):2065–2079', '10.2337/dc16-1728'),
    S('kerksick2017', 'Kerksick CM et al.', 2017, 'International Society of Sports Nutrition position stand: nutrient timing', 'Journal of the International Society of Sports Nutrition 14:33', '10.1186/s12970-017-0189-4'),
    S('thomas2016', 'Thomas DT, Erdman KA, Burke LM', 2016, 'Nutrition and Athletic Performance (joint position statement)', 'Medicine & Science in Sports & Exercise 48(3):543–568', '10.1249/MSS.0000000000000852'),
    S('paluch2022', 'Paluch AE et al.', 2022, 'Daily steps and all-cause mortality: a meta-analysis of 15 international cohorts', 'The Lancet Public Health 7(3):e219–e228', '10.1016/S2468-2667(21)00302-9'),
    S('watson2015', 'Watson NF et al.', 2015, 'Recommended Amount of Sleep for a Healthy Adult: A Joint Consensus Statement of the American Academy of Sleep Medicine and Sleep Research Society', 'Sleep 38(6):843–844', '10.5665/sleep.4716'),
    S('hirshkowitz2015', 'Hirshkowitz M et al.', 2015, 'National Sleep Foundation’s sleep time duration recommendations: methodology and results summary', 'Sleep Health 1(1):40–43', '10.1016/j.sleh.2014.12.010'),
    S('lally2010', 'Lally P et al.', 2010, 'How are habits formed: Modelling habit formation in the real world', 'European Journal of Social Psychology 40(6):998–1009', '10.1002/ejsp.674'),
    S('jenkins1981', 'Jenkins DJ et al.', 1981, 'Glycemic index of foods: a physiological basis for carbohydrate exchange', 'American Journal of Clinical Nutrition 34(3):362–366', '10.1093/ajcn/34.3.362'),
    S('shukla2015', 'Shukla AP et al.', 2015, 'Food Order Has a Significant Impact on Postprandial Glucose and Insulin Levels', 'Diabetes Care 38(7):e98–e99', '10.2337/dc15-0429'),
    S('rolls2004', 'Rolls BJ et al.', 2004, 'Salad and satiety: energy density and portion size of a first-course salad affect energy intake at lunch', 'Journal of the American Dietetic Association 104(10):1570–1576', '10.1016/j.jada.2004.07.001'),
    S('hearris2018', 'Hearris MA et al.', 2018, 'Regulation of Muscle Glycogen Metabolism during Exercise: Implications for Endurance Performance and Training Adaptations', 'Nutrients 10(3):298', '10.3390/nu10030298'),
    S('burke2011', 'Burke LM et al.', 2011, 'Carbohydrates for training and competition', 'Journal of Sports Sciences 29(sup1):S17–S27', '10.1080/02640414.2011.585473'),
    S('schoenfeld2013timing', 'Schoenfeld BJ et al.', 2013, 'The effect of protein timing on muscle strength and hypertrophy: a meta-analysis', 'Journal of the International Society of Sports Nutrition 10:53', '10.1186/1550-2783-10-53'),
    S('kreider2017', 'Kreider RB et al.', 2017, 'International Society of Sports Nutrition position stand: safety and efficacy of creatine supplementation in exercise, sport, and medicine', 'Journal of the International Society of Sports Nutrition 14:18', '10.1186/s12970-017-0173-z'),
    S('chilibeck2017', 'Chilibeck PD et al.', 2017, 'Effect of creatine supplementation during resistance training on lean tissue mass and muscular strength in older adults: a meta-analysis', 'Open Access Journal of Sports Medicine 8:213–226', '10.2147/OAJSM.S123529'),
    S('areta2013', 'Areta JL et al.', 2013, 'Timing and distribution of protein ingestion during prolonged recovery from resistance exercise alters myofibrillar protein synthesis', 'Journal of Physiology 591(9):2319–2331', '10.1113/jphysiol.2012.244897'),
    S('mamerow2014', 'Mamerow MM et al.', 2014, 'Dietary Protein Distribution Positively Influences 24-h Muscle Protein Synthesis in Healthy Adults', 'Journal of Nutrition 144(6):876–880', '10.3945/jn.113.185280'),
    S('schoenfeld2018meal', 'Schoenfeld BJ, Aragon AA', 2018, 'How much protein can the body use in a single meal for muscle-building? Implications for daily protein distribution', 'Journal of the International Society of Sports Nutrition 15:10', '10.1186/s12970-018-0215-1'),
    S('kellmann2018', 'Kellmann M et al.', 2018, 'Recovery and Performance in Sport: Consensus Statement', 'International Journal of Sports Physiology and Performance 13(2):240–245', '10.1123/ijspp.2017-0759'),
    W('harvard_plate', 'Harvard T.H. Chan School of Public Health', 2011, 'Healthy Eating Plate', 'https://www.hsph.harvard.edu/nutritionsource/healthy-eating-plate/'),
    W('usda_fdc', 'U.S. Department of Agriculture', 2019, 'FoodData Central (food composition database)', 'https://fdc.nal.usda.gov/'),
    W('crea_tables', 'CREA – Centro di ricerca Alimenti e Nutrizione', 2019, 'Tabelle di composizione degli alimenti', 'https://www.alimentinutrizione.it/'),
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

/** The sources behind each lesson (built-in lessons; the coach can set them for new ones in Coach). */
export const LESSON_SOURCES: Record<string, string[]> = {
  why_strength: ['fragala2019', 'peterson2010', 'cruzjentoft2019', 'who2020'],
  macros: ['trumbo2002', 'willett2019'],
  plate: ['harvard_plate', 'willett2019', 'estruch2018'],
  protein: ['bauer2013', 'morton2018', 'leidy2015'],
  food_sources: ['usda_fdc', 'crea_tables'],
  fiber: ['reynolds2019'],
  insulin: ['bird2017', 'colberg2016'],
  workout_food: ['kerksick2017', 'thomas2016'],
  meals: ['estruch2018', 'willett2019'],
  daily_activity: ['paluch2022', 'who2020'],
  sleep: ['watson2015', 'hirshkowitz2015'],
  small_habits: ['lally2010'],
  steady_energy: ['jenkins1981', 'reynolds2019'],
  meal_tricks: ['shukla2015', 'rolls2004'],
  glycogen: ['hearris2018', 'burke2011'],
  meal_timing: ['kerksick2017', 'schoenfeld2013timing'],
  creatine: ['kreider2017', 'chilibeck2017'],
  progressive_overload: ['acsm2009', 'schoenfeld2017volume'],
  protein_timing: ['areta2013', 'mamerow2014', 'schoenfeld2018meal'],
  recovery: ['kellmann2018', 'watson2015'],
}
