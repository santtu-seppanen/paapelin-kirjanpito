// Yhteinen logiikka molemmille sivuille: API, kirjautuminen, muotoilu ja laskenta.

const API = (window.PAAPELI_CONFIG && window.PAAPELI_CONFIG.apiUrl || "").replace(/\/+$/, "");
const OWNERS = ["Santtu", "Vili", "Urpo"];
const OWNER_COLORS = { Santtu: "--c1", Vili: "--c2", Urpo: "--c3" };

// Kululajit kiinteässä järjestyksessä; väri seuraa kategoriaa, ei sen sijoitusta.
const CATEGORIES = [
  { name: "Sähkölaskut", color: "--c1", recurring: true },
  { name: "Vesi ja lämpö", color: "--c3", recurring: true },
  { name: "Rakentaminen ja korjaus", color: "--c2" },
  { name: "Maalaus", color: "--c4" },
  { name: "Kalusteet ja varusteet", color: "--c7" },
  { name: "Sähkötyöt", color: "--c5" },
  { name: "Piha ja ranta", color: "--c6" },
  { name: "Työpalkat", color: "--c8" },
  { name: "Vakuutukset ja maksut", color: "--c-other", recurring: true },
  { name: "Muut", color: "--c-other" },
];
const SPECIAL_CATEGORIES = ["Tilisiirto", "Vuokratulot", "Pankki"];

const KIND_LABELS = {
  shared: "Yhteinen kulu",
  deposit: "Rahaa tilille",
  account: "Tilin tapahtuma",
  income: "Tulo",
};

// Kuvauksen perusteella ehdotettava kategoria (sama logiikka kuin Excel-tuonnissa).
const CATEGORY_RULES = [
  ["Pankki", ["korko", "lähdevero", "alkusaldo"]],
  ["Sähkölaskut", ["sähkölasku"]],
  ["Sähkötyöt", ["sähkökeskus", "ryhmäkeskus", "sähkötyö", "sähkötöitä", "latausasema", "loisteputk", "valaisin", "mittalaitteen", "jatkojohto"]],
  ["Sähkölaskut", ["sähkö", "kajave"]],
  ["Vesi ja lämpö", ["vesi ja lämpö", "vesiosuuskunta", "kaukolämpö"]],
  ["Työpalkat", ["palkka", "palkkio"]],
  ["Maalaus", ["maali", "pensseli", "puunsuoja", "puuöljy", "silikoni", "maalaus"]],
  ["Piha ja ranta", ["ponttoon", "kantojyrsin", "pihakiv", "kaivinkone", "kaivur", "laituri", "polttopuu", "halko"]],
  ["Vakuutukset ja maksut", ["vakuutus", "jätemaksu", "kiinteistövero", "nuohous"]],
  ["Rakentaminen ja korjaus", ["takka", "suihkuseinä", "putki", "putken", "lämminvesivaraaja", "peltityö", "ruuvi", "betoni", "laasti", "ovi", "naulauslevy", "tiiviste", "runkotolppa", "sääskiverkko", "lauta", "puutavara"]],
  ["Kalusteet ja varusteet", ["jääkaappi", "palju", "sänky", "savustin", "kaappi", "hifi", "veitsi", "thermacell", "ötökkäverho", "puukko", "ikea", "juomasäilö", "avainkotelo", "kiuaskiv", "puutelista", "patja", "astia"]],
];

function guessCategory(description, entries = []) {
  const d = description.trim().toLowerCase();
  if (!d) return null;
  const same = entries.find((e) => e.description.toLowerCase() === d && !SPECIAL_CATEGORIES.includes(e.category));
  if (same) return same.category;
  for (const [cat, words] of CATEGORY_RULES) if (words.some((w) => d.includes(w))) return cat;
  return null;
}

// ---------- Muotoilu ----------
const eur = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR" });
const eur0 = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fmt = (n) => eur.format(n || 0);
const fmt0 = (n) => eur0.format(Math.round(n || 0));
const MONTHS = ["tammi", "helmi", "maalis", "huhti", "touko", "kesä", "heinä", "elo", "syys", "loka", "marras", "joulu"];
const fmtDate = (iso) => { const [y, m, d] = iso.split("-"); return `${+d}.${+m}.${y}`; };
const monthLabel = (ym) => { const [y, m] = ym.split("-"); return `${MONTHS[+m - 1]}kuu ${y}`; };
const monthShort = (ym) => { const [y, m] = ym.split("-"); return `${MONTHS[+m - 1].slice(0, 3)} ${y.slice(2)}`; };
const todayIso = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const catColor = (name) => cssVar((CATEGORIES.find((c) => c.name === name) || { color: "--c-other" }).color);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function parseAmount(str) {
  const n = Number(String(str).replace(/\s|€/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

// ---------- Paikallinen tallennus ----------
const store = {
  get(k) { try { return localStorage.getItem("paapeli." + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem("paapeli." + k, v); } catch { /* yksityinen ikkuna */ } },
  del(k) { try { localStorage.removeItem("paapeli." + k); } catch { /* ohitetaan */ } },
};

// ---------- API ----------
async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + (store.get("password") || ""),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    store.del("password");
    throw Object.assign(new Error("Salasana vanhentui tai on väärä. Kirjaudu uudelleen."), { auth: true });
  }
  if (!res.ok) throw new Error(data.error || `Palvelin vastasi ${res.status}`);
  return data;
}

const getEntries = () => api("/api/entries");
const createEntry = (e) => api("/api/entries", { method: "POST", body: JSON.stringify(e) });
const updateEntry = (id, e) => api(`/api/entries/${id}`, { method: "PUT", body: JSON.stringify(e) });
const deleteEntry = (id) => api(`/api/entries/${id}`, { method: "DELETE" });

// ---------- Kirjautuminen ja runko ----------
function currentUser() { return store.get("user"); }

function renderLogin(root, onDone) {
  root.innerHTML = `
    <form class="login wrap narrow" id="login-form">
      <h1>Paapelin kirjanpito</h1>
      <p>Kirjaudu yhteisellä salasanalla ja valitse kuka olet. Valinta muistetaan tällä laitteella.</p>
      <div class="field">
        <label class="label" for="login-pass">Salasana</label>
        <input class="input" id="login-pass" type="password" autocomplete="current-password" required>
      </div>
      <div class="field">
        <span class="label">Kuka olet?</span>
        <div class="chips" id="login-user">
          ${OWNERS.map((o) => `<button type="button" class="chip" data-user="${o}" aria-pressed="${currentUser() === o}">${o}</button>`).join("")}
        </div>
      </div>
      <p class="error-text" id="login-error"></p>
      <button class="btn primary" type="submit">Kirjaudu</button>
    </form>`;
  let user = currentUser();
  root.querySelector("#login-user").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-user]");
    if (!b) return;
    user = b.dataset.user;
    root.querySelectorAll("[data-user]").forEach((x) => x.setAttribute("aria-pressed", x === b));
  });
  root.querySelector("#login-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = root.querySelector("#login-error");
    if (!user) { err.textContent = "Valitse kuka olet."; return; }
    store.set("password", root.querySelector("#login-pass").value);
    store.set("user", user);
    try {
      const entries = await getEntries();
      onDone(entries);
    } catch (e) {
      err.textContent = e.auth ? "Väärä salasana." : e.message;
    }
  });
}

const ICONS = {
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
};

function renderShell(active) {
  const links = (cls) => `
    <nav class="nav ${cls}" aria-label="Sivut">
      <a href="./" ${active === "entry" ? 'aria-current="page"' : ""}>${ICONS.add}Syötä</a>
      <a href="./tilanne.html" ${active === "dash" ? 'aria-current="page"' : ""}>${ICONS.chart}Tilanne</a>
    </nav>`;
  const header = document.createElement("header");
  header.className = "wrap topbar";
  header.innerHTML = `
    <a class="brand" href="./"><b>Paapeli</b><span>mökin kirjanpito</span></a>
    ${links("topnav")}
    <button class="who" id="who" type="button" title="Vaihda käyttäjää">${esc(currentUser() || "")} · vaihda</button>`;
  document.body.prepend(header);
  const bottom = document.createElement("div");
  bottom.innerHTML = links("bottomnav");
  document.body.append(bottom.firstElementChild);
  header.querySelector("#who").addEventListener("click", () => {
    store.del("password");
    location.reload();
  });
}

let toastTimer;
function toast(msg, isError = false) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.append(el); }
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 6000 : 3000);
}

// Käynnistää sivun: näyttää kirjautumisen tarvittaessa ja kutsuu start(entries).
async function boot(active, start) {
  renderShell(active);
  const root = document.getElementById("app");
  if (!API) { root.innerHTML = '<p class="wrap empty">API-osoite puuttuu tiedostosta config.js.</p>'; return; }
  if (!store.get("password") || !currentUser()) { renderLogin(root, (e) => { location.reload(); }); return; }
  root.innerHTML = '<p class="loading">Ladataan kirjanpitoa…</p>';
  try {
    start(root, await getEntries());
  } catch (e) {
    if (e.auth) renderLogin(root, () => location.reload());
    else root.innerHTML = `<p class="wrap empty">Tietojen haku epäonnistui: ${esc(e.message)}</p>`;
  }
}

// ---------- Laskenta ----------

// Paljonko rivi on yhteistä kulua (euroina, positiivinen) – tilisiirrot ja tulot eivät ole kuluja.
function costOf(e) {
  if (e.kind === "shared") return e.amount;
  if (e.kind === "account" && e.amount < 0 && e.category !== "Pankki") return -e.amount;
  return 0;
}

// Henkilöiden saldot: oma panos (maksetut kulut + tilisiirrot) miinus kolmasosa yhteisistä
// nettokuluista. Saldojen summa on tilin saldo, joten tasatilanteessa saldot ovat yhtä suuret.
function balances(entries) {
  const paid = Object.fromEntries(OWNERS.map((o) => [o, { shared: 0, deposit: 0 }]));
  let sharedTotal = 0, accountNet = 0, income = 0, deposits = 0;
  for (const e of entries) {
    if (e.kind === "shared") { sharedTotal += e.amount; if (paid[e.payer]) paid[e.payer].shared += e.amount; }
    else if (e.kind === "deposit") { deposits += e.amount; if (paid[e.payer]) paid[e.payer].deposit += e.amount; }
    else if (e.kind === "account") accountNet += e.amount;
    else if (e.kind === "income") income += e.amount;
  }
  const groupCost = sharedTotal - accountNet - income;
  const share = groupCost / OWNERS.length;
  const people = OWNERS.map((o) => {
    const contributed = paid[o].shared + paid[o].deposit;
    return { name: o, ...paid[o], contributed, share, saldo: contributed - share };
  });
  const avg = people.reduce((s, p) => s + p.saldo, 0) / people.length;
  people.forEach((p) => { p.diff = p.saldo - avg; });
  return { people, accountBalance: deposits + accountNet + income, groupCost, sharedTotal, income };
}

function accountBalanceAt(entries, isoDate) {
  return entries.reduce((s, e) => (e.date <= isoDate && e.kind !== "shared" ? s + e.amount : s), 0);
}

function ymOf(iso) { return iso.slice(0, 7); }
function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
function monthRange(fromYm, toYm) {
  const out = [];
  for (let ym = fromYm; ym <= toYm; ym = addMonths(ym, 1)) out.push(ym);
  return out;
}
