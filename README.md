# Paapelin kirjanpito

Mökin yhteinen kirjanpito: kulujen syöttö mobiilissa ja dashboard saldoista, kululajeista ja ennusteista.

- **Sivusto:** https://santtu-seppanen.github.io/paapelin-kirjanpito/
- **API:** https://paapelin-kirjanpito-api.santtu-seppane.workers.dev

## Rakenne

| Kansio | Sisältö |
|---|---|
| `web/` | Staattinen frontend (GitHub Pages). `index.html` = syöttö, `tilanne.html` = dashboard |
| `worker/` | Cloudflare Worker + D1-tietokanta (`schema.sql`, `seed.sql`) |
| `scripts/import_xlsx.py` | Vanhan Excel-kirjanpidon muunnos D1:n seed-SQL:ksi |

## Kirjanpidon logiikka

Jokainen rivi on yksi neljästä tyypistä:

- `shared` – osakas maksoi yhteisen kulun omasta pussistaan
- `deposit` – osakas siirsi rahaa yhteiselle tilille
- `account` – tilin oma tapahtuma (lasku tililtä negatiivisena, korko positiivisena)
- `income` – vuokratulo tilille

Osakkaan **saldo** = omat yhteiset kulut + tilisiirrot − ⅓ yhteisistä nettokuluista
(yhteiset kulut + tililtä maksetut − tulot). Saldojen summa on tilin saldo, joten tasatilanteessa
kaikkien saldot ovat yhtä suuret.

## Kehitys ja julkaisu

Frontend julkaistaan automaattisesti GitHub Actionsilla, kun `web/`-kansioon pushataan mainiin.

Worker julkaistaan käsin:

```sh
cd worker
npm install
npx wrangler deploy
```

Salasanan vaihto: `npx wrangler secret put APP_PASSWORD`

Tietokannan nollaus Excelistä:

```sh
python3 scripts/import_xlsx.py "Paapelin kirjanpito.xlsx" > worker/seed.sql
cd worker && npm run db:seed
```

Paikallinen testaus: `npx wrangler dev` (API) ja esim. `python3 -m http.server -d web 8080`
(muuta `web/config.js`:n osoite tarvittaessa). Worker sallii localhost-originit.
