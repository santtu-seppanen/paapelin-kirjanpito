# Paapelin kirjanpito

Mökin yhteinen kirjanpito: kulujen syöttö mobiilissa ja dashboard saldoista, kululajeista ja ennusteista.

- **Sivusto:** https://santtu-seppanen.github.io/paapelin-kirjanpito/
- **API:** https://paapelin-kirjanpito-api.santtu-seppane.workers.dev

## Rakenne

| Kansio | Sisältö |
|---|---|
| `web/` | Staattinen frontend (GitHub Pages). `index.html` = syöttö ja asiakirjat, `tilanne.html` = dashboard (yleiskuva, osakkaat, tilikaudet, sopimus, tapahtumat) |
| `worker/` | Cloudflare Worker + D1-tietokanta (`schema.sql`, `seed.sql`) |
| `scripts/import_xlsx.py` | Vanhan Excel-kirjanpidon muunnos D1:n seed-SQL:ksi |
| `scripts/document_sql.py` | Asiakirjan (esim. sopimus-PDF) lisäys D1:een SQL-tiedostona |

## Kirjanpidon logiikka

Jokainen rivi on yksi neljästä tyypistä:

- `shared` – osakas maksoi yhteisen kulun omasta pussistaan
- `deposit` – osakas siirsi rahaa yhteiselle tilille
- `account` – tilin oma tapahtuma (lasku tililtä negatiivisena, korko positiivisena)
- `income` – vuokratulo tilille

Osakkaan **saldo** = omat yhteiset kulut + tilisiirrot − ⅓ yhteisistä nettokuluista
(yhteiset kulut + tililtä maksetut − tulot). Saldojen summa on tilin saldo, joten tasatilanteessa
kaikkien saldot ovat yhtä suuret.

Tilikausi on 1.11.–31.10. (yhteisomistussopimuksen kohta 8).

### Tositteet ja asiakirjat

Jokaisen uuden kirjauksen jälkeen avautuu ikkuna, jossa liitetään kuitti tai lasku (kuva tai PDF)
tai kirjoitetaan selite, miksi tositetta ei ole. Tiedostot tallennetaan D1:een (`receipts`), kuvat
pienennetään selaimessa alle 1,9 Mt:n. Repo ja GitHub Pages ovat julkisia, joten sopimus ja muut
asiakirjat ovat `documents`-taulussa salasanan takana. Uuden version voi lisätä etusivulta tai:

```sh
python3 scripts/document_sql.py "Yhteisomistussopimus" sopimus.pdf > /tmp/doc.sql
cd worker && npx wrangler d1 execute paapelin-kirjanpito --remote --file=/tmp/doc.sql
```

### Uusi aika

Excelistä tuodut vanhat kirjaukset on tasattu 14.10.2026, eikä niihin tuoda tositteita. Asetus
`eraStart` (oletus 15.10.2026) rajaa tositeseurannan, pienhankintabudjetit ja vuokratulovarat
alkamaan tästä päivästä. Vanhat rivit näkyvät tositteiden osalta tilassa "vanha, tasattu".

### Sopimusnäkymä

Sopimuksen kuluvastaavat, kirjanpitäjä ja euromääräiset rajat tallennetaan `settings`-tauluun
(muokattavissa Tilanne → Sopimus → asetukset). Laskennan oletukset:

- **Pienhankintabudjetti** = kuluvastaavan talletukset ja hankinnat vastuukauden alusta −
  osakkaan omat hankinnat ja tilisiirrot. Plussalla = mökin saatava osakkaalta.
- **Vuokratulovarat** = vuokratulot − hoitajan osuus (oletus 50 %). Hoitaja on tulon kirjannut
  osakas; tililtä maksettu korvaus tunnistetaan sanasta "hoitaja" kuvauksessa.
- **Korjausrahoitus**: vuokratulovarat → budjettien puskurin ylittävä osa → loput tasan.

## Kehitys ja julkaisu

Molemmat osat julkaistaan automaattisesti GitHub Actionsilla, kun mainiin pushataan:

| Workflow | Laukaisee | Julkaisee |
|---|---|---|
| `pages.yml` | muutokset `web/`-kansiossa | frontend GitHub Pagesiin |
| `worker.yml` | muutokset `worker/`-kansiossa | skeema D1:een + Worker Cloudflareen |

Worker-julkaisu tarvitsee repoon salaisuuden `CLOUDFLARE_API_TOKEN` (Cloudflaren
"Edit Cloudflare Workers" -pohja + D1 Edit -oikeus) ja muuttujan `CLOUDFLARE_ACCOUNT_ID`.
Käsin julkaisu: `cd worker && npx wrangler deploy`.

Salasanan vaihto: `npx wrangler secret put APP_PASSWORD`

Tietokannan nollaus Excelistä:

```sh
python3 scripts/import_xlsx.py "Paapelin kirjanpito.xlsx" > worker/seed.sql
cd worker && npm run db:seed
```

Paikallinen testaus: `npx wrangler dev` (API) ja esim. `python3 -m http.server -d web 8080`
(muuta `web/config.js`:n osoite tarvittaessa). Worker sallii localhost-originit.
