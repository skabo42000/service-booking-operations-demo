# Studio Princess — demo sajta i zakazivanja

Lokalni demo za Studio Princess u Banjoj Luci. Sajt je na srpskom, latinicom i ijekavicom, s paletom i tipografijom projekta European Beauty Lounge. Usluge su nokti, kosa, depilacija i solarijum. **Solarijum nema zakazivanje.** Cijene, stvarne smjene i imena zaposlenih nisu potvrđeni.

## Javni demo

- Sajt: https://studio-princess-demo.vercel.app (Vercel, region Dablin). Admin: `/admin`: izbor osobe (vlasnica ili član tima) i demo lozinka `DEMO_ADMIN_KEY`.
- Baza: Turso `princess-demo` (Irska). Probni podaci se vraćaju na početno stanje svake noći.
- Kod: privatni GitHub repozitorij `skabo42000/princess-booking-website`; deploy sa `npx vercel deploy --prod --yes`.
- Privremeno: `BOT_CHECK=off` dok se ne dodaju Cloudflare Turnstile ključevi (ograničenja broja pokušaja rade); Google prijava se prikazuje tek sa `GOOGLE_OAUTH_*`; AI vodič čeka Render servis `princess-ai`.

## Šta radi demo

- Javni kalendar za probne termine noktiju, kose i depilacije; jedno vrijeme ne može biti rezervisano dvaput, ni kada dva posjetioca potvrde istovremeno.
- Zaštita od spama: najviše 10 pokušaja na sat po posjetiocu i 300 dnevno ukupno, uz Cloudflare Turnstile provjeru. Probni podaci se vraćaju na početno stanje svake noći.
- Demo potvrda na ekranu i preuzimanje kalendarske `.ics` datoteke. Nema stvarnih rezervacija ni slanja poruka.
- Klijentski nalozi: prijava kodom na email (demo prikazuje kod na ekranu umjesto slanja) ili Google nalogom kada su postavljeni `GOOGLE_OAUTH_CLIENT_ID` i `GOOGLE_OAUTH_CLIENT_SECRET`. Online zakazivanje traži prijavu; najviše 3 zakazana termina po nalogu. Stranica „Moji termini“: promjena i otkazivanje termina, profil, odjava i brisanje naloga.
- Osoblje: prijava po osobi sa ulogom. Vlasnica vidi i uređuje sve (kalendar, klijente, tim, usluge sa cijenom, smjene, izvještaje, storno). Član tima vidi samo svoje termine i smjene, upisuje termine i naplatu sebi i uređuje svoj profil; server provjerava ulogu u svakoj ruti.
- Zaštićeni `/admin`: unos termina dogovorenih telefonom, porukom ili u salonu (danas i do 90 dana unaprijed), premještanje na drugo vrijeme ili člana tima, označavanje dolaska i nedolaska (tek na dan termina; nedolazak oslobađa vrijeme), otkazivanje, pauze, sedmične smjene i profili tima.
- Evidencija naplate na terminu sa dolaskom (iznos u KM, gotovina/kartica/poklon bon, broj fiskalnog računa), storno bez brisanja, dnevni izvještaj za poređenje sa kasom i CSV izvoz za knjigovođu. Program ne izdaje fiskalne račune.
- Kartoteka klijenata: termin sa brojem telefona automatski ide istom klijentu bez obzira na oblik broja, pretraga bez kvačica, dolasci, nedolasci, naplaćeno, napomene, blokada za online zakazivanje i brisanje ličnih podataka uz čuvanje evidencije naplate.
- AI vodič na osnovu potvrđenog dokumenta; ne navodi cijene ni stvarne slobodne termine.

## Lokalno pokretanje

Potrebni su Node.js 24 i `uv` s Pythonom 3.12. U korijenu projekta napravite git-ignorisan `.env.local` prema `.env.example`. Dva admin tajna niza treba da imaju najmanje 20 nasumičnih znakova. Gemini i Groq ključevi su potrebni samo za AI vodič. Bez `TURSO_DATABASE_URL` baza je lokalni fajl `data/princess-demo.db`; bez Turnstile ključeva lokalno nema provjere da nije robot (za probu se mogu koristiti Cloudflare test vrijednosti iz `.env.example`). Nikada ne unosite ključeve u repozitorij.

U prvom terminalu:

```powershell
npm ci
npm run dev
```

Ostavite ovaj terminal otvoren: `http://localhost:3000` radi samo dok je `npm run dev` pokrenut. Ako je port 3000 zauzet, Next.js će u terminalu ispisati drugi port.

U drugom terminalu:

```powershell
cd ai_backend
uv sync
uv run python -m princess_ai.rag
uv run uvicorn princess_ai.api:app --host 127.0.0.1 --port 8001
```

Sajt je na `http://localhost:3000`, a admin na `http://localhost:3000/admin`. Admin lozinka je vrijednost `DEMO_ADMIN_KEY` iz `.env.local`. Ako Gemini besplatna kvota nije dostupna, postavite `AI_PRIMARY_PROVIDER=groq`; tada se koristi dostupni Groq model.

## Provjere

```powershell
npm test
npm run typecheck
npm run lint
npm run build
cd ai_backend
uv run python -m princess_ai.evals
```

AI eval ima osam pitanja, uključujući nepoznatu cijenu, lažni termin i pokušaj promjene uputstava. Početna verzija prošla je 4/8, a verzija s pravilima i provjerama 8/8 na istom skupu. Rezultat pojedinačnog pokretanja može varirati. Rezultati su lokalni u `ai_backend/evals/results/` i nisu u gitu.

## Ograničenja demo verzije

Lokalno je baza fajl u `data/`. Za javni demo na Vercelu postavljaju se `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` i `TURNSTILE_SECRET_KEY`; bez Turnstile tajne zakazivanje na Vercelu ne radi, namjerno. Prije stvarnih rezervacija treba potvrditi usluge, trajanja, imena i rasporede zaposlenih, radno vrijeme, kontakt, cjenovnik i način obavještavanja korisnika.
