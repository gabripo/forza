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
}
