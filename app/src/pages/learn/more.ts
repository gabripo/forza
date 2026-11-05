// More lessons: "meal tricks" for the beginners' course, an expert track, and a short quiz for every
// lesson. Same format as content.ts (one printable infographic per topic, English and Italian).
import type { L10n } from '../../lib/types'
import type { Topic } from './content'

const L = (en: string, it: string): L10n => ({ en, it })

/** Two beginner lessons on eating for steady energy, added to the course after "Meal ideas". */
export const MEAL_TRICKS: Topic[] = [
  {
    id: 'steady_energy',
    emoji: '🔋',
    tone: 'yellow',
    title: L('Steady energy all day', 'Energia costante tutto il giorno'),
    subtitle: L('Spread the carbs, pair them well, avoid the 4 pm slump', 'Distribuisci i carboidrati, abbinali bene, evita il calo delle 16'),
    blocks: [
      { type: 'intro', text: L('Carbohydrates are your body’s fuel, like petrol for a car. Eating them all at once is like filling the tank to the brim and then running dry: a big rush, then a slump. Spreading them over the day keeps you going.', 'I carboidrati sono il carburante del corpo, come la benzina per l’auto. Mangiarli tutti in una volta è come riempire il serbatoio fino all’orlo e poi restare a secco: una grande spinta, poi il calo. Distribuirli nella giornata ti tiene in marcia.') },
      {
        type: 'timeline',
        title: L('A day with steady energy', 'Una giornata con energia costante'),
        items: [
          { emoji: '🌅', time: L('Breakfast', 'Colazione'), text: L('Protein + slow carbs: yogurt with oats and fruit, or eggs with wholegrain bread.', 'Proteine + carboidrati lenti: yogurt con fiocchi d’avena e frutta, oppure uova con pane integrale.') },
          { emoji: '🍎', time: L('Mid-morning', 'Metà mattina'), text: L('If hungry: a fruit with a handful of nuts.', 'Se hai fame: un frutto con una manciata di frutta secca.') },
          { emoji: '🍝', time: L('Lunch', 'Pranzo'), text: L('A fist of pasta, rice or bread, a palm of protein, half the plate vegetables.', 'Un pugno di pasta, riso o pane, un palmo di proteine, metà piatto di verdure.') },
          { emoji: '🥛', time: L('Afternoon', 'Pomeriggio'), text: L('Yogurt or milk + fruit: beats the 4 pm slump better than biscuits.', 'Yogurt o latte + frutta: batte il calo delle 16 meglio dei biscotti.') },
          { emoji: '🍲', time: L('Dinner', 'Cena'), text: L('Like lunch, with a smaller portion of carbs if you are less active in the evening.', 'Come il pranzo, con meno carboidrati se la sera ti muovi meno.') },
        ],
      },
      {
        type: 'cards',
        title: L('Three tricks', 'Tre trucchi'),
        cols: 3,
        items: [
          { emoji: '🤝', title: L('Never carbs alone', 'Mai carboidrati da soli'), text: L('Add protein or fibre: bread with ham, fruit with yogurt. Sugar enters the blood more gently.', 'Aggiungi proteine o fibre: pane e prosciutto, frutta e yogurt. Lo zucchero entra nel sangue più dolcemente.'), tone: 'green' },
          { emoji: '⚖️', title: L('Similar portions', 'Porzioni simili'), text: L('Two or three similar meals beat one small and one huge meal.', 'Due o tre pasti simili sono meglio di uno piccolo e uno enorme.'), tone: 'blue' },
          { emoji: '🌾', title: L('Choose slow carbs', 'Scegli carboidrati lenti'), text: L('Whole grains, legumes, fruit: they last longer than white bread and sweets.', 'Cereali integrali, legumi, frutta: durano più a lungo di pane bianco e dolci.'), tone: 'orange' },
        ],
      },
      { type: 'callout', emoji: '😴', text: L('Sleepy after lunch? Try a smaller plate of pasta with more vegetables and protein, and a 10-minute walk.', 'Sonnolenza dopo pranzo? Prova un piatto di pasta più piccolo con più verdure e proteine, e una passeggiata di 10 minuti.') },
    ],
  },
  {
    id: 'meal_tricks',
    emoji: '🪄',
    tone: 'green',
    title: L('Simple meal tricks', 'Piccoli trucchi a tavola'),
    subtitle: L('Eat well without counting anything', 'Mangiare bene senza contare niente'),
    blocks: [
      { type: 'intro', text: L('You don’t need to weigh food or count calories to eat well. A few habits do most of the work.', 'Non serve pesare il cibo o contare le calorie per mangiare bene. Poche abitudini fanno quasi tutto il lavoro.') },
      {
        type: 'steps',
        title: L('At every meal', 'A ogni pasto'),
        items: [
          { title: L('Start with vegetables', 'Inizia dalle verdure'), text: L('A salad or vegetable soup first fills you up and slows down the sugar.', 'Un’insalata o un minestrone all’inizio saziano e rallentano lo zucchero.') },
          { title: L('A palm of protein', 'Un palmo di proteine'), text: L('Meat, fish, eggs, cheese, legumes or tofu: every meal, not just dinner.', 'Carne, pesce, uova, formaggio, legumi o tofu: a ogni pasto, non solo a cena.') },
          { title: L('A fist of carbs', 'Un pugno di carboidrati'), text: L('Bread, pasta, rice or potatoes: one fist is a good portion for most meals.', 'Pane, pasta, riso o patate: un pugno è una buona porzione per quasi tutti i pasti.') },
          { title: L('Eat slowly', 'Mangia piano'), text: L('Put the fork down between bites: fullness takes about 20 minutes to arrive.', 'Appoggia la forchetta tra un boccone e l’altro: il senso di sazietà arriva dopo circa 20 minuti.') },
        ],
      },
      {
        type: 'swaps',
        title: L('Easy swaps', 'Scambi facili'),
        items: [
          { from: L('Sweet biscuits at breakfast', 'Biscotti a colazione'), to: L('Greek yogurt, oats and fruit', 'Yogurt greco, avena e frutta') },
          { from: L('Juice or soda', 'Succo o bibita'), to: L('Water, sparkling water, tea', 'Acqua, acqua frizzante, tè') },
          { from: L('Crisps in front of the TV', 'Patatine davanti alla TV'), to: L('A handful of nuts or popcorn', 'Una manciata di frutta secca o popcorn') },
          { from: L('Second plate of pasta', 'Il bis di pasta'), to: L('More vegetables and protein', 'Più verdure e proteine') },
        ],
      },
      { type: 'callout', emoji: '📷', text: L('Not sure about a meal? Snap it in Forza!: it tells you what to add or change.', 'Dubbi su un pasto? Fotografalo in Forza!: ti dice cosa aggiungere o cambiare.') },
    ],
  },
]

/** The expert track: training and nutrition fundamentals, for when the basics are clear. */
export const EXPERT_TOPICS: Topic[] = [
  {
    id: 'glycogen',
    emoji: '⛽',
    tone: 'orange',
    title: L('What is glycogen?', 'Cos’è il glicogeno?'),
    subtitle: L('The fuel tank in your muscles and liver', 'Il serbatoio di carburante in muscoli e fegato'),
    blocks: [
      { type: 'intro', text: L('Glycogen is how the body stores carbohydrates: long chains of glucose kept in the muscles (about 400 g) and in the liver (about 100 g). Each gram is stored with about 3 g of water.', 'Il glicogeno è il modo in cui il corpo conserva i carboidrati: lunghe catene di glucosio nei muscoli (circa 400 g) e nel fegato (circa 100 g). Ogni grammo è legato a circa 3 g di acqua.') },
      {
        type: 'cards',
        cols: 3,
        items: [
          { emoji: '💪', title: L('Muscle glycogen', 'Glicogeno muscolare'), text: L('Fuel for the muscle that holds it: sets, sprints, climbs. Low glycogen = weaker, slower sets.', 'Carburante per il muscolo che lo contiene: serie, scatti, salite. Poco glicogeno = serie più deboli e lente.'), tone: 'orange' },
          { emoji: '🫀', title: L('Liver glycogen', 'Glicogeno epatico'), text: L('Keeps blood sugar steady between meals and overnight, for the brain too.', 'Mantiene stabile la glicemia tra i pasti e di notte, anche per il cervello.'), tone: 'blue' },
          { emoji: '⚖️', title: L('Water weight', 'Peso dell’acqua'), text: L('Fewer carbs → less glycogen and water: 1–2 kg can disappear in days. It is not fat.', 'Meno carboidrati → meno glicogeno e acqua: 1–2 kg possono sparire in pochi giorni. Non è grasso.'), tone: 'green' },
        ],
      },
      {
        type: 'steps',
        title: L('What it means in practice', 'Cosa significa in pratica'),
        items: [
          { title: L('Lifting runs on glycogen', 'Allenarsi con i pesi usa il glicogeno'), text: L('A meal with carbs 2–4 hours before training helps you perform.', 'Un pasto con carboidrati 2–4 ore prima dell’allenamento aiuta la prestazione.') },
          { title: L('Refill after training', 'Ricarica dopo l’allenamento'), text: L('Carbs + protein after a workout rebuild glycogen and muscle.', 'Carboidrati + proteine dopo l’allenamento ricostruiscono glicogeno e muscolo.') },
          { title: L('Read the scale wisely', 'Leggi la bilancia con giudizio'), text: L('A salty or carb-rich dinner can add 1 kg of water overnight: look at the trend.', 'Una cena salata o ricca di carboidrati può aggiungere 1 kg d’acqua in una notte: guarda la tendenza.') },
        ],
      },
      { type: 'callout', emoji: '🧠', text: L('Low-carb diets make the first week look great on the scale: most of it is glycogen water coming back later.', 'Le diete povere di carboidrati fanno sembrare ottima la prima settimana sulla bilancia: è soprattutto acqua del glicogeno, che poi ritorna.') },
    ],
  },
  {
    id: 'meal_timing',
    emoji: '⏰',
    tone: 'blue',
    title: L('What is meal timing?', 'Cos’è il meal timing?'),
    subtitle: L('When you eat matters less than what and how much, but it helps', 'Quando mangi conta meno di cosa e quanto, ma aiuta'),
    blocks: [
      { type: 'intro', text: L('Meal timing means planning when you eat, mainly around training and sleep. The order of importance: 1) total calories, 2) total protein, 3) food quality, 4) timing.', 'Meal timing significa pianificare quando mangi, soprattutto intorno ad allenamento e sonno. L’ordine di importanza: 1) calorie totali, 2) proteine totali, 3) qualità del cibo, 4) orari.') },
      {
        type: 'timeline',
        title: L('Around a workout', 'Intorno all’allenamento'),
        items: [
          { emoji: '🍽️', time: L('2–4 h before', '2–4 ore prima'), text: L('A normal meal with carbs and protein.', 'Un pasto normale con carboidrati e proteine.') },
          { emoji: '🍌', time: L('30–60 min before', '30–60 min prima'), text: L('Only if hungry: something light, like a banana or yogurt.', 'Solo se hai fame: qualcosa di leggero, come una banana o uno yogurt.') },
          { emoji: '🏋️', time: L('During', 'Durante'), text: L('Water. Sports drinks only for sessions longer than ~90 minutes.', 'Acqua. Bevande sportive solo per sedute oltre i ~90 minuti.') },
          { emoji: '🥚', time: L('Within ~2 h after', 'Entro ~2 ore dopo'), text: L('A meal with 25–40 g of protein and some carbs.', 'Un pasto con 25–40 g di proteine e un po’ di carboidrati.') },
        ],
      },
      {
        type: 'dodont',
        dos: [L('Spread protein over 3–4 meals', 'Distribuisci le proteine in 3–4 pasti'), L('Keep regular meal times: hunger becomes predictable', 'Tieni orari regolari: la fame diventa prevedibile'), L('Finish big meals 2–3 h before bed', 'Finisci i pasti abbondanti 2–3 ore prima di dormire')],
        donts: [L('Stress about a 30-minute "anabolic window"', 'Preoccuparti di una “finestra anabolica” di 30 minuti'), L('Skip meals and then binge in the evening', 'Saltare i pasti e poi abbuffarti la sera'), L('Train hard on an empty stomach if it makes you dizzy', 'Allenarti forte a digiuno se ti gira la testa')],
      },
      { type: 'callout', emoji: '🧩', text: L('Intermittent fasting works only if it helps you eat less overall: it has no magic of its own.', 'Il digiuno intermittente funziona solo se ti aiuta a mangiare meno in totale: non ha magie proprie.') },
    ],
  },
  {
    id: 'creatine',
    emoji: '🧪',
    tone: 'purple',
    title: L('What does creatine do?', 'A cosa serve la creatina?'),
    subtitle: L('The most studied supplement for strength', 'L’integratore più studiato per la forza'),
    blocks: [
      { type: 'intro', text: L('Creatine is a natural substance in meat and fish that muscles use for short, intense efforts (like a heavy set). As a supplement (creatine monohydrate), it fills the muscles’ “quick energy” stores.', 'La creatina è una sostanza naturale presente in carne e pesce, che i muscoli usano per sforzi brevi e intensi (come una serie pesante). Come integratore (creatina monoidrato) riempie le riserve di “energia rapida” dei muscoli.') },
      {
        type: 'cards',
        cols: 2,
        items: [
          { emoji: '📈', title: L('What it does', 'Cosa fa'), text: L('1–2 more reps per set, a bit more strength and muscle over months. Studies also show benefits in older adults.', '1–2 ripetizioni in più per serie, un po’ più di forza e muscolo nei mesi. Gli studi mostrano benefici anche negli anziani.'), tone: 'purple' },
          { emoji: '🥄', title: L('How to take it', 'Come si prende'), text: L('3–5 g a day, any time, every day. No loading phase or cycling needed.', '3–5 g al giorno, a qualsiasi ora, tutti i giorni. Non servono fasi di carico né pause.'), tone: 'blue' },
          { emoji: '💧', title: L('Water in the muscle', 'Acqua nel muscolo'), text: L('Weight may go up 0.5–1 kg in the first weeks: water inside the muscle, not fat.', 'Il peso può salire di 0,5–1 kg nelle prime settimane: acqua dentro il muscolo, non grasso.'), tone: 'green' },
          { emoji: '🩺', title: L('Ask your doctor', 'Chiedi al medico'), text: L('Safe for healthy people. With kidney problems, talk to your doctor first.', 'Sicura per le persone sane. Con problemi ai reni, parlane prima con il medico.'), tone: 'pink' },
        ],
      },
      {
        type: 'dodont',
        dos: [L('Choose plain creatine monohydrate', 'Scegli creatina monoidrato semplice'), L('Take it daily, also on rest days', 'Prendila ogni giorno, anche a riposo'), L('Keep training and eating protein: it amplifies, it doesn’t replace', 'Continua ad allenarti e a mangiare proteine: amplifica, non sostituisce')],
        donts: [L('Pay more for "advanced" forms', 'Pagare di più per forme “avanzate”'), L('Expect results without training', 'Aspettarti risultati senza allenarti'), L('Exceed the dose: more is not better', 'Superare la dose: di più non è meglio')],
      },
    ],
  },
  {
    id: 'progressive_overload',
    emoji: '📶',
    tone: 'green',
    title: L('Progressive overload', 'Il sovraccarico progressivo'),
    subtitle: L('Why the weights in Forza! go up little by little', 'Perché i pesi in Forza! salgono poco alla volta'),
    blocks: [
      { type: 'intro', text: L('Muscles grow when they are asked to do a bit more than they are used to. Doing exactly the same workout forever stops working: you need to progress, slowly and safely.', 'I muscoli crescono quando gli si chiede un po’ più di quanto sono abituati. Fare per sempre lo stesso identico allenamento smette di funzionare: bisogna progredire, piano e in sicurezza.') },
      {
        type: 'steps',
        title: L('Double progression (what Forza! does)', 'Doppia progressione (quello che fa Forza!)'),
        items: [
          { title: L('Pick a rep range', 'Scegli un intervallo di ripetizioni'), text: L('For example 8–12.', 'Per esempio 8–12.') },
          { title: L('Add reps first', 'Prima aggiungi ripetizioni'), text: L('Same weight, one more rep each week, until every set reaches 12.', 'Stesso peso, una ripetizione in più ogni settimana, finché ogni serie arriva a 12.') },
          { title: L('Then add weight', 'Poi aggiungi peso'), text: L('Go up 2–2.5 kg and start again from 8.', 'Sali di 2–2,5 kg e riparti da 8.') },
        ],
      },
      {
        type: 'cards',
        cols: 2,
        items: [
          { emoji: '🎯', title: L('Reps in reserve (RIR)', 'Ripetizioni in riserva (RIR)'), text: L('How many more reps you could do. Stop most sets with 1–3 in reserve: hard but safe.', 'Quante ripetizioni potresti ancora fare. Ferma quasi tutte le serie con 1–3 in riserva: impegnativo ma sicuro.'), tone: 'green' },
          { emoji: '📦', title: L('Volume', 'Volume'), text: L('About 10 hard sets per muscle per week work well for most people.', 'Circa 10 serie impegnative per muscolo a settimana funzionano bene per la maggior parte delle persone.'), tone: 'blue' },
        ],
      },
      { type: 'callout', emoji: '🐢', text: L('Slow progress is still progress: +2.5 kg a month is +30 kg a year.', 'Un progresso lento è comunque progresso: +2,5 kg al mese sono +30 kg in un anno.') },
    ],
  },
  {
    id: 'protein_timing',
    emoji: '🥚',
    tone: 'pink',
    title: L('Protein: how much per meal?', 'Proteine: quante per pasto?'),
    subtitle: L('Leucine, distribution and the evening meal', 'Leucina, distribuzione e il pasto serale'),
    blocks: [
      { type: 'intro', text: L('Muscles build best when each meal brings enough protein to "switch on" muscle building: about 0.4 g per kg of body weight, which contains roughly 2.5–3 g of leucine, the amino acid that acts as the switch.', 'I muscoli si costruiscono meglio quando ogni pasto porta abbastanza proteine da “accendere” la sintesi muscolare: circa 0,4 g per kg di peso, che contengono circa 2,5–3 g di leucina, l’aminoacido che fa da interruttore.') },
      {
        type: 'bars',
        title: L('Protein in a typical day (g)', 'Proteine in una giornata tipo (g)'),
        unit: 'g',
        items: [
          { label: L('Usual breakfast', 'Colazione abituale'), value: 8 },
          { label: L('Better breakfast', 'Colazione migliore'), value: 30 },
          { label: L('Lunch', 'Pranzo'), value: 30 },
          { label: L('Dinner', 'Cena'), value: 35 },
        ],
      },
      {
        type: 'cards',
        cols: 3,
        items: [
          { emoji: '🧓', title: L('After 60', 'Dopo i 60 anni'), text: L('Muscles respond less: aim higher, about 30–40 g per meal.', 'I muscoli rispondono meno: punta più in alto, circa 30–40 g per pasto.'), tone: 'pink' },
          { emoji: '🌱', title: L('Plant protein', 'Proteine vegetali'), text: L('Has less leucine: eat a bit more, and mix legumes with grains.', 'Hanno meno leucina: mangiane un po’ di più e abbina legumi e cereali.'), tone: 'green' },
          { emoji: '🌙', title: L('Before bed', 'Prima di dormire'), text: L('A yogurt or milk (casein) feeds the muscles overnight.', 'Uno yogurt o del latte (caseina) nutrono i muscoli durante la notte.'), tone: 'blue' },
        ],
      },
    ],
  },
  {
    id: 'recovery',
    emoji: '🛌',
    tone: 'blue',
    title: L('Recovery, sleep and deload weeks', 'Recupero, sonno e settimane di scarico'),
    subtitle: L('Muscles grow between workouts, not during', 'I muscoli crescono tra un allenamento e l’altro, non durante'),
    blocks: [
      { type: 'intro', text: L('Training is the signal; recovery is when the body answers. Without enough rest, sleep and food, the signal is wasted and the risk of injury goes up.', 'L’allenamento è il segnale; il recupero è quando il corpo risponde. Senza abbastanza riposo, sonno e cibo il segnale va sprecato e il rischio di infortuni sale.') },
      {
        type: 'cards',
        cols: 2,
        items: [
          { emoji: '😴', title: L('7–9 hours of sleep', '7–9 ore di sonno'), text: L('Deep sleep is when growth hormone peaks and muscles repair.', 'Nel sonno profondo l’ormone della crescita è al massimo e i muscoli si riparano.'), tone: 'blue' },
          { emoji: '📅', title: L('48 h per muscle', '48 ore per muscolo'), text: L('Train the same muscle again after about two days.', 'Allena lo stesso muscolo dopo circa due giorni.'), tone: 'green' },
          { emoji: '📉', title: L('Deload week', 'Settimana di scarico'), text: L('Every 6–10 weeks, halve the sets for a week: joints and motivation recover.', 'Ogni 6–10 settimane dimezza le serie per una settimana: articolazioni e motivazione si ricaricano.'), tone: 'yellow' },
          { emoji: '🚶', title: L('Active rest', 'Riposo attivo'), text: L('Walking on rest days speeds up recovery more than the sofa.', 'Camminare nei giorni di riposo accelera il recupero più del divano.'), tone: 'orange' },
        ],
      },
      {
        type: 'dodont',
        dos: [L('Expect some soreness after new exercises', 'Aspettarti un po’ di indolenzimento dopo esercizi nuovi'), L('Take an extra day off when you feel run down', 'Prenderti un giorno in più quando ti manca l’energia')],
        donts: [L('Train through sharp or joint pain', 'Allenarti con un dolore acuto o alle articolazioni'), L('Cut sleep to fit training in', 'Togliere ore di sonno per allenarti')],
      },
    ],
  },
  {
    id: 'tdee_weeks',
    emoji: '📅',
    tone: 'blue',
    title: L('Why measuring your energy takes 4 weeks', 'Perché misurare la tua energia richiede 4 settimane'),
    subtitle: L('Food log + scale reveal your real need, with a little patience', 'Diario + bilancia rivelano il tuo fabbisogno reale, con un po’ di pazienza'),
    blocks: [
      { type: 'intro', text: L('The energy your body uses in a day (TDEE) can be measured at home: what you eat, minus what your weight stores or loses (about 7,700 kcal per kg). Simple, but only with good data: about 4 weeks of complete food logs and regular weigh-ins.', 'L’energia che il tuo corpo usa in un giorno (TDEE) si può misurare a casa: quello che mangi, meno quello che il peso accumula o perde (circa 7.700 kcal per kg). Semplice, ma solo con buoni dati: circa 4 settimane di diario completo e pesate regolari.') },
      {
        type: 'steps',
        title: L('The calculation, with an example', 'Il calcolo, con un esempio'),
        items: [
          { title: L('What you ate, on average', 'Quanto hai mangiato, in media'), text: L('Only complete days count: say 1,900 kcal a day.', 'Contano solo le giornate complete: per esempio 1.900 kcal al giorno.') },
          { title: L('What the weight trend did', 'Cosa ha fatto la tendenza del peso'), text: L('−1 kg in 4 weeks = 7,700 kcal taken from the body’s stores: 275 kcal a day.', '−1 kg in 4 settimane = 7.700 kcal prese dalle riserve del corpo: 275 kcal al giorno.') },
          { title: L('Your energy', 'La tua energia'), text: L('1,900 + 275 = 2,175 kcal a day: what your body really used.', '1.900 + 275 = 2.175 kcal al giorno: quello che il tuo corpo ha usato davvero.') },
        ],
      },
      { type: 'scale' },
      {
        type: 'bars',
        title: L('A salty dinner (+0.5 kg of water at the last weigh-in) shifts the result by… (kcal a day)', 'Una cena salata (+0,5 kg d’acqua all’ultima pesata) sposta il risultato di… (kcal al giorno)'),
        unit: 'kcal',
        items: [
          { label: L('After 1 week', 'Dopo 1 settimana'), value: 550 },
          { label: L('After 2 weeks', 'Dopo 2 settimane'), value: 275 },
          { label: L('After 3 weeks', 'Dopo 3 settimane'), value: 183 },
          { label: L('After 4 weeks', 'Dopo 4 settimane'), value: 138 },
        ],
      },
      {
        type: 'cards',
        title: L('Why 4 weeks', 'Perché 4 settimane'),
        cols: 2,
        items: [
          { emoji: '💧', title: L('Water moves fast, fat slowly', 'L’acqua si muove in fretta, il grasso piano'), text: L('Salt, carbs and digestion move the scale by about half a kilo from day to day; a real change of 0.25 kg takes a week.', 'Sale, carboidrati e digestione spostano la bilancia di circa mezzo chilo da un giorno all’altro; un cambiamento vero di 0,25 kg richiede una settimana.'), tone: 'blue' },
          { emoji: '📅', title: L('Weekends repeat', 'I fine settimana si ripetono'), text: L('Weight rises at the weekend and falls during the week, and Saturdays bring more food: only several whole weeks even it out.', 'Il peso sale nel fine settimana e scende in settimana, e il sabato si mangia di più: solo più settimane intere lo compensano.'), tone: 'orange' },
          { emoji: '🍝', title: L('Food changes every day', 'Il cibo cambia ogni giorno'), text: L('One day 1,500 kcal, the next 2,600: about a month of records is needed to know someone’s usual intake within 10%.', 'Un giorno 1.500 kcal, il giorno dopo 2.600: serve circa un mese di diario per conoscere l’assunzione abituale di qualcuno entro il 10%.'), tone: 'green' },
          { emoji: '🔬', title: L('What studies found', 'Cosa dicono gli studi'), text: L('With daily weigh-ins, more than 28 days are needed to measure the energy balance within about ±300 kcal a day.', 'Con pesate quotidiane servono più di 28 giorni per misurare il bilancio energetico entro circa ±300 kcal al giorno.'), tone: 'purple' },
        ],
      },
      {
        type: 'timeline',
        title: L('What Forza! does', 'Cosa fa Forza!'),
        items: [
          { emoji: '📝', time: L('Week 1', 'Settimana 1'), text: L('The formula only (weight, height, age, steps, workouts). Your meals and weigh-ins are collected, not used yet.', 'Solo la formula (peso, altezza, età, passi, allenamenti). Pasti e pesate vengono raccolti, non ancora usati.') },
          { emoji: '⚖️', time: L('After 2 weeks', 'Dopo 2 settimane'), text: L('With 14 complete days and 4 weigh-ins your own measurement starts to count: up to 40%.', 'Con 14 giornate complete e 4 pesate la tua misura inizia a contare: fino al 40%.') },
          { emoji: '📈', time: L('After 3 weeks', 'Dopo 3 settimane'), text: L('60%: the target moves towards your real need.', '60%: l’obiettivo si avvicina al tuo fabbisogno reale.') },
          { emoji: '🎯', time: L('After 4 weeks', 'Dopo 4 settimane'), text: L('80% with at least 8 weigh-ins, the most it ever counts: your own energy, measured. Always on the last 4 weeks, so it follows you as you change.', '80% con almeno 8 pesate, il massimo: la tua energia, misurata. Sempre sulle ultime 4 settimane, così ti segue mentre cambi.') },
        ],
      },
      {
        type: 'dodont',
        dos: [
          L('Log every meal, the pizza night and the glass of wine too', 'Registra ogni pasto, anche la pizza del sabato e il bicchiere di vino'),
          L('Weigh yourself in the morning, after the bathroom and before eating: every day is best, at least 2–3 times a week', 'Pesati al mattino, dopo il bagno e prima di mangiare: ogni giorno è meglio, almeno 2–3 volte a settimana'),
          L('Say when a day was not all logged: Forza! leaves it out', 'Segnala quando una giornata non è registrata per intero: Forza! la lascia fuori'),
        ],
        donts: [
          L('Judge your energy, or a diet, after a few days', 'Giudicare la tua energia, o una dieta, dopo pochi giorni'),
          L('Skip logging on the days off plan: they count too', 'Saltare il diario nei giorni fuori programma: contano anche quelli'),
          L('Change scale, or weigh yourself at different times', 'Cambiare bilancia o pesarti a orari diversi'),
        ],
      },
      { type: 'callout', emoji: '🎯', text: L('Consistent beats perfect: if you always forget the same spoon of oil, the measurement still works, because it learns your energy as you log it. Half-logged days are what spoil it.', 'Costante batte perfetto: se dimentichi sempre lo stesso cucchiaio d’olio, la misura funziona lo stesso, perché impara la tua energia così come la registri. Sono le giornate registrate a metà a rovinarla.') },
    ],
  },
  {
    id: 'tdee_people',
    emoji: '👥',
    tone: 'orange',
    title: L('Same weight, different energy', 'Stesso peso, energia diversa'),
    subtitle: L('Why two people of 70 kg can need 750 kcal apart', 'Perché due persone di 70 kg possono avere bisogno di 750 kcal di differenza'),
    blocks: [
      { type: 'intro', text: L('Two people weigh 70 kg and have the same height, age and sex. A formula gives both the same number, yet one can use 750 kcal a day more than the other: a whole meal. The scale tells how much you weigh, not what your body is made of or how much you move.', 'Due persone pesano 70 kg e hanno stessa altezza, età e sesso. Una formula dà a entrambe lo stesso numero, eppure una può usare 750 kcal al giorno più dell’altra: un pasto intero. La bilancia dice quanto pesi, non com’è fatto il tuo corpo o quanto ti muovi.') },
      {
        type: 'stack',
        title: L('Energy used in a day', 'Energia usata in un giorno'),
        unit: 'kcal',
        parts: [
          { label: L('At rest', 'A riposo'), tone: 'blue' },
          { label: L('Daily movement', 'Movimento quotidiano'), tone: 'orange' },
          { label: L('Training', 'Allenamento'), tone: 'purple' },
          { label: L('Digesting', 'Digestione'), tone: 'green' },
        ],
        items: [
          { emoji: '🏃', label: L('A: 70 kg, 25% body fat', 'A: 70 kg, 25% di grasso'), note: L('9,000 steps a day, a job on the move, strength training 3 times a week', '9.000 passi al giorno, un lavoro in movimento, forza 3 volte a settimana'), values: [1500, 550, 100, 240] },
          { emoji: '🪑', label: L('B: 70 kg, 40% body fat', 'B: 70 kg, 40% di grasso'), note: L('3,000 steps a day, a desk job, no training', '3.000 passi al giorno, lavoro alla scrivania, nessun allenamento'), values: [1280, 200, 0, 165] },
        ],
        note: L('At rest: 370 + 21.6 × kg of fat-free mass (A has 52.5 kg, B 42 kg). Daily movement: steps, standing, chores. Training: about 4 kcal per kg per hour. Digesting: about 10% of the day. The difference, 745 kcal a day, is 0.7 kg a week if B ate like A.', 'A riposo: 370 + 21,6 × kg di massa magra (A ne ha 52,5 kg, B 42 kg). Movimento quotidiano: passi, stare in piedi, lavori di casa. Allenamento: circa 4 kcal per kg all’ora. Digestione: circa il 10% della giornata. La differenza, 745 kcal al giorno, fa 0,7 kg a settimana se B mangiasse come A.'),
      },
      {
        type: 'cards',
        title: L('What makes the difference', 'Cosa fa la differenza'),
        cols: 2,
        items: [
          { emoji: '💪', title: L('Muscle, not weight', 'Muscolo, non peso'), text: L('Fat-free mass (muscles, organs, bones) explains about two-thirds of the differences in energy at rest. At rest, 1 kg of muscle uses about 13 kcal a day, 1 kg of fat about 4.5.', 'La massa magra (muscoli, organi, ossa) spiega circa due terzi delle differenze di energia a riposo. A riposo 1 kg di muscolo usa circa 13 kcal al giorno, 1 kg di grasso circa 4,5.'), tone: 'blue' },
          { emoji: '🚶', title: L('Daily movement', 'Il movimento quotidiano'), text: L('Walking, standing, chores, even fidgeting: the part that differs most between people. About 2 hours a day less on a chair could be worth some 350 kcal.', 'Camminare, stare in piedi, i lavori di casa, perfino gesticolare: è la parte che cambia di più tra le persone. Circa 2 ore al giorno in meno sulla sedia possono valere circa 350 kcal.'), tone: 'orange' },
          { emoji: '🏋️', title: L('Training', 'L’allenamento'), text: L('50 minutes of strength training use about 230 kcal at 70 kg: it helps, and it keeps the muscle that uses energy at rest.', '50 minuti di allenamento di forza usano circa 230 kcal a 70 kg: aiuta, e mantiene il muscolo che consuma energia a riposo.'), tone: 'purple' },
          { emoji: '🍽️', title: L('Digesting', 'La digestione'), text: L('Digesting uses 5–15% of the day’s energy: more with protein, less with fat.', 'Digerire usa il 5–15% dell’energia della giornata: di più con le proteine, di meno con i grassi.'), tone: 'green' },
          { emoji: '🎂', title: L('Age', 'L’età'), text: L('For the same body, energy stays stable from 20 to 60, then slowly falls; losing muscle with age lowers it further. Strength training slows this down.', 'A parità di corpo, l’energia resta stabile dai 20 ai 60 anni, poi cala piano; perdere muscolo con l’età la abbassa ancora. Allenare la forza rallenta il calo.'), tone: 'yellow' },
          { emoji: '📉', title: L('Long diets', 'Le diete lunghe'), text: L('After losing weight the body saves some energy, more than its smaller size explains: one more reason to measure rather than guess.', 'Dopo aver perso peso il corpo risparmia un po’ di energia, più di quanto spieghi la taglia più piccola: un motivo in più per misurare invece di indovinare.'), tone: 'pink' },
        ],
      },
      { type: 'callout', emoji: '🧬', text: L('Even with all of this, about a quarter of the differences at rest stays unexplained (genes, hormones): even the best formula can be wrong for one person. Your food log and your scale measure your energy, whatever your body is like.', 'Anche con tutto questo, circa un quarto delle differenze a riposo resta senza spiegazione (geni, ormoni): anche la formula migliore può sbagliare per una persona. Il tuo diario e la tua bilancia misurano la tua energia, comunque sia il tuo corpo.') },
    ],
  },
]

export interface Question {
  q: L10n
  options: L10n[]
  answer: number
  why: L10n
}

/** Two quick questions per lesson: pass both to earn the quiz points. */
export const QUIZZES: Record<string, Question[]> = {
  why_strength: [
    { q: L('Can muscles still grow at 80?', 'I muscoli possono ancora crescere a 80 anni?'), options: [L('No, after 60 it is too late', 'No, dopo i 60 è troppo tardi'), L('Yes, they respond at any age', 'Sì, rispondono a qualsiasi età')], answer: 1, why: L('Studies show strength gains in weeks, even in people over 80.', 'Gli studi mostrano aumenti di forza in poche settimane, anche oltre gli 80 anni.') },
    { q: L('How should a set end?', 'Come dovrebbe finire una serie?'), options: [L('With 1–3 reps still “in the tank”', 'Con 1–3 ripetizioni ancora “nel serbatoio”'), L('Only when you cannot move anymore', 'Solo quando non riesci più a muoverti'), L('Before it gets tiring', 'Prima che diventi faticosa')], answer: 0, why: L('Challenging but never painful: 1–3 reps in reserve.', 'Impegnativa ma mai dolorosa: 1–3 ripetizioni in riserva.') },
  ],
  macros: [
    { q: L('Which macronutrient builds and repairs muscle?', 'Quale macronutriente costruisce e ripara i muscoli?'), options: [L('Carbohydrates', 'Carboidrati'), L('Protein', 'Proteine'), L('Fat', 'Grassi')], answer: 1, why: L('Protein is the building material of muscles, bones and skin.', 'Le proteine sono il materiale da costruzione di muscoli, ossa e pelle.') },
    { q: L('How many calories in 1 g of fat?', 'Quante calorie in 1 g di grassi?'), options: [L('4 kcal', '4 kcal'), L('9 kcal', '9 kcal'), L('1 kcal', '1 kcal')], answer: 1, why: L('Fat has 9 kcal per gram, more than twice protein and carbs (4).', 'I grassi hanno 9 kcal per grammo, più del doppio di proteine e carboidrati (4).') },
  ],
  plate: [
    { q: L('How much of the plate should be vegetables?', 'Quanta parte del piatto dovrebbe essere verdura?'), options: [L('Half', 'Metà'), L('A quarter', 'Un quarto'), L('Just a garnish', 'Solo una decorazione')], answer: 0, why: L('Half a plate of vegetables: volume and fibre for few calories.', 'Metà piatto di verdure: volume e fibre con poche calorie.') },
    { q: L('A portion of protein is about…', 'Una porzione di proteine è circa…'), options: [L('The palm of your hand', 'Il palmo della mano'), L('Two fists', 'Due pugni'), L('A fingertip', 'Un polpastrello')], answer: 0, why: L('Your hand is your measuring tool: a palm of protein.', 'La mano è il tuo strumento di misura: un palmo di proteine.') },
  ],
  protein: [
    { q: L('Which breakfast has more protein?', 'Quale colazione ha più proteine?'), options: [L('Biscuits and coffee', 'Biscotti e caffè'), L('Greek yogurt with oats', 'Yogurt greco con avena')], answer: 1, why: L('Greek yogurt has about 10 g of protein per 100 g.', 'Lo yogurt greco ha circa 10 g di proteine ogni 100 g.') },
    { q: L('Why does protein matter more after 60?', 'Perché le proteine contano di più dopo i 60 anni?'), options: [L('Muscles use it less efficiently', 'I muscoli la usano in modo meno efficiente'), L('It doesn’t: needs go down', 'Non contano di più: il fabbisogno scende')], answer: 0, why: L('With age muscles respond less, so a bit more protein is needed.', 'Con l’età i muscoli rispondono meno, quindi serve un po’ più di proteine.') },
  ],
  food_sources: [
    { q: L('Which is a plant source of protein?', 'Quale è una fonte vegetale di proteine?'), options: [L('Lentils', 'Lenticchie'), L('Rice cakes', 'Gallette di riso'), L('Apples', 'Mele')], answer: 0, why: L('Legumes like lentils, beans and chickpeas are rich in protein and fibre.', 'I legumi come lenticchie, fagioli e ceci sono ricchi di proteine e fibre.') },
    { q: L('Where do you find healthy fats?', 'Dove trovi i grassi buoni?'), options: [L('Olive oil, nuts, oily fish', 'Olio d’oliva, frutta secca, pesce azzurro'), L('Crisps and pastries', 'Patatine e merendine')], answer: 0, why: L('Olive oil, nuts and oily fish bring the fats your heart likes.', 'Olio d’oliva, frutta secca e pesce azzurro portano i grassi che piacciono al cuore.') },
  ],
  fiber: [
    { q: L('How much fibre a day?', 'Quante fibre al giorno?'), options: [L('About 25–30 g', 'Circa 25–30 g'), L('About 5 g', 'Circa 5 g')], answer: 0, why: L('Most people eat half of the 25–30 g they need.', 'La maggior parte delle persone ne mangia la metà dei 25–30 g necessari.') },
    { q: L('When you add fibre, also add…', 'Quando aumenti le fibre, aumenta anche…'), options: [L('Water', 'L’acqua'), L('Salt', 'Il sale')], answer: 0, why: L('Fibre needs water to work well in the gut.', 'Le fibre hanno bisogno di acqua per funzionare bene nell’intestino.') },
  ],
  insulin: [
    { q: L('What helps blood sugar after a meal?', 'Cosa aiuta la glicemia dopo un pasto?'), options: [L('A 10-minute walk', 'Una camminata di 10 minuti'), L('A nap', 'Un pisolino')], answer: 0, why: L('Walking muscles use the sugar from the meal.', 'I muscoli che camminano usano lo zucchero del pasto.') },
    { q: L('Best order to eat a meal?', 'L’ordine migliore per mangiare un pasto?'), options: [L('Vegetables and protein first, carbs last', 'Prima verdure e proteine, carboidrati alla fine'), L('Bread first', 'Prima il pane')], answer: 0, why: L('Fibre and protein first make blood sugar rise more gently.', 'Fibre e proteine all’inizio fanno salire la glicemia più dolcemente.') },
  ],
  workout_food: [
    { q: L('After training, eat…', 'Dopo l’allenamento mangia…'), options: [L('A meal with protein within a couple of hours', 'Un pasto con proteine entro un paio d’ore'), L('Nothing until the next day', 'Niente fino al giorno dopo')], answer: 0, why: L('Protein after training helps muscles repair and grow.', 'Le proteine dopo l’allenamento aiutano i muscoli a ripararsi e crescere.') },
    { q: L('Before a workout, if hungry…', 'Prima dell’allenamento, se hai fame…'), options: [L('Something light, like a banana', 'Qualcosa di leggero, come una banana'), L('A big pizza', 'Una pizza grande')], answer: 0, why: L('Light and easy to digest: energy without a heavy stomach.', 'Leggero e digeribile: energia senza appesantire lo stomaco.') },
  ],
  meals: [
    { q: L('A balanced lunch has…', 'Un pranzo equilibrato ha…'), options: [L('Protein, vegetables and some carbs', 'Proteine, verdure e un po’ di carboidrati'), L('Only pasta', 'Solo pasta')], answer: 0, why: L('All three together keep you full and give steady energy.', 'Tutti e tre insieme saziano e danno energia costante.') },
    { q: L('A quick protein snack is…', 'Uno spuntino proteico veloce è…'), options: [L('Greek yogurt or a boiled egg', 'Yogurt greco o un uovo sodo'), L('A croissant', 'Un cornetto')], answer: 0, why: L('Yogurt and eggs are ready in seconds and rich in protein.', 'Yogurt e uova sono pronti in un attimo e ricchi di proteine.') },
  ],
  daily_activity: [
    { q: L('Does walking count for health?', 'Camminare conta per la salute?'), options: [L('Yes, every step adds up', 'Sì, ogni passo si somma'), L('No, only sport counts', 'No, conta solo lo sport')], answer: 0, why: L('Daily movement burns more calories over a week than one workout.', 'Il movimento quotidiano consuma più calorie in una settimana di un singolo allenamento.') },
    { q: L('An easy way to add steps…', 'Un modo facile per aggiungere passi…'), options: [L('Walk during phone calls', 'Camminare durante le telefonate'), L('Sit closer to the TV', 'Sedersi più vicino alla TV')], answer: 0, why: L('Small habits like walking calls add thousands of steps.', 'Piccole abitudini come telefonare camminando aggiungono migliaia di passi.') },
  ],
  sleep: [
    { q: L('Last coffee of the day, ideally before…', 'L’ultimo caffè della giornata, idealmente prima delle…'), options: [L('2 pm', '14'), L('10 pm', '22')], answer: 0, why: L('Caffeine works for 6+ hours and makes sleep lighter.', 'La caffeina agisce per più di 6 ore e rende il sonno più leggero.') },
    { q: L('Poor sleep makes you…', 'Dormire male ti fa…'), options: [L('Hungrier, especially for sweets', 'Avere più fame, soprattutto di dolci'), L('Lose fat faster', 'Perdere grasso più in fretta')], answer: 0, why: L('Short sleep raises hunger hormones and cravings.', 'Dormire poco aumenta gli ormoni della fame e le voglie.') },
  ],
  small_habits: [
    { q: L('Which calories are easiest to cut?', 'Quali calorie sono le più facili da togliere?'), options: [L('Sugary drinks', 'Bevande zuccherate'), L('Vegetables', 'Verdure')], answer: 0, why: L('Drinks don’t fill you up: swapping them for water saves a lot.', 'Le bevande non saziano: sostituirle con acqua fa risparmiare molto.') },
    { q: L('Small habits work because…', 'Le piccole abitudini funzionano perché…'), options: [L('They are easy to repeat every day', 'Sono facili da ripetere ogni giorno'), L('They burn many calories at once', 'Bruciano tante calorie in una volta')], answer: 0, why: L('Consistency beats intensity: small things done daily add up.', 'La costanza batte l’intensità: piccole cose fatte ogni giorno si sommano.') },
  ],
  steady_energy: [
    { q: L('To avoid the afternoon slump, eat carbs…', 'Per evitare il calo del pomeriggio, mangia i carboidrati…'), options: [L('Spread over the meals, with protein or fibre', 'Distribuiti nei pasti, con proteine o fibre'), L('All at lunch', 'Tutti a pranzo')], answer: 0, why: L('Spreading and pairing carbs avoids big rushes and crashes.', 'Distribuire e abbinare i carboidrati evita picchi e crolli.') },
    { q: L('A good afternoon snack is…', 'Un buono spuntino pomeridiano è…'), options: [L('Yogurt with fruit', 'Yogurt con frutta'), L('Sweet biscuits', 'Biscotti dolci')], answer: 0, why: L('Protein + fruit gives energy that lasts.', 'Proteine + frutta danno un’energia che dura.') },
  ],
  meal_tricks: [
    { q: L('How long does fullness take to arrive?', 'Dopo quanto arriva il senso di sazietà?'), options: [L('About 20 minutes', 'Circa 20 minuti'), L('Immediately', 'Subito')], answer: 0, why: L('Eating slowly gives fullness time to arrive.', 'Mangiare piano dà tempo alla sazietà di arrivare.') },
    { q: L('A good portion of pasta for most meals?', 'Una buona porzione di pasta per quasi tutti i pasti?'), options: [L('About one fist', 'Circa un pugno'), L('The whole plate', 'Tutto il piatto')], answer: 0, why: L('A fist of carbs, a palm of protein, half a plate of vegetables.', 'Un pugno di carboidrati, un palmo di proteine, metà piatto di verdure.') },
  ],
  glycogen: [
    { q: L('Where is glycogen stored?', 'Dove si trova il glicogeno?'), options: [L('In muscles and liver', 'Nei muscoli e nel fegato'), L('In fat cells', 'Nelle cellule di grasso')], answer: 0, why: L('About 400 g in muscles and 100 g in the liver.', 'Circa 400 g nei muscoli e 100 g nel fegato.') },
    { q: L('Losing 1.5 kg in the first low-carb week is mostly…', 'Perdere 1,5 kg nella prima settimana low-carb è soprattutto…'), options: [L('Glycogen and water', 'Glicogeno e acqua'), L('Fat', 'Grasso')], answer: 0, why: L('Each gram of glycogen holds about 3 g of water.', 'Ogni grammo di glicogeno trattiene circa 3 g di acqua.') },
  ],
  meal_timing: [
    { q: L('What matters most for results?', 'Cosa conta di più per i risultati?'), options: [L('Total calories and protein', 'Calorie e proteine totali'), L('Eating within 30 minutes of training', 'Mangiare entro 30 minuti dall’allenamento')], answer: 0, why: L('Timing is fourth after calories, protein and food quality.', 'Gli orari vengono quarti, dopo calorie, proteine e qualità del cibo.') },
    { q: L('Protein is best…', 'Le proteine è meglio…'), options: [L('Spread over 3–4 meals', 'Distribuirle in 3–4 pasti'), L('All at dinner', 'Tutte a cena')], answer: 0, why: L('Each meal can switch on muscle building.', 'Ogni pasto può accendere la costruzione muscolare.') },
  ],
  creatine: [
    { q: L('Recommended creatine dose?', 'La dose consigliata di creatina?'), options: [L('3–5 g every day', '3–5 g ogni giorno'), L('20 g only on training days', '20 g solo nei giorni di allenamento')], answer: 0, why: L('3–5 g daily, every day, no loading needed.', '3–5 g al giorno, tutti i giorni, senza fase di carico.') },
    { q: L('The first-weeks weight gain with creatine is…', 'L’aumento di peso delle prime settimane con la creatina è…'), options: [L('Water in the muscles', 'Acqua nei muscoli'), L('Fat', 'Grasso')], answer: 0, why: L('Creatine pulls water into the muscle cells.', 'La creatina richiama acqua nelle cellule muscolari.') },
  ],
  progressive_overload: [
    { q: L('In double progression, you first add…', 'Nella doppia progressione prima aggiungi…'), options: [L('Reps', 'Ripetizioni'), L('Weight', 'Peso')], answer: 0, why: L('Reps up to the top of the range, then a little weight.', 'Ripetizioni fino al massimo dell’intervallo, poi un po’ di peso.') },
    { q: L('RIR 2 means…', 'RIR 2 significa…'), options: [L('You could do 2 more reps', 'Potresti fare ancora 2 ripetizioni'), L('Rest 2 minutes', 'Riposa 2 minuti')], answer: 0, why: L('Reps in reserve: how many more you could have done.', 'Ripetizioni in riserva: quante ne avresti ancora fatte.') },
  ],
  protein_timing: [
    { q: L('Protein per meal to switch on muscle building?', 'Proteine per pasto per accendere la costruzione muscolare?'), options: [L('About 0.4 g per kg of body weight', 'Circa 0,4 g per kg di peso'), L('5 g is enough', 'Bastano 5 g')], answer: 0, why: L('About 25–40 g for most adults, more after 60.', 'Circa 25–40 g per la maggior parte degli adulti, di più dopo i 60.') },
    { q: L('Which amino acid acts as the "switch"?', 'Quale aminoacido fa da “interruttore”?'), options: [L('Leucine', 'Leucina'), L('Glucose', 'Glucosio')], answer: 0, why: L('Leucine signals the muscle to start building.', 'La leucina segnala al muscolo di iniziare a costruire.') },
  ],
  recovery: [
    { q: L('When do muscles grow?', 'Quando crescono i muscoli?'), options: [L('During recovery, between workouts', 'Durante il recupero, tra un allenamento e l’altro'), L('During the workout', 'Durante l’allenamento')], answer: 0, why: L('Training is the signal; rest, sleep and food build the muscle.', 'L’allenamento è il segnale; riposo, sonno e cibo costruiscono il muscolo.') },
    { q: L('A deload week means…', 'Una settimana di scarico significa…'), options: [L('Halving the sets for a week', 'Dimezzare le serie per una settimana'), L('Stopping for a month', 'Fermarsi per un mese')], answer: 0, why: L('Every 6–10 weeks, lighter training lets joints and motivation recover.', 'Ogni 6–10 settimane un allenamento più leggero fa recuperare articolazioni e motivazione.') },
  ],
  tdee_weeks: [
    { q: L('How long does a reliable measurement of your energy take?', 'Quanto serve per una misura affidabile della tua energia?'), options: [L('About 4 weeks of complete logs and weigh-ins', 'Circa 4 settimane di diario completo e pesate'), L('3 days', '3 giorni'), L('One weigh-in', 'Una pesata')], answer: 0, why: L('Water and weekends move the scale more than a week of real change: studies need about 28 days.', 'Acqua e fine settimana spostano la bilancia più di una settimana di cambiamento vero: gli studi indicano circa 28 giorni.') },
    { q: L('Yesterday you logged only breakfast. What do you do?', 'Ieri hai registrato solo la colazione. Cosa fai?'), options: [L('Tell Forza! the day was not all logged', 'Segnali a Forza! che la giornata non è completa'), L('Nothing: it does not matter', 'Niente: non conta')], answer: 0, why: L('A half-logged day looks like a day of fasting and would make your energy look lower: Forza! leaves it out.', 'Una giornata registrata a metà sembra un digiuno e farebbe sembrare più bassa la tua energia: Forza! la lascia fuori.') },
  ],
  tdee_people: [
    { q: L('Two people both weigh 70 kg. Do they use the same energy?', 'Due persone pesano entrambe 70 kg. Usano la stessa energia?'), options: [L('Not necessarily: muscle and daily movement change it a lot', 'Non per forza: muscolo e movimento quotidiano la cambiano molto'), L('Yes: weight decides', 'Sì: decide il peso')], answer: 0, why: L('In the example the difference is about 750 kcal a day, a whole meal.', 'Nell’esempio la differenza è di circa 750 kcal al giorno, un pasto intero.') },
    { q: L('At rest, which uses more energy?', 'A riposo, cosa usa più energia?'), options: [L('1 kg of muscle', '1 kg di muscolo'), L('1 kg of fat', '1 kg di grasso')], answer: 0, why: L('About 13 kcal a day for muscle, against 4.5 for fat.', 'Circa 13 kcal al giorno per il muscolo, contro 4,5 per il grasso.') },
  ],
}
