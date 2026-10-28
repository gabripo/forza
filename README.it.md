<p align="center"><img src="app/public/pwa-192.png" width="96" alt="Logo di Forza!"></p>

<h1 align="center">Forza!</h1>
<p align="center"><b>Aiuta le persone a cui vuoi bene a diventare più forti e più in salute, un piccolo passo alla volta.</b></p>
<p align="center">Gratuita · open source · italiano e inglese · funziona su qualsiasi telefono<br><a href="README.md">🇬🇧 Read in English</a></p>

---

I nostri genitori stanno invecchiando. Sappiamo che **allenamento di forza, abbastanza proteine, camminare e
dormire bene** possono mantenerli autonomi e in salute per molti anni in più. Ma "vai in palestra e mangia
meglio" non è un consiglio che qualcuno riesce davvero a seguire.

**Forza!** è un'app semplice e amichevole che prepari *per* un genitore o un parente. Lo accompagna in
allenamenti adatti ai principianti, mostra i progressi in parole semplici, stima i pasti da una foto e spiega le
basi della salute con infografiche da stampare. Tu, il "coach" di famiglia, segui i progressi e aggiorni la
scheda da una dashboard privata sul tuo computer.

<p align="center">
  <img src="docs/screenshots/dashboard.jpg" width="200" alt="Home">
  <img src="docs/screenshots/workout.jpg" width="200" alt="Allenamento con timer di recupero">
  <img src="docs/screenshots/progress.jpg" width="200" alt="Progressi">
  <img src="docs/screenshots/food.jpg" width="200" alt="Cibo e calorie">
  <img src="docs/screenshots/learn.jpg" width="200" alt="Infografica">
</p>

## Cosa fa

**🏠 Home.** Andamento del peso (una linea "smussata", così gli alti e bassi di ogni giorno non scoraggiano),
forza guadagnata per esercizio, allenamenti della settimana, passi, cibo di oggi e un consiglio al giorno.

**🏋️ Allenamento, pensato per chi inizia.**
- Ogni esercizio ha foto di inizio e fine movimento, tre passi semplici, un consiglio chiave e un video.
- I pesi sono **già compilati e la progressione è automatica**: *"L'ultima volta hai fatto tutte le ripetizioni: prova 18 kg oggi."*
- Un tocco per serie, la scala "quanto è stata dura?" (Facile · Giusta · Dura · Al limite) e il **timer di recupero** con suono e vibrazione.
- Lo schermo resta acceso e l'allenamento viene salvato prima sul telefono: anche senza campo in palestra non si perde nulla.
- **Superset** (due esercizi alternati, un solo recupero), **serie di riscaldamento** automatiche per gli esercizi
  pesanti e una **settimana programmata** (es. giovedì A, sabato B) con allenamenti fatti e camminate sincronizzate.
- Ogni esercizio ha lo **storico** delle serie e i record personali (peso massimo, serie migliore).
- Puoi creare i tuoi allenamenti, oppure il coach di famiglia prepara la scheda a distanza.

**✅ Checklist del giorno.** Allenamento (o riposo), pesata, pasti e passi, con "3 su 4 fatti".

**📈 Progressi.** Velocità di dimagrimento rispetto all'obiettivo, forza, costanza, passi e alimentazione,
ognuno con un giudizio chiaro (*Bene / OK / Da migliorare*) e un consiglio concreto. Check-in settimanali per
energia, sonno, umore e girovita. **Settimane di fila** di allenamento, totale allenamenti, **record personali**
recenti, **foto dei progressi** private (prima e ultima) e una scheda **"Condividi con la famiglia"**.

**📸 Calorie da una foto.** Fotografi il piatto e Google Gemini stima ogni alimento con i suoi macronutrienti.
Le porzioni si possono correggere, e il piatto riceve un **punteggio per perdere grasso e per aumentare i
muscoli** rispetto al fabbisogno personale (TDEE). Il TDEE parte da profilo e livello di attività, poi si adatta
a passi e allenamenti registrati e, dopo due settimane di diario alimentare, a quello che ha fatto davvero la
bilancia. Un **check-in settimanale** confronta la tendenza del peso con il ritmo obiettivo e suggerisce un piccolo
aggiustamento delle calorie (±100–150 kcal). È sempre disponibile l'inserimento manuale con oltre 60 cibi comuni.

**📚 Impara.** Un breve **percorso guidato** (con la "Prossima lezione" in Home) di dodici infografiche per principianti, da stampare in A4 o salvare come immagine, in italiano o
inglese: perché la forza conta con l'età · i macronutrienti · il piatto equilibrato (e le porzioni con la mano) ·
le proteine · dove trovare i nutrienti · le fibre · la sensibilità all'insulina · cosa mangiare prima e dopo
l'allenamento · idee per i pasti · più movimento con poco sforzo · il sonno · 10 piccole abitudini.

**🔄 Passi e peso automatici.** iPhone con un Comando Rapido, Android con una piccola app per Connessione Salute.
Le bilance **Eufy** (o qualsiasi bilancia smart) funzionano tramite Apple Salute / Connessione Salute, e le pesate
passate si importano da CSV.

**🔒 Privata per scelta.**
- Gli account li crei **solo tu** (la registrazione pubblica è chiusa).
- Ognuno vede solo i propri dati (row-level security di Postgres).
- La dashboard di amministrazione gira **solo sul tuo Mac**, con la chiave principale nel Portachiavi di macOS.

## Iniziare

Segui la **[guida all'installazione](docs/setup.md)** (in inglese): fork del progetto, un progetto Supabase
gratuito, uno script di deploy, due variabili su GitHub, ed è online. Costo per una famiglia: 0 €.

Prova in locale con i dati demo in due minuti:

```bash
supabase start && supabase db reset   # utente demo "Maria", 10 settimane di storico
cd app && npm install && npm run dev  # http://localhost:5173 · demo@forza.local / forza-demo-2026
```

## Contribuire

Idee, traduzioni (altre lingue sono benvenute!), contenuti sugli esercizi e segnalazioni di bug sono molto
graditi: apri una issue o una pull request. I contenuti sulla salute vogliono essere semplici **e** corretti:
se trovi qualcosa di impreciso, faccelo sapere.

## Avvertenza

Forza! offre informazioni generali e **non sostituisce il parere medico**. Chi inizia un programma di
allenamento, soprattutto se anziano o con problemi di salute, deve prima parlarne con il proprio medico.

## Licenza

[MIT](LICENSE)
