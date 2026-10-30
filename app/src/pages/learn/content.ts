// Learning content. Each topic is one printable infographic, in English and Italian.
// Written for beginners: short sentences, everyday examples, no jargon.
import type { L10n } from '../../lib/types'
import { EXPERT_TOPICS, MEAL_TRICKS } from './more'

export type Tone = 'orange' | 'green' | 'blue' | 'yellow' | 'pink' | 'purple'

export type Block =
  | { type: 'intro'; text: L10n }
  | { type: 'cards'; title?: L10n; cols?: 2 | 3; items: { emoji: string; title: L10n; text: L10n; tone?: Tone }[] }
  | { type: 'steps'; title?: L10n; items: { title: L10n; text?: L10n }[] }
  | { type: 'dodont'; dos: L10n[]; donts: L10n[] }
  | { type: 'swaps'; title: L10n; items: { from: L10n; to: L10n }[] }
  | { type: 'plate' }
  | { type: 'hands' }
  | { type: 'bars'; title: L10n; unit: string; items: { label: L10n; value: number }[] }
  | { type: 'timeline'; title?: L10n; items: { emoji: string; time: L10n; text: L10n }[] }
  | { type: 'foods'; groups: { emoji: string; title: L10n; note?: L10n; tone: Tone; foods: L10n }[] }
  | { type: 'meals'; groups: { title: L10n; items: { emoji: string; name: L10n; protein: number }[] }[] }
  | { type: 'callout'; emoji: string; text: L10n }

/** A reference: the id of a known source (data/sources.ts) or one written out (lessons added in Coach). */
export type LessonSource = string | { title: string; authors?: string; year?: number; journal?: string; url?: string }

export interface Topic {
  id: string
  emoji: string
  tone: Tone
  title: L10n
  subtitle: L10n
  blocks: Block[]
  /** Where the lesson's facts come from; built-in lessons use LESSON_SOURCES. */
  sources?: LessonSource[]
}

const L = (en: string, it: string): L10n => ({ en, it })

export const TOPICS: Topic[] = [
  {
    id: 'why_strength',
    emoji: '💪',
    tone: 'orange',
    title: L('Why lift weights as we age', 'Perché allenare la forza con l’età'),
    subtitle: L('Muscles are a savings account for later life', 'I muscoli sono un conto di risparmio per il futuro'),
    blocks: [
      { type: 'intro', text: L('From around 30–40 years old we slowly lose muscle every decade if we don’t use it. The good news: muscles respond to training at any age, even at 80.', 'Dai 30–40 anni perdiamo lentamente muscolo ogni decennio, se non lo usiamo. La buona notizia: i muscoli rispondono all’allenamento a qualsiasi età, anche a 80 anni.') },
      {
        type: 'cards',
        cols: 2,
        items: [
          { emoji: '🦵', title: L('Independence', 'Autonomia'), text: L('Getting up from a chair, climbing stairs and carrying the shopping on your own.', 'Alzarsi dalla sedia, salire le scale e portare la spesa da soli.'), tone: 'orange' },
          { emoji: '🦴', title: L('Stronger bones', 'Ossa più forti'), text: L('Lifting tells bones to stay dense: lower risk of osteoporosis and fractures.', 'Sollevare pesi dice alle ossa di restare dense: meno rischio di osteoporosi e fratture.'), tone: 'blue' },
          { emoji: '⚖️', title: L('Better balance', 'Più equilibrio'), text: L('Stronger legs and better coordination mean fewer falls.', 'Gambe più forti e più coordinazione significano meno cadute.'), tone: 'green' },
          { emoji: '🩸', title: L('Healthier blood sugar', 'Glicemia più sana'), text: L('Muscle is the body’s biggest “sponge” for sugar.', 'Il muscolo è la “spugna” più grande del corpo per lo zucchero.'), tone: 'pink' },
          { emoji: '🧠', title: L('Mood and mind', 'Umore e mente'), text: L('Training improves mood and sleep, and helps keep the mind sharp.', 'L’allenamento migliora umore e sonno e aiuta a mantenere la mente lucida.'), tone: 'purple' },
          { emoji: '🔥', title: L('Healthy weight', 'Peso sano'), text: L('More muscle makes it easier to keep a healthy weight and daily tasks feel lighter.', 'Più muscolo rende più facile mantenere un peso sano e le attività quotidiane sembrano più leggere.'), tone: 'yellow' },
        ],
      },
      {
        type: 'steps',
        title: L('How to start safely', 'Come iniziare in sicurezza'),
        items: [
          { title: L('Talk to your doctor first', 'Parla prima con il medico'), text: L('Especially with heart problems, high blood pressure or recent surgery.', 'Soprattutto con problemi di cuore, pressione alta o interventi recenti.') },
          { title: L('2–3 sessions a week', '2–3 allenamenti a settimana'), text: L('Whole body, with at least one rest day in between.', 'Tutto il corpo, con almeno un giorno di riposo in mezzo.') },
          { title: L('Technique first', 'Prima la tecnica'), text: L('Start light, learn the movement, then add weight slowly.', 'Parti leggero, impara il movimento, poi aumenta il peso piano piano.') },
          { title: L('Challenging, never painful', 'Impegnativo, mai doloroso'), text: L('Finish each set with 1–3 reps still “in the tank”.', 'Finisci ogni serie con 1–3 ripetizioni ancora “nel serbatoio”.') },
          { title: L('Progress little by little', 'Progredisci a piccoli passi'), text: L('One more rep or a bit more weight when it feels easier.', 'Una ripetizione o un po’ di peso in più quando diventa facile.') },
        ],
      },
      { type: 'callout', emoji: '🌱', text: L('It’s never too late: people in their 70s and 80s gain strength in just a few weeks of training.', 'Non è mai troppo tardi: anche a 70 e 80 anni si guadagna forza in poche settimane di allenamento.') },
    ],
  },
  {
    id: 'macros',
    emoji: '🍽️',
    tone: 'blue',
    title: L('What are macronutrients?', 'Cosa sono i macronutrienti?'),
    subtitle: L('Protein, carbohydrates and fats explained', 'Proteine, carboidrati e grassi spiegati'),
    blocks: [
      { type: 'intro', text: L('Food gives us energy (calories) through three macronutrients. We need all three: the secret is the right amount and good sources.', 'Il cibo ci dà energia (calorie) attraverso tre macronutrienti. Servono tutti e tre: il segreto è la quantità giusta e le fonti buone.') },
      {
        type: 'cards',
        cols: 3,
        items: [
          { emoji: '🍗', title: L('Protein · 4 kcal/g', 'Proteine · 4 kcal/g'), text: L('Builds and repairs muscles, bones and skin. Keeps you full for longer. Meat, fish, eggs, dairy, legumes.', 'Costruiscono e riparano muscoli, ossa e pelle. Saziano a lungo. Carne, pesce, uova, latticini, legumi.'), tone: 'blue' },
          { emoji: '🍞', title: L('Carbs · 4 kcal/g', 'Carboidrati · 4 kcal/g'), text: L('The quickest energy for brain and muscles. Prefer whole grains, legumes, fruit and vegetables to sugar and white flour.', 'L’energia più rapida per cervello e muscoli. Meglio cereali integrali, legumi, frutta e verdura rispetto a zucchero e farine bianche.'), tone: 'orange' },
          { emoji: '🫒', title: L('Fats · 9 kcal/g', 'Grassi · 9 kcal/g'), text: L('Needed for hormones and to absorb vitamins A, D, E, K. Prefer olive oil, nuts and oily fish.', 'Servono per gli ormoni e per assorbire le vitamine A, D, E, K. Meglio olio d’oliva, frutta secca e pesce azzurro.'), tone: 'yellow' },
        ],
      },
      {
        type: 'cards',
        cols: 2,
        items: [
          { emoji: '🥦', title: L('Fibre', 'Fibre'), text: L('A carbohydrate we don’t digest: it feeds good gut bacteria and slows down sugar.', 'Un carboidrato che non digeriamo: nutre i batteri buoni dell’intestino e rallenta lo zucchero.'), tone: 'green' },
          { emoji: '💧', title: L('Water', 'Acqua'), text: L('Not a macronutrient, but essential. Thirst gets weaker with age: drink regularly.', 'Non è un macronutriente, ma è essenziale. Con l’età la sete si sente meno: bevi regolarmente.'), tone: 'blue' },
        ],
      },
      { type: 'bars', title: L('Calories in 10 g of…', 'Calorie in 10 g di…'), unit: 'kcal', items: [ { label: L('Protein', 'Proteine'), value: 40 }, { label: L('Carbohydrates', 'Carboidrati'), value: 40 }, { label: L('Fat', 'Grassi'), value: 90 } ] },
      { type: 'callout', emoji: '⚖️', text: L('No macronutrient is “bad”. Problems come from eating too much overall, or from ultra-processed foods.', 'Nessun macronutriente è “cattivo”. I problemi nascono dal mangiare troppo in totale o da cibi ultra-processati.') },
    ],
  },
  {
    id: 'plate',
    emoji: '🥗',
    tone: 'green',
    title: L('How to build a balanced plate', 'Come comporre un piatto equilibrato'),
    subtitle: L('A simple method for every meal, no scales needed', 'Un metodo semplice per ogni pasto, senza bilancia'),
    blocks: [
      { type: 'plate' },
      { type: 'hands' },
      {
        type: 'dodont',
        dos: [
          L('Start the meal with vegetables', 'Inizia il pasto dalle verdure'),
          L('Measure olive oil with a spoon', 'Misura l’olio con il cucchiaio'),
          L('Drink water with meals', 'Bevi acqua durante i pasti'),
          L('Include a protein at every meal', 'Metti una proteina in ogni pasto'),
        ],
        donts: [
          L('Pasta + bread + potatoes in the same meal', 'Pasta + pane + patate nello stesso pasto'),
          L('Half a plate of pasta with no vegetables', 'Mezzo piatto di pasta senza verdure'),
          L('Sugary drinks with meals', 'Bibite zuccherate a tavola'),
          L('Eating straight from the packet', 'Mangiare direttamente dalla confezione'),
        ],
      },
      { type: 'callout', emoji: '🍴', text: L('Example: grilled chicken + a big salad + boiled potatoes + 1 spoon of olive oil.', 'Esempio: pollo alla griglia + una grande insalata + patate lesse + 1 cucchiaio d’olio.') },
    ],
  },
  {
    id: 'protein',
    emoji: '🥚',
    tone: 'blue',
    title: L('Protein: your energy ally', 'Proteine: alleate della tua energia'),
    subtitle: L('Enough protein means steadier energy and stronger muscles', 'Abbastanza proteine significano energia costante e muscoli più forti'),
    blocks: [
      { type: 'intro', text: L('Eating enough protein helps keep your muscles, keeps you full and avoids energy crashes between meals. After 60 the body needs MORE protein, not less.', 'Mangiare abbastanza proteine aiuta a mantenere i muscoli, sazia ed evita i cali di energia tra i pasti. Dopo i 60 anni il corpo ne ha bisogno DI PIÙ, non di meno.') },
      {
        type: 'cards',
        cols: 3,
        items: [
          { emoji: '🎯', title: L('How much', 'Quante'), text: L('About 1.2–1.6 g per kg of body weight a day if you train (70 kg → 85–110 g).', 'Circa 1,2–1,6 g per kg di peso al giorno se ti alleni (70 kg → 85–110 g).'), tone: 'blue' },
          { emoji: '🕒', title: L('Spread it out', 'Distribuiscile'), text: L('25–40 g at each main meal works better than one big portion at dinner.', '25–40 g a ogni pasto principale funzionano meglio di una sola grande porzione a cena.'), tone: 'green' },
          { emoji: '☕', title: L('Breakfast counts', 'Conta la colazione'), text: L('Coffee and biscuits have almost no protein: add yogurt, milk or eggs.', 'Caffè e biscotti non hanno quasi proteine: aggiungi yogurt, latte o uova.'), tone: 'orange' },
        ],
      },
      {
        type: 'bars',
        title: L('Protein in a typical portion', 'Proteine in una porzione tipica'),
        unit: 'g',
        items: [
          { label: L('Chicken breast, 120 g', 'Petto di pollo, 120 g'), value: 37 },
          { label: L('Tuna, 1 can (80 g)', 'Tonno, 1 scatoletta (80 g)'), value: 21 },
          { label: L('Greek yogurt, 1 pot (170 g)', 'Yogurt greco, 1 vasetto (170 g)'), value: 17 },
          { label: L('2 eggs', '2 uova'), value: 14 },
          { label: L('Lentils, cooked (150 g)', 'Lenticchie cotte (150 g)'), value: 14 },
          { label: L('Ricotta (100 g)', 'Ricotta (100 g)'), value: 11 },
          { label: L('Pasta, dry (80 g)', 'Pasta a crudo (80 g)'), value: 10 },
          { label: L('Milk, 1 glass', 'Latte, 1 bicchiere'), value: 7 },
        ],
      },
      { type: 'callout', emoji: '⚡', text: L('Enough protein = steadier energy, less snacking and better recovery after training.', 'Abbastanza proteine = energia più costante, meno spuntini e recupero migliore dopo l’allenamento.') },
    ],
  },
  {
    id: 'food_sources',
    emoji: '🛒',
    tone: 'yellow',
    title: L('Where to find the nutrients', 'Dove trovare i nutrienti'),
    subtitle: L('A shopping guide by nutrient', 'Una guida alla spesa per nutriente'),
    blocks: [
      {
        type: 'foods',
        groups: [
          { emoji: '🍗', tone: 'blue', title: L('Lean protein', 'Proteine magre'), foods: L('Chicken and turkey breast, white fish, tuna in water, Greek yogurt, skyr, cottage cheese, egg whites, bresaola', 'Petto di pollo e tacchino, pesce bianco, tonno al naturale, yogurt greco, skyr, fiocchi di latte, albume, bresaola') },
          { emoji: '🥚', tone: 'purple', title: L('Protein + healthy fats', 'Proteine + grassi buoni'), foods: L('Whole eggs, salmon, mackerel and sardines, parmesan and other cheeses, nuts', 'Uova intere, salmone, sgombro e sardine, parmigiano e altri formaggi, frutta secca') },
          { emoji: '🫘', tone: 'green', title: L('Protein + carbs', 'Proteine + carboidrati'), note: L('Also full of fibre!', 'E tante fibre!'), foods: L('Lentils, chickpeas, beans, peas, broad beans, soy and tofu', 'Lenticchie, ceci, fagioli, piselli, fave, soia e tofu') },
          { emoji: '🌾', tone: 'orange', title: L('Slow carbs', 'Carboidrati lenti'), foods: L('Oats, wholegrain bread and pasta, brown rice, potatoes, quinoa, barley, farro', 'Avena, pane e pasta integrali, riso integrale, patate, quinoa, orzo, farro') },
          { emoji: '🫒', tone: 'yellow', title: L('Healthy fats', 'Grassi buoni'), foods: L('Extra virgin olive oil, avocado, walnuts, almonds, seeds (flax, chia, pumpkin)', 'Olio extravergine d’oliva, avocado, noci, mandorle, semi (lino, chia, zucca)') },
          { emoji: '🥦', tone: 'green', title: L('Fibre and vitamins', 'Fibre e vitamine'), foods: L('Vegetables, fruit with the peel, berries, legumes, whole grains', 'Verdura, frutta con la buccia, frutti di bosco, legumi, cereali integrali') },
        ],
      },
      { type: 'callout', emoji: '🇮🇹', text: L('Grains + legumes together (like pasta e fagioli) give complete, high-quality protein.', 'Cereali + legumi insieme (come pasta e fagioli) danno proteine complete e di qualità.') },
    ],
  },
  {
    id: 'fiber',
    emoji: '🥦',
    tone: 'green',
    title: L('Fibre: what it is and how to eat more', 'Fibre: cosa sono e come mangiarne di più'),
    subtitle: L('Most people eat about half of what they need', 'La maggior parte delle persone ne mangia circa la metà del necessario'),
    blocks: [
      { type: 'intro', text: L('Fibre is the part of plants we cannot digest. Aim for 25–35 g a day.', 'Le fibre sono la parte delle piante che non riusciamo a digerire. L’obiettivo è 25–35 g al giorno.') },
      {
        type: 'cards',
        cols: 3,
        title: L('Why it’s good for you', 'Perché fanno bene'),
        items: [
          { emoji: '🦠', title: L('Healthy gut', 'Intestino sano'), text: L('Feeds the good bacteria.', 'Nutre i batteri buoni.'), tone: 'green' },
          { emoji: '🍽️', title: L('Fullness', 'Sazietà'), text: L('You feel full with fewer calories.', 'Ti senti sazio con meno calorie.'), tone: 'orange' },
          { emoji: '📉', title: L('Steady sugar', 'Zucchero stabile'), text: L('Slows down the rise of blood sugar.', 'Rallenta la salita della glicemia.'), tone: 'pink' },
          { emoji: '❤️', title: L('Heart', 'Cuore'), text: L('Helps lower cholesterol.', 'Aiuta ad abbassare il colesterolo.'), tone: 'blue' },
          { emoji: '🚽', title: L('Regularity', 'Regolarità'), text: L('Helps bowel movements.', 'Aiuta la regolarità intestinale.'), tone: 'yellow' },
          { emoji: '💧', title: L('Drink more', 'Bevi di più'), text: L('Fibre needs water to work well.', 'Le fibre hanno bisogno di acqua per funzionare.'), tone: 'purple' },
        ],
      },
      {
        type: 'swaps',
        title: L('Easy swaps', 'Scambi facili'),
        items: [
          { from: L('White bread', 'Pane bianco'), to: L('Wholegrain bread', 'Pane integrale') },
          { from: L('Fruit juice', 'Succo di frutta'), to: L('Whole fruit, with the peel', 'Frutta intera, con la buccia') },
          { from: L('Plain pasta', 'Pasta in bianco'), to: L('Pasta with legumes or vegetables', 'Pasta con legumi o verdure') },
          { from: L('Biscuits at breakfast', 'Biscotti a colazione'), to: L('Oats with fruit', 'Avena con frutta') },
          { from: L('Crisps as a snack', 'Patatine come spuntino'), to: L('A handful of nuts', 'Una manciata di frutta secca') },
        ],
      },
      { type: 'callout', emoji: '🐢', text: L('Increase fibre slowly over 2–3 weeks and drink more water, to avoid bloating.', 'Aumenta le fibre piano piano in 2–3 settimane e bevi di più, per evitare gonfiore.') },
    ],
  },
  {
    id: 'insulin',
    emoji: '🔑',
    tone: 'pink',
    title: L('Insulin sensitivity, made simple', 'La sensibilità all’insulina, in parole semplici'),
    subtitle: L('Why it matters and how to improve it', 'Perché è importante e come migliorarla'),
    blocks: [
      { type: 'intro', text: L('After a meal, sugar enters the blood. Insulin is the “key” that opens the cells so sugar can get in and become energy.', 'Dopo un pasto lo zucchero entra nel sangue. L’insulina è la “chiave” che apre le cellule per far entrare lo zucchero e trasformarlo in energia.') },
      {
        type: 'steps',
        items: [
          { title: L('🔓 Sensitive cells', '🔓 Cellule sensibili'), text: L('They open easily: little insulin is needed and energy stays stable.', 'Si aprono facilmente: serve poca insulina e l’energia resta stabile.') },
          { title: L('🚪 Resistant cells', '🚪 Cellule resistenti'), text: L('With little movement, belly fat and poor sleep they “stop listening”: the body has to make more and more insulin.', 'Con poco movimento, grasso sulla pancia e sonno scarso “smettono di ascoltare”: il corpo deve produrre sempre più insulina.') },
          { title: L('⚠️ Over the years', '⚠️ Negli anni'), text: L('Tiredness, hunger, belly fat and a higher risk of type 2 diabetes.', 'Stanchezza, fame, grasso addominale e un rischio più alto di diabete di tipo 2.') },
        ],
      },
      {
        type: 'cards',
        cols: 2,
        title: L('How to improve it', 'Come migliorarla'),
        items: [
          { emoji: '🏋️', title: L('Strength training', 'Allenamento di forza'), text: L('Working muscles take up sugar even with little insulin.', 'I muscoli che lavorano assorbono zucchero anche con poca insulina.'), tone: 'orange' },
          { emoji: '🚶', title: L('Walk after meals', 'Cammina dopo i pasti'), text: L('10–15 minutes is enough to lower the sugar peak.', 'Bastano 10–15 minuti per abbassare il picco di zucchero.'), tone: 'green' },
          { emoji: '😴', title: L('Sleep 7–9 hours', 'Dormi 7–9 ore'), text: L('Even one bad night makes cells less sensitive.', 'Anche una sola notte storta rende le cellule meno sensibili.'), tone: 'purple' },
          { emoji: '🥦', title: L('Veg and protein first', 'Prima verdure e proteine'), text: L('Eat carbs at the end of the meal for a gentler rise.', 'Mangia i carboidrati alla fine del pasto per una salita più dolce.'), tone: 'blue' },
          { emoji: '🥤', title: L('Fewer sugary drinks', 'Meno bibite zuccherate'), text: L('Liquid sugar arrives fast and doesn’t fill you up.', 'Lo zucchero liquido arriva veloce e non sazia.'), tone: 'pink' },
          { emoji: '📏', title: L('A smaller waist', 'Un girovita più piccolo'), text: L('Losing even a little belly fat helps a lot.', 'Perdere anche poco grasso addominale aiuta molto.'), tone: 'yellow' },
        ],
      },
      { type: 'callout', emoji: '✨', text: L('Good news: a single workout improves insulin sensitivity for up to 1–2 days.', 'Buona notizia: un solo allenamento migliora la sensibilità all’insulina fino a 1–2 giorni.') },
    ],
  },
  {
    id: 'workout_food',
    emoji: '🍌',
    tone: 'orange',
    title: L('What to eat before and after training', 'Cosa mangiare prima e dopo l’allenamento'),
    subtitle: L('And why it helps', 'E perché aiuta'),
    blocks: [
      {
        type: 'timeline',
        items: [
          { emoji: '🍝', time: L('2–3 hours before', '2–3 ore prima'), text: L('A normal meal with carbs and protein, not too fatty: pasta with tuna, rice and chicken. It fuels your muscles.', 'Un pasto normale con carboidrati e proteine, non troppo grasso: pasta al tonno, riso e pollo. Dà carburante ai muscoli.') },
          { emoji: '🍌', time: L('30–60 min before (optional)', '30–60 min prima (facoltativo)'), text: L('A light snack if you’re hungry: a banana, a yogurt, bread with jam.', 'Uno spuntino leggero se hai fame: una banana, uno yogurt, pane e marmellata.') },
          { emoji: '💧', time: L('During', 'Durante'), text: L('Water. For sessions under an hour, nothing else is needed.', 'Acqua. Per allenamenti sotto l’ora non serve altro.') },
          { emoji: '🥛', time: L('Within 1–2 hours after', 'Entro 1–2 ore dopo'), text: L('Protein (20–40 g) + carbs: yogurt with fruit and oats, chicken and potatoes, milk and bread. It repairs muscles and refills energy.', 'Proteine (20–40 g) + carboidrati: yogurt con frutta e avena, pollo e patate, latte e pane. Ripara i muscoli e ricarica l’energia.') },
        ],
      },
      { type: 'dodont', dos: [L('Eat something 1–3 hours before', 'Mangia qualcosa 1–3 ore prima'), L('Bring a water bottle', 'Porta una borraccia'), L('Have a protein-rich meal after', 'Fai un pasto ricco di proteine dopo')], donts: [L('Train on a completely empty stomach if you feel dizzy', 'Allenarti a digiuno se ti gira la testa'), L('A big fried meal just before', 'Un grande pasto fritto appena prima'), L('“Rewarding” yourself with sweets after', '“Premiarti” con i dolci dopo')] },
      { type: 'callout', emoji: '🎯', text: L('What matters most is total protein over the whole day; timing is the cherry on top.', 'Quello che conta di più sono le proteine totali della giornata; il momento giusto è la ciliegina sulla torta.') },
    ],
  },
  {
    id: 'meals',
    emoji: '👩‍🍳',
    tone: 'yellow',
    title: L('Simple meal ideas', 'Idee per pasti semplici'),
    subtitle: L('Balanced, tasty and quick to prepare', 'Equilibrati, gustosi e veloci da preparare'),
    blocks: [
      {
        type: 'meals',
        groups: [
          {
            title: L('Breakfast', 'Colazione'),
            items: [
              { emoji: '🥣', name: L('Greek yogurt, berries, walnuts and oats', 'Yogurt greco, frutti di bosco, noci e avena'), protein: 25 },
              { emoji: '🍳', name: L('Scrambled eggs, wholegrain toast and fruit', 'Uova strapazzate, pane integrale tostato e frutta'), protein: 20 },
              { emoji: '☕', name: L('Milky coffee and rusks with ricotta and honey', 'Caffellatte e fette biscottate con ricotta e miele'), protein: 20 },
            ],
          },
          {
            title: L('Lunch', 'Pranzo'),
            items: [
              { emoji: '🍲', name: L('Pasta e ceci (pasta with chickpeas) and a salad', 'Pasta e ceci con un’insalata'), protein: 25 },
              { emoji: '🍚', name: L('Chicken, rice and vegetable bowl', 'Bowl di pollo, riso e verdure'), protein: 40 },
              { emoji: '🥗', name: L('Tuna, beans and tomato salad with bread', 'Insalata di tonno, fagioli e pomodori con pane'), protein: 35 },
            ],
          },
          {
            title: L('Dinner', 'Cena'),
            items: [
              { emoji: '🐟', name: L('Baked salmon, potatoes and green beans', 'Salmone al forno, patate e fagiolini'), protein: 30 },
              { emoji: '🥚', name: L('Vegetable frittata (3 eggs) and bread', 'Frittata di verdure (3 uova) e pane'), protein: 22 },
              { emoji: '🥣', name: L('Lentil soup, wholegrain bread and a little cheese', 'Zuppa di lenticchie, pane integrale e un po’ di formaggio'), protein: 25 },
            ],
          },
          {
            title: L('Snacks', 'Spuntini'),
            items: [
              { emoji: '🫐', name: L('Skyr with fruit', 'Skyr con frutta'), protein: 15 },
              { emoji: '🥩', name: L('Bresaola, rocket and parmesan', 'Bresaola, rucola e parmigiano'), protein: 20 },
              { emoji: '🍎', name: L('An apple and a handful of almonds', 'Una mela e una manciata di mandorle'), protein: 6 },
            ],
          },
        ],
      },
      { type: 'callout', emoji: '🧊', text: L('Cook once, eat twice: soups, legumes and grilled chicken keep 2–3 days in the fridge.', 'Cucina una volta, mangia due: zuppe, legumi e pollo alla griglia si conservano 2–3 giorni in frigo.') },
    ],
  },
  {
    id: 'daily_activity',
    emoji: '🚶',
    tone: 'green',
    title: L('More movement, with little effort', 'Più movimento, con poco sforzo'),
    subtitle: L('Every step counts', 'Ogni passo conta'),
    blocks: [
      { type: 'intro', text: L('The energy you use in daily life (walking, standing, housework) often counts more than the gym. And it protects heart, joints and mood.', 'L’energia che usi nella vita di tutti i giorni (camminare, stare in piedi, fare i lavori di casa) spesso conta più della palestra. E protegge cuore, articolazioni e umore.') },
      {
        type: 'cards',
        cols: 2,
        items: [
          { emoji: '🍽️', title: L('After meals', 'Dopo i pasti'), text: L('A 10-minute walk after lunch and dinner.', 'Una passeggiata di 10 minuti dopo pranzo e cena.'), tone: 'green' },
          { emoji: '📺', title: L('TV breaks', 'Pause TV'), text: L('Don’t binge: stand up and walk around during ads or every episode.', 'Niente maratone: alzati e cammina durante la pubblicità o a ogni episodio.'), tone: 'orange' },
          { emoji: '🪜', title: L('Stairs', 'Scale'), text: L('Take the stairs for one or two floors.', 'Fai uno o due piani a piedi.'), tone: 'blue' },
          { emoji: '🚌', title: L('Park further away', 'Parcheggia più lontano'), text: L('Or get off the bus one stop early.', 'O scendi dall’autobus una fermata prima.'), tone: 'yellow' },
          { emoji: '📞', title: L('Walk and talk', 'Cammina e parla'), text: L('Walk around while you’re on the phone.', 'Cammina mentre sei al telefono.'), tone: 'purple' },
          { emoji: '🌻', title: L('Active hobbies', 'Hobby attivi'), text: L('Gardening, housework, playing with the grandchildren.', 'Giardinaggio, lavori di casa, giocare con i nipoti.'), tone: 'pink' },
        ],
      },
      { type: 'steps', title: L('Increase gradually', 'Aumenta gradualmente'), items: [ { title: L('Week 1: find your average', 'Settimana 1: trova la tua media'), text: L('Look at your daily steps in the app.', 'Guarda i tuoi passi giornalieri nell’app.') }, { title: L('Every week: +500–1,000 steps a day', 'Ogni settimana: +500–1.000 passi al giorno'), text: L('About 5–10 more minutes of walking.', 'Circa 5–10 minuti di camminata in più.') }, { title: L('Goal: 6,000–8,000 steps', 'Obiettivo: 6.000–8.000 passi'), text: L('For people over 60, most of the health benefit comes by this point.', 'Per chi ha più di 60 anni, la maggior parte dei benefici arriva a questo punto.') } ] },
      { type: 'callout', emoji: '👟', text: L('Carrying the shopping bags is strength training too!', 'Anche portare le borse della spesa è allenamento di forza!') },
    ],
  },
  {
    id: 'sleep',
    emoji: '😴',
    tone: 'purple',
    title: L('Sleep: why it matters and how to improve it', 'Il sonno: perché conta e come migliorarlo'),
    subtitle: L('Aim for 7–9 hours a night', 'L’obiettivo è 7–9 ore a notte'),
    blocks: [
      {
        type: 'cards',
        cols: 2,
        title: L('While you sleep…', 'Mentre dormi…'),
        items: [
          { emoji: '💪', title: L('Muscles recover', 'I muscoli recuperano'), text: L('Training is the signal; sleep is when you get stronger.', 'L’allenamento è il segnale; nel sonno diventi più forte.'), tone: 'orange' },
          { emoji: '🍩', title: L('Hunger is regulated', 'La fame si regola'), text: L('Poor sleep increases hunger and cravings for sweets.', 'Dormire poco aumenta la fame e la voglia di dolci.'), tone: 'pink' },
          { emoji: '🩸', title: L('Sugar is managed', 'Lo zucchero è gestito'), text: L('One bad night already reduces insulin sensitivity.', 'Già una notte storta riduce la sensibilità all’insulina.'), tone: 'blue' },
          { emoji: '🧠', title: L('Memory and mood', 'Memoria e umore'), text: L('The brain sorts memories and “cleans up”.', 'Il cervello ordina i ricordi e “fa pulizia”.'), tone: 'purple' },
        ],
      },
      {
        type: 'timeline',
        title: L('A day for good sleep', 'Una giornata per dormire bene'),
        items: [
          { emoji: '☀️', time: L('Morning', 'Mattina'), text: L('10–20 minutes of daylight outside: it sets your body clock.', '10–20 minuti di luce naturale all’aperto: regola l’orologio biologico.') },
          { emoji: '☕', time: L('By 2 pm', 'Entro le 14'), text: L('Last coffee or tea with caffeine.', 'Ultimo caffè o tè con caffeina.') },
          { emoji: '🍽️', time: L('2–3 hours before bed', '2–3 ore prima di dormire'), text: L('Last meal. Avoid sweets, processed foods, heavy fried food and alcohol: they make sleep lighter and more broken.', 'Ultimo pasto. Evita dolci, cibi processati, fritti pesanti e alcol: rendono il sonno più leggero e interrotto.') },
          { emoji: '📱', time: L('1 hour before', '1 ora prima'), text: L('Dim the lights, put the phone away, read or stretch.', 'Luci soffuse, telefono lontano, leggi o fai stretching.') },
          { emoji: '🛏️', time: L('Bedtime', 'A letto'), text: L('Cool (17–19 °C), dark and quiet room. Same time every day.', 'Stanza fresca (17–19 °C), buia e silenziosa. Stessa ora ogni giorno.') },
        ],
      },
      { type: 'callout', emoji: '💤', text: L('Naps are fine if short (under 30 minutes) and before 3 pm.', 'I sonnellini vanno bene se brevi (meno di 30 minuti) e prima delle 15.') },
    ],
  },
  {
    id: 'small_habits',
    emoji: '✅',
    tone: 'orange',
    title: L('10 small habits, big results', '10 piccole abitudini, grandi risultati'),
    subtitle: L('Low effort, high impact', 'Poco sforzo, tanto effetto'),
    blocks: [
      {
        type: 'steps',
        items: [
          { title: L('A glass of water when you wake up', 'Un bicchiere d’acqua appena ti svegli') },
          { title: L('Protein at every meal, starting with breakfast', 'Proteine a ogni pasto, a partire dalla colazione') },
          { title: L('Half the plate vegetables', 'Metà piatto di verdure') },
          { title: L('A 10-minute walk after lunch and dinner', '10 minuti di camminata dopo pranzo e cena') },
          { title: L('Water instead of sugary drinks', 'Acqua al posto delle bibite zuccherate') },
          { title: L('Sweets after a meal, not on their own', 'I dolci dopo il pasto, non da soli') },
          { title: L('No processed snacks or sugar at night: you’ll sleep better', 'Niente snack processati o zuccheri la sera: dormirai meglio') },
          { title: L('Two strength workouts a week', 'Due allenamenti di forza a settimana') },
          { title: L('Bed and wake-up at the same time every day', 'A letto e sveglia alla stessa ora ogni giorno') },
          { title: L('Weigh yourself 2–3 times a week and watch the trend, not the single day', 'Pesati 2–3 volte a settimana e guarda la tendenza, non il singolo giorno') },
        ],
      },
      { type: 'callout', emoji: '🎯', text: L('Pick ONE habit this week. When it becomes automatic, add the next one.', 'Scegli UNA sola abitudine questa settimana. Quando diventa automatica, aggiungi la prossima.') },
    ],
  },
]

// The meal tricks lessons come right after "Meal ideas" in the beginners' course.
TOPICS.splice(TOPICS.findIndex((x) => x.id === 'meals') + 1, 0, ...MEAL_TRICKS)

/** Every lesson, beginners' course first, then the expert track. */
export const ALL_TOPICS: Topic[] = [...TOPICS, ...EXPERT_TOPICS]
export { EXPERT_TOPICS }
