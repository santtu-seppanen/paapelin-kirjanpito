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
      "X-User": encodeURIComponent(currentUser() || ""),
      ...(options.headers || {}),
    },
  });
  if (options.raw && res.ok) return res;
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
const getReceipts = (entryId) => api(`/api/entries/${entryId}/receipts`);
const addReceiptReason = (entryId, reason) => api(`/api/entries/${entryId}/receipts`, { method: "POST", body: JSON.stringify({ reason }) });
const uploadReceipt = (entryId, file) => api(`/api/entries/${entryId}/receipts`, {
  method: "POST", body: file, headers: { "Content-Type": file.type, "X-Filename": encodeURIComponent(file.name) },
});
const deleteReceipt = (id) => api(`/api/receipts/${id}`, { method: "DELETE" });
const getDocuments = () => api("/api/documents");
const uploadDocument = (file, title) => api("/api/documents", {
  method: "POST", body: file,
  headers: { "Content-Type": file.type, "X-Filename": encodeURIComponent(file.name), "X-Title": encodeURIComponent(title || "") },
});
const getSettings = () => api("/api/settings");
const saveSettings = (s) => api("/api/settings", { method: "PUT", body: JSON.stringify(s) });

// Tiedostot ovat salasanan takana, joten ne haetaan blobina ja avataan uuteen välilehteen.
// Ikkuna avataan heti klikkauksessa, jotta mobiiliselaimet eivät estä sitä ponnahdusikkunana.
async function openFile(path, download) {
  const win = download ? null : window.open("", "_blank");
  try {
    const res = await api(path, { raw: true, headers: { "Content-Type": "" } });
    const url = URL.createObjectURL(await res.blob());
    if (win) win.location.href = url;
    else {
      const name = decodeURIComponent((res.headers.get("Content-Disposition") || "").split("''")[1] || "tiedosto");
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    if (win) win.close();
    toast(e.message, true);
  }
}

// Kuvat pienennetään ennen lähetystä (D1:n rivikoko on rajattu). PDF:t lähetetään sellaisenaan.
async function prepareUpload(file) {
  const MAX = 1_900_000;
  if (!file.type.startsWith("image/") || (file.size < 700_000 && /jpeg|png|webp/.test(file.type))) {
    if (file.size > MAX) throw new Error("Tiedosto on liian suuri (enintään 1,9 Mt). Ota kuva kuitista tai pienennä PDF.");
    return file;
  }
  let bmp;
  try { bmp = await createImageBitmap(file); } catch {
    if (file.size > MAX) throw new Error("Kuvaa ei voitu pienentää tällä selaimella. Kokeile JPEG-kuvaa.");
    return file;
  }
  for (const [side, q] of [[2000, 0.82], [1600, 0.75], [1200, 0.7]]) {
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const c = Object.assign(document.createElement("canvas"), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= MAX) return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  }
  throw new Error("Kuva on liian suuri vielä pienennettynäkin.");
}

// ---------- Tositteet ----------
const RECEIPT_REASONS = [
  "Tilisiirto – näkyy tiliotteella",
  "Kuitti hukassa",
  "Ei saatu kuittia",
  "Lasku sähköpostissa",
  "Vanha kirjaus ennen järjestelmää",
];

// "Uusi aika": tätä vanhemmat kirjaukset on tasattu, eikä niihin tuoda tositteita.
// Pienhankintabudjetit lasketaan myös vasta tästä päivästä. Arvo tulee asetuksista.
const ERA_START_DEFAULT = "2026-10-15";
let ERA_START = ERA_START_DEFAULT;
function setEraStart(settings) { ERA_START = (settings && settings.eraStart) || ERA_START_DEFAULT; }

// Tila: "file" = kuitti tai lasku liitetty, "reason" = selitetty miksi ei ole,
// "legacy" = vanha tasattu kirjaus, "missing" = puuttuu.
function receiptState(e) {
  if (e.receipt_files > 0) return "file";
  if (e.receipt_reason) return "reason";
  if (e.date < ERA_START) return "legacy";
  return "missing";
}
const RECEIPT_BADGE = {
  file: '<span class="rcpt ok" title="Tosite liitetty">📎</span>',
  reason: '<span class="rcpt why" title="Selitetty miksi tositetta ei ole">✎</span>',
  missing: '<span class="rcpt miss" title="Tosite puuttuu">!</span>',
  legacy: "",
};

// Ponnahdusikkuna: liitä kuitti/lasku tai kirjoita selite. onChange(entry) saa päivitetyn rivin.
function openReceiptDialog(entry, onChange, { afterSave = false } = {}) {
  let dlg = document.getElementById("receipt-dialog");
  if (dlg) dlg.remove();
  dlg = document.createElement("dialog");
  dlg.id = "receipt-dialog";
  dlg.className = "modal";
  dlg.innerHTML = `
    <form method="dialog" class="modal-body">
      <div class="panel-head" style="margin:0">
        <h2>${afterSave ? "Lisää tosite" : "Tositteet"}</h2>
        <button class="linkbtn" value="close" aria-label="Sulje">Sulje</button>
      </div>
      <p class="muted small" style="margin:0">${esc(entry.description)} · ${fmt(entry.amount)} · ${fmtDate(entry.date)}</p>
      <ul class="rcpt-list" id="rcpt-list"><li class="muted small">Ladataan…</li></ul>

      <label class="dropzone" id="rcpt-drop">
        <input type="file" id="rcpt-file" accept="image/*,application/pdf" hidden>
        <span class="dz-icon" aria-hidden="true">📷</span>
        <span><b>Kuitti tai lasku</b><br><span class="small muted">Ota kuva tai valitse kuva / PDF</span></span>
      </label>

      <div class="or"><span>tai kerro miksi tositetta ei ole</span></div>
      <div class="chips" id="rcpt-reasons">
        ${RECEIPT_REASONS.map((r) => `<button type="button" class="chip" data-reason="${esc(r)}">${esc(r)}</button>`).join("")}
      </div>
      <div style="display:flex;gap:8px">
        <input class="input" id="rcpt-reason" maxlength="300" placeholder="Oma selite">
        <button type="button" class="btn" id="rcpt-save-reason">Tallenna</button>
      </div>
      <p class="error-text" id="rcpt-error" role="alert"></p>
      ${afterSave ? '<button class="btn ghost" value="later">Lisään myöhemmin</button>' : ""}
    </form>`;
  document.body.append(dlg);
  const $ = (s) => dlg.querySelector(s);
  const busy = (on) => dlg.querySelectorAll("button, input").forEach((b) => { if (b.value !== "close") b.disabled = on; });

  async function refresh() {
    try {
      const list = await getReceipts(entry.id);
      $("#rcpt-list").innerHTML = list.length ? list.map((r) => `
        <li>
          ${r.filename
            ? `<button type="button" class="linkbtn" data-open="${r.id}">📎 ${esc(r.filename)}</button><span class="small muted">${Math.round(r.size / 1024)} kt</span>`
            : `<span>✎ ${esc(r.reason)}</span><span></span>`}
          <span class="small muted">${esc(r.created_by || "")}</span>
          <button type="button" class="linkbtn danger" data-rdel="${r.id}">Poista</button>
        </li>`).join("") : '<li class="muted small">Ei vielä tositetta.</li>';
    } catch (e) { $("#rcpt-error").textContent = e.message; }
  }
  async function done(updated, msg) {
    Object.assign(entry, updated);
    onChange && onChange(entry);
    toast(msg);
    if (afterSave) dlg.close(); else refresh();
  }

  $("#rcpt-file").addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    $("#rcpt-error").textContent = "";
    busy(true);
    $("#rcpt-drop").classList.add("loading-dz");
    try {
      done(await uploadReceipt(entry.id, await prepareUpload(f)), "Tosite liitetty 📎");
    } catch (e) { $("#rcpt-error").textContent = e.message; }
    finally { busy(false); $("#rcpt-drop").classList.remove("loading-dz"); ev.target.value = ""; }
  });
  const saveReason = async (reason) => {
    if (!reason.trim()) { $("#rcpt-error").textContent = "Kirjoita selite tai valitse valmis vaihtoehto."; return; }
    busy(true);
    try { done(await addReceiptReason(entry.id, reason), "Selite tallennettu"); $("#rcpt-reason").value = ""; }
    catch (e) { $("#rcpt-error").textContent = e.message; }
    finally { busy(false); }
  };
  $("#rcpt-reasons").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-reason]");
    if (b) saveReason(b.dataset.reason);
  });
  $("#rcpt-save-reason").addEventListener("click", () => saveReason($("#rcpt-reason").value));
  $("#rcpt-reason").addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); saveReason(ev.target.value); } });
  $("#rcpt-list").addEventListener("click", async (ev) => {
    const o = ev.target.closest("[data-open]");
    const d = ev.target.closest("[data-rdel]");
    if (o) openFile(`/api/receipts/${o.dataset.open}`);
    if (d) {
      if (d.dataset.confirm !== "1") { d.dataset.confirm = "1"; d.textContent = "Vahvista"; return; }
      try { const upd = await deleteReceipt(d.dataset.rdel); Object.assign(entry, upd); onChange && onChange(entry); refresh(); }
      catch (e) { $("#rcpt-error").textContent = e.message; }
    }
  });
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", (ev) => { if (ev.target === dlg) dlg.close(); });
  dlg.showModal();
  refresh();
}

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
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
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

// ---------- Tilikausi 1.11.–31.10. ----------
// Tilikausi tunnistetaan alkuvuodesta: 2025 = 1.11.2025–31.10.2026.
function fyOf(iso) { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= 11 ? y : y - 1; }
function fyLabel(fy) { return `${fy}–${String(fy + 1).slice(2)}`; }
function fyStart(fy) { return `${fy}-11-01`; }
function fyEnd(fy) { return `${fy + 1}-10-31`; }
function fyMonths(fy) { return monthRange(`${fy}-11`, `${fy + 1}-10`); }
const currentFy = () => fyOf(todayIso());

// ---------- Kuluvastaava ----------
// Asetuksista voimassa oleva kuluvastaava; jos asetuksia ei ole, ehdotus talletusten perusteella.
function currentResponsible(settings, entries, asOf = todayIso()) {
  const list = (settings && settings.responsibles) || [];
  if (!list.length) {
    const since = addMonths(ymOf(asOf), -12);
    const dep = OWNERS.map((o) => [o, entries.filter((e) => e.payer === o && e.kind === "deposit" && ymOf(e.date) >= since && !/tasaus/i.test(e.description)).reduce((s, e) => s + e.amount, 0)]);
    dep.sort((a, b) => b[1] - a[1]);
    return { who: dep[0][0], from: fyStart(fyOf(asOf)), until: null, suggested: true, next: null };
  }
  const started = list.filter((r) => r.from <= asOf);
  const cur = started.length ? started[started.length - 1] : list[0];
  return { ...cur, suggested: false, next: list.find((r) => r.from > asOf) || null };
}

// ---------- Roolit ----------
// Jokainen osakas saa kulutuksensa perusteella yhden pääroolin (eri roolit kaikille) ja
// lisäksi merkit niistä lajeista, joissa hän johtaa.
const ROLES = [
  { id: "raksa", emoji: "🔨", title: "Raksaukko", desc: "rakennus- ja korjauskulut",
    score: (rows) => sumWhere(rows, (e) => e.kind === "shared" && e.category === "Rakentaminen ja korjaus"), unit: "eur" },
  { id: "puuha", emoji: "🛠️", title: "Puuhapete", desc: "eniten hankintoja kappalemäärällä",
    score: (rows) => rows.filter((e) => e.kind === "shared").length, unit: "kpl" },
  { id: "tarkka", emoji: "🧮", title: "Tarkan markan pitäjä", desc: "edullisin keskihankinta",
    score: (rows) => { const a = rows.filter((e) => e.kind === "shared").map((e) => e.amount).sort((x, y) => x - y);
      return a.length >= 3 ? 1000 / a[Math.floor(a.length / 2)] : 0; },
    show: (rows) => { const a = rows.filter((e) => e.kind === "shared").map((e) => e.amount).sort((x, y) => x - y);
      return a.length ? `mediaanihankinta ${fmt(a[Math.floor(a.length / 2)])}` : ""; } },
  { id: "pankki", emoji: "🏦", title: "Tilinvartija", desc: "eniten talletuksia yhteiselle tilille",
    score: (rows) => sumWhere(rows, (e) => e.kind === "deposit" && !/tasaus/i.test(e.description)), unit: "eur" },
  { id: "sisustus", emoji: "🛋️", title: "Mukavuusministeri", desc: "kalusteet ja varusteet",
    score: (rows) => sumWhere(rows, (e) => e.kind === "shared" && e.category === "Kalusteet ja varusteet"), unit: "eur" },
  { id: "maalari", emoji: "🖌️", title: "Pensselisankari", desc: "maalaushankinnat",
    score: (rows) => sumWhere(rows, (e) => e.kind === "shared" && e.category === "Maalaus"), unit: "eur" },
  { id: "piha", emoji: "🌲", title: "Rantaherra", desc: "piha ja ranta",
    score: (rows) => sumWhere(rows, (e) => e.kind === "shared" && e.category === "Piha ja ranta"), unit: "eur" },
  { id: "sahko", emoji: "⚡", title: "Sähkövelho", desc: "sähkötyöt",
    score: (rows) => sumWhere(rows, (e) => e.kind === "shared" && e.category === "Sähkötyöt"), unit: "eur" },
  { id: "iso", emoji: "🏗️", title: "Suurten linjojen visionääri", desc: "suurin yksittäinen hankinta",
    score: (rows) => Math.max(0, ...rows.filter((e) => e.kind === "shared").map((e) => e.amount)), unit: "eur" },
  { id: "kuitti", emoji: "🧾", title: "Kuittikuningas", desc: "eniten tositteita liitettynä", byCreator: true,
    score: (rows) => rows.filter((e) => e.receipt_files > 0).length, unit: "kpl" },
  { id: "vuokra", emoji: "🔑", title: "Vuokraisäntä", desc: "hoitanut vuokrauksia", byCreator: true,
    score: (rows) => sumWhere(rows, (e) => e.kind === "income"), unit: "eur" },
];
function sumWhere(rows, pred) { return rows.reduce((s, e) => (pred(e) ? s + e.amount : s), 0); }

function computeRoles(entries) {
  const rowsOf = (o, byCreator) => entries.filter((e) => (byCreator ? e.created_by === o : e.payer === o));
  const table = ROLES.map((r) => {
    const vals = OWNERS.map((o) => r.score(rowsOf(o, r.byCreator)));
    const total = vals.reduce((s, v) => s + v, 0);
    return { role: r, vals, total };
  });
  // Ahne jako: suurin osuus ensin, jokainen rooli ja osakas vain kerran.
  const cands = [];
  table.forEach((t) => t.vals.forEach((v, i) => { if (v > 0) cands.push({ t, i, share: v / t.total }); }));
  cands.sort((a, b) => b.share - a.share || b.t.total - a.t.total);
  const primary = {}, used = new Set();
  for (const c of cands) {
    const o = OWNERS[c.i];
    if (primary[o] || used.has(c.t.role.id)) continue;
    primary[o] = c; used.add(c.t.role.id);
  }
  return OWNERS.map((o, i) => {
    const p = primary[o];
    const describe = (t) => {
      const rows = rowsOf(o, t.role.byCreator);
      if (t.role.show) return t.role.show(rows);
      return t.role.unit === "eur" ? fmt0(t.vals[i]) : `${Math.round(t.vals[i])} kpl`;
    };
    const badges = table.filter((t) => t.vals[i] > 0 && t.vals[i] === Math.max(...t.vals) && (!p || t !== p.t))
      .map((t) => ({ ...t.role, detail: describe(t) }));
    return {
      name: o,
      role: p ? { ...p.t.role, share: p.share, detail: describe(p.t) } : { emoji: "🌱", title: "Tuleva legenda", desc: "ei vielä kirjauksia" },
      badges,
    };
  });
}
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
