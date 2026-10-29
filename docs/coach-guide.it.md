# Guida per il coach: configura Forza! per una persona cara

*🇬🇧 [Read in English](coach-guide.md)*

Questa guida è per te se stai configurando Forza! per un genitore, un nonno o un altro parente.
Ti chiamiamo **coach**: prepari tutto sul tuo computer, la persona usa solo l'app sul suo telefono.

Non servono competenze tecniche. La prima volta calcola **circa 30 minuti**, con il suo telefono accanto.

**Cosa serve**

- Un computer: Mac, Windows o Linux.
- Il suo telefono: Android o iPhone, con internet.
- Un tuo indirizzo email (per creare due account gratuiti: Supabase e, se vuoi, Google).

**Quanto costa**: niente. Ogni parte usa piani gratuiti più che sufficienti per una famiglia.

---

## 1. Forza! Coach sul tuo computer

Forza! Coach è una piccola app che funziona **solo sul tuo computer**. Crea gli account, mostra i
progressi di tutti e ti permette di cambiare la scheda di allenamento da casa.

1. **Installa Node.js** (gratuito, serve a Forza! Coach): apri [nodejs.org](https://nodejs.org/it/download),
   scarica la versione **LTS** per il tuo computer e installala come qualsiasi programma.
2. **Scarica Forza!**: nella [pagina di Forza! su GitHub](https://github.com/gabripo/forza) clicca il pulsante
   verde **Code** → **Download ZIP**. Decomprimi il file (doppio clic) e sposta la cartella `forza` in un
   posto dove la ritrovi, per esempio *Documenti*.
3. **Avvia Forza! Coach** dalla cartella `forza`:

   | Computer | Cosa fare |
   |---|---|
   | **Mac** | Doppio clic su **Forza Coach (Mac).command**. La prima volta macOS può dire che non riesce a verificare lo sviluppatore: clic destro sul file → **Apri** → **Apri**. |
   | **Windows** | Doppio clic su **Forza Coach (Windows).bat**. Se compare "Windows ha protetto il PC", clicca **Ulteriori informazioni** → **Esegui comunque**. |
   | **Linux** | Esegui `./forza-coach-linux.sh` in un terminale (oppure clic destro → *Esegui come programma*). |

   Si apre una finestra con del testo (lasciala aperta mentre usi Coach) e, dopo qualche secondo,
   Forza! Coach compare nel browser. Il primo avvio richiede un minuto in più.

> Per riaprire Coach in seguito, doppio clic sullo stesso file. Chiudi la finestra di testo per fermarlo.

## 2. Prima configurazione (una volta sola)

La prima volta Forza! Coach mostra una breve configurazione in quattro passi.

### Passo 1: un account Supabase gratuito

[Supabase](https://supabase.com) conserva online i dati di Forza! (è un'azienda di database; il piano
gratuito basta). I dati appartengono a te: nessun altro, nemmeno gli autori di Forza!, può vederli.

1. Apri [supabase.com/dashboard/sign-up](https://supabase.com/dashboard/sign-up) e crea un account.
2. Apri [Account → Access Tokens](https://supabase.com/dashboard/account/tokens) → **Generate new token**,
   chiamalo "Forza Coach" e copialo.
3. Incollalo in Forza! Coach e clicca **Save token**.

### Passo 2: dove vive Forza!

Clicca **Create a new free project** (lascia il nome "forza" e la tua regione) e aspetta circa due minuti.
Se hai già un progetto Supabase da usare, sceglilo dalla lista.

### Passo 3: foto del cibo (facoltativo)

Forza! può stimare le calorie di un pasto da una foto con l'intelligenza artificiale Gemini di Google.
Il piano gratuito basta per una famiglia.

1. Apri [Google AI Studio → API keys](https://aistudio.google.com/apikey) ed entra con un account Google.
2. Clicca **Create API key**, copia la chiave e incollala in Forza! Coach.

Puoi saltare questo passo e aggiungere la chiave più tardi da **Setup**. Senza chiave si possono comunque
registrare i pasti a mano o con il codice a barre.

### Passo 4: installazione

Clicca **Install Forza!**. In circa un minuto Coach prepara il database, le funzioni del server e le
impostazioni di accesso. Quando compare **Forza! is ready**, la configurazione è finita.

## 3. Aggiungi una persona e collega il suo telefono

1. In **People → Add a person** scrivi il nome, scegli la lingua e clicca **Create account**.
   L'email non serve.
2. Coach apre **Sign in a phone**. Clicca **Make a sign-in code**: compare un codice QR.
3. Dai il telefono alla persona e chiedile di aprire la **fotocamera** e inquadrare il codice sullo schermo,
   poi di toccare il link che compare. (Oppure stampa un **biglietto di benvenuto** con codice e istruzioni.)
   - **Android**: Forza! si apre in Chrome. Tocca **Inizia**, poi aggiungi l'app alla schermata Home:
     menu ⋮ → **Installa app** (o *Aggiungi a schermata Home*).
   - **iPhone**: Forza! si apre in Safari. Prima di toccare Inizia, tocca Condividi →
     **Aggiungi alla schermata Home**. Apri Forza! dalla nuova icona, tocca **Inquadra il mio codice**,
     inquadra di nuovo lo stesso codice QR e tocca **Inizia**. (Su iPhone l'app nella schermata Home ha un
     accesso separato da Safari.)
4. La persona risponde a poche domande semplici (oppure compila prima il suo **Profile** in Coach: andrà
   direttamente alla schermata principale).

<p><img src="screenshots/coach-signin.jpg" width="480" alt="Un codice di accesso in Forza! Coach"> <img src="screenshots/welcome.jpg" width="200" alt="La schermata di benvenuto sul telefono"></p>

Ogni codice funziona **una sola volta**, per **24 ore**. Creane uno nuovo quando serve (telefono nuovo,
reset). L'accesso resta attivo: nessuna password da ricordare.

## 4. Passi, peso e bilance smart

Forza! può leggere **passi** e **peso** dal telefono, così non bisogna mai scriverli.
Sul suo telefono, in Forza!: **Impostazioni → Collega Salute e bilancia**, poi:

- **Android**: tocca **Crea chiave**, poi **Scarica** la piccola app *Forza! Health* e
  installala (consenti l'installazione da Chrome quando richiesto). Tornati in Forza!, tocca
  **Collega l’app di supporto** e consenti *Passi*, *Peso* e *Allenamento*. Si sincronizza da sola qualche
  volta al giorno.
- **iPhone**: segui il link al comando rapido **Forza Sync** ([guida](apple-shortcut.md)) e impostalo
  perché parta ogni giorno.
- **Eufy (o qualsiasi bilancia smart)**: nell'app EufyLife attiva **Connessione Salute** (Android) o
  **Apple Salute** (iPhone) per il peso. Forza! prende le pesate da lì.

## 5. Arriva da Build With Science?

Se usava l'app **Build With Science** su un telefono **Android**, Coach può portare lo storico in Forza!:
ogni allenamento con tutte le serie e lo sforzo, la scheda settimanale (giorni e superset), l'obiettivo e
i passi giornalieri. Le pesate arrivano da sole tramite Connessione Salute (punto 4).

1. Sul suo telefono attiva il **debug USB** (una volta):
   Impostazioni → Info telefono → tocca **Numero build** sette volte; poi Impostazioni → Sistema →
   **Opzioni sviluppatore** → **Debug USB** attivo.
2. Collega il telefono al computer con un cavo USB e tocca **Consenti** sul telefono.
3. In Coach apri la persona → **Import** → **Check the phone**. La prima volta clicca
   **Download Android tools** (15 MB, da Google).
4. Sblocca il telefono, imposta lo spegnimento dello schermo a 30 minuti e clicca **Start the import**.
   Non toccare il telefono mentre lavora: Coach apre Build With Science e ne legge le schermate come farebbe
   una persona. Servono circa 30 secondi per allenamento (un'ora per un anno di allenamenti); puoi fermarlo
   quando vuoi: la volta dopo riprende da dove si era fermato.
5. In seguito, **Only workouts not imported yet** importa solo quelli nuovi.

<p><img src="screenshots/coach-import.jpg" width="560" alt="Importazione da Build With Science in Forza! Coach"></p>

Coach può anche salvare il risultato come file (**Download the file**), che la persona può importare da
sola in Forza!: **Impostazioni → Collega Salute e bilancia → Importa un file di storico**.

*Non viene importato:* il diario alimentare (la schermata nutrizione di Build With Science non si può
leggere automaticamente), altezza ed età (Build With Science non le mostra) e le foto dei progressi.

## 6. Fare da coach

Apri Forza! Coach quando vuoi:

- **Overview**: andamento del peso, forza guadagnata per esercizio, allenamenti, passi, lezioni lette,
  check-in delle calorie.
- **Workout plan**: cambia esercizi, serie, ripetizioni, recupero, giorni della settimana, superset. Il
  telefono riceve la nuova scheda alla prossima apertura dell'app. Ogni salvataggio conserva la versione
  precedente (**Versions** → **Restore**).
- **Workouts**, **Food**, **Check-ins**: quello che ha registrato.
- **Exercises & videos**: aggiungi un link video o un tuo consiglio a qualsiasi esercizio, o nuovi esercizi
  per tutti.

## 7. Aggiornare Forza!

Quando esce una nuova versione, scarica di nuovo lo ZIP (punto 1), sostituisci la vecchia cartella, avvia
Coach e clicca **Setup → Update the server**. Non si perde nulla: i dati sono nel tuo progetto Supabase.

## Problemi frequenti

| Problema | Cosa fare |
|---|---|
| Coach dice che manca Node.js | Installa la versione LTS da [nodejs.org](https://nodejs.org/it/download) e riavvia Coach. |
| "Questo codice è scaduto o è già stato usato" | Crea un nuovo codice in Coach (valgono 24 ore e funzionano una volta). |
| La fotocamera non apre il codice | In Forza! sul telefono tocca **Inquadra il mio codice**; oppure manda il link (Coach → *Link*) in un messaggio privato. |
| Le foto del cibo dicono "non configurato" | Aggiungi la chiave Gemini in Coach → **Setup** → *Food photo AI* e provala con **Test**. |
| L'importazione da Build With Science si ferma | Tieni il telefono sbloccato con Build With Science in primo piano e riavvia: riprende da dove si era fermata. |
| "No phone found" | Controlla il cavo (alcuni servono solo a caricare), il debug USB, e tocca **Consenti** sul telefono. |

## Privacy e sicurezza

- Ognuno vede **solo i propri dati** (lo garantisce il database).
- Solo tu puoi creare account: la registrazione pubblica è chiusa.
- Le chiavi di Coach restano sul tuo computer, nel suo archivio password (Portachiavi su Mac, Gestione
  credenziali su Windows, il portachiavi di sistema su Linux). Coach risponde solo a questo computer.
- Forza! offre informazioni generali e **non sostituisce il parere medico**. Chi inizia ad allenarsi,
  soprattutto se anziano o con problemi di salute, deve prima parlarne con il proprio medico.

Dettagli tecnici: [configurazione avanzata](advanced-setup.md) · [come è progettata Forza!](design.md).
