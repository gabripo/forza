import type { L10n } from '../lib/types'

export interface Tip {
  id: string
  text: L10n
  /** The lesson that explains it ("Why? Read the 1-minute lesson"). */
  topic: string
}

/**
 * One tip a day on the dashboard. `topic` links to the infographic that explains it. Ids are their place
 * in this list (tip1, tip2…), which Forza! Coach uses to change or hide them: add new tips at the end.
 */
const BUILT_IN: { text: L10n; topic: string }[] = [
  { topic: 'protein', text: { en: 'Eat enough protein at breakfast: eggs, yogurt or milk keep you full and give steady energy all morning.', it: 'Proteine a colazione: uova, yogurt o latte ti saziano e danno energia costante per tutta la mattina.' } },
  { topic: 'sleep', text: { en: 'Avoid sweets and processed snacks in the evening: they can make your sleep lighter and more broken.', it: 'Evita dolci e snack confezionati la sera: possono rendere il sonno più leggero e interrotto.' } },
  { topic: 'insulin', text: { en: 'A 10-minute walk after a meal helps your muscles use the sugar from the food.', it: 'Una passeggiata di 10 minuti dopo il pasto aiuta i muscoli a usare lo zucchero del cibo.' } },
  { topic: 'plate', text: { en: 'Fill half of your plate with vegetables: more volume, fewer calories, more fibre.', it: 'Riempi metà piatto di verdure: più volume, meno calorie, più fibre.' } },
  { topic: 'why_strength', text: { en: 'Muscles are like a savings account for old age: every workout is a deposit.', it: 'I muscoli sono come un conto di risparmio per la vecchiaia: ogni allenamento è un versamento.' } },
  { topic: 'daily_activity', text: { en: 'During TV ad breaks, stand up and walk around the house. It adds up!', it: 'Durante la pubblicità in TV alzati e fai un giro per casa. Si somma tutto!' } },
  { topic: 'fiber', text: { en: 'Add a spoon of legumes (beans, chickpeas, lentils) to your salad or soup: protein and fibre together.', it: 'Aggiungi un cucchiaio di legumi (fagioli, ceci, lenticchie) a insalate o zuppe: proteine e fibre insieme.' } },
  { topic: 'macros', text: { en: 'No food is forbidden. What matters is how much and how often.', it: 'Nessun cibo è vietato. Conta quanto e quanto spesso.' } },
  { topic: 'sleep', text: { en: 'Coffee keeps working for 6+ hours: have the last one before 2 pm for better sleep.', it: 'Il caffè agisce per più di 6 ore: prendi l\'ultimo prima delle 14 per dormire meglio.' } },
  { topic: 'workout_food', text: { en: 'After training, have a meal with protein within a couple of hours to help your muscles recover.', it: 'Dopo l\'allenamento fai un pasto con proteine entro un paio d\'ore per aiutare il recupero.' } },
  { topic: 'small_habits', text: { en: 'Drink a glass of water as soon as you wake up.', it: 'Bevi un bicchiere d\'acqua appena ti svegli.' } },
  { topic: 'insulin', text: { en: 'Eat vegetables and protein first, carbs last: your blood sugar rises more gently.', it: 'Mangia prima verdure e proteine, i carboidrati alla fine: la glicemia sale più dolcemente.' } },
  { topic: 'food_sources', text: { en: 'Greek yogurt has about twice the protein of regular yogurt.', it: 'Lo yogurt greco ha circa il doppio delle proteine dello yogurt normale.' } },
  { topic: 'why_strength', text: { en: 'Strong legs mean safer stairs and fewer falls. Squats are your best friend.', it: 'Gambe forti significano scale più sicure e meno cadute. Lo squat è il tuo migliore amico.' } },
  { topic: 'small_habits', text: { en: 'Sugary drinks are the easiest calories to cut: switch to water, sparkling water or tea.', it: 'Le bevande zuccherate sono le calorie più facili da togliere: passa ad acqua, acqua frizzante o tè.' } },
  { topic: 'daily_activity', text: { en: 'Take the stairs for one or two floors instead of the lift.', it: 'Fai uno o due piani a piedi invece di prendere l\'ascensore.' } },
  { topic: 'meals', text: { en: 'Cook once, eat twice: a pot of lentil soup or chicken and vegetables lasts for two days.', it: 'Cucina una volta, mangia due: una pentola di zuppa di lenticchie o pollo e verdure dura due giorni.' } },
  { topic: 'sleep', text: { en: 'Go to bed and wake up at the same time, even on Sundays.', it: 'Vai a letto e alzati alla stessa ora, anche la domenica.' } },
  { topic: 'protein', text: { en: 'Spread protein across the day: about a palm-sized portion at every meal.', it: 'Distribuisci le proteine nella giornata: una porzione grande come il palmo a ogni pasto.' } },
  { topic: 'fiber', text: { en: 'Choose wholegrain bread and pasta: same taste after a week, much more fibre.', it: 'Scegli pane e pasta integrali: dopo una settimana il gusto ti sembrerà lo stesso, con molte più fibre.' } },
  { topic: 'why_strength', text: { en: 'Progress is slow but real: a little more weight or one more rep is a win.', it: 'I progressi sono lenti ma reali: un po\' di peso in più o una ripetizione in più è una vittoria.' } },
  { topic: 'macros', text: { en: 'Olive oil is healthy but dense: one tablespoon is about 90 kcal. Measure it with a spoon.', it: 'L\'olio d\'oliva è sano ma calorico: un cucchiaio sono circa 90 kcal. Misuralo con il cucchiaio.' } },
  { topic: 'daily_activity', text: { en: 'Walk while you are on the phone.', it: 'Cammina mentre sei al telefono.' } },
  { topic: 'workout_food', text: { en: 'Before training, a banana or a slice of bread with jam gives you quick energy.', it: 'Prima dell\'allenamento una banana o una fetta di pane con marmellata ti danno energia rapida.' } },
]

export const TIPS: Tip[] = BUILT_IN.map((t, i) => ({ id: `tip${i + 1}`, ...t }))

export function tipOfTheDay(date = new Date(), tips: Tip[] = TIPS): Tip {
  const dayNumber = Math.floor(date.getTime() / 86_400_000)
  return tips[dayNumber % tips.length] ?? TIPS[0]
}
