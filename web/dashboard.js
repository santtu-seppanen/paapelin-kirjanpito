// Tilanne-sivu: saldot, kulut kululajeittain ja ajassa, ennusteet ja tapahtumalista.

const RECURRING = CATEGORIES.filter((c) => c.recurring).map((c) => c.name);

boot("dash", (root, entries) => {
  const years = [...new Set(entries.map((e) => e.date.slice(0, 4)))].sort().reverse();
  const thisYear = todayIso().slice(0, 4);
  const filter = {
    year: store.get("dash.year") || "all",
    person: store.get("dash.person") || "all",
    search: "",
    category: "all",
    kind: "all",
    sort: { key: "date", dir: -1 },
  };
  if (filter.year !== "all" && !years.includes(filter.year)) filter.year = "all";
  const charts = {};

  root.innerHTML = `
    <div class="wrap">
      <div class="filters" role="group" aria-label="Rajaukset">
        <div class="field">
          <label class="label" for="f-year">Vuosi</label>
          <select class="input" id="f-year">
            <option value="all">Kaikki vuodet</option>
            ${years.map((y) => `<option value="${y}">${y}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="label" for="f-person">Henkilö</label>
          <select class="input" id="f-person">
            <option value="all">Kaikki</option>
            ${OWNERS.map((o) => `<option value="${o}">${o}</option>`).join("")}
          </select>
        </div>
        <span class="small muted">Saldot ja tilin tilanne lasketaan aina koko historiasta.</span>
      </div>

      <div class="grid">
        <div class="span-12 kpis" id="kpis"></div>

        <section class="panel span-5">
          <div class="panel-head"><h2>Saldot</h2><span class="small muted">vs. tasaosuus</span></div>
          <div class="balances" id="balances"></div>
          <div class="table-scroll" style="margin-top:16px">
            <table id="balance-table"></table>
          </div>
          <p class="settle" id="settle"></p>
        </section>

        <section class="panel span-7">
          <div class="panel-head"><h2>Kulut kuukausittain</h2><span class="small muted" id="monthly-sub"></span></div>
          <div class="chart-box tall"><canvas id="ch-monthly" aria-label="Kulut kuukausittain kululajeittain"></canvas></div>
        </section>

        <section class="panel span-5">
          <div class="panel-head"><h2>Kululajit</h2><span class="small muted" id="cat-sub"></span></div>
          <div class="chart-box" id="cat-box"><canvas id="ch-cat" aria-label="Kulut kululajeittain"></canvas></div>
        </section>

        <section class="panel span-7">
          <div class="panel-head"><h2>Kuka on maksanut</h2><span class="small muted">kulut ja tilisiirrot vuosittain</span></div>
          <div class="chart-box"><canvas id="ch-people" aria-label="Henkilöiden maksut vuosittain"></canvas></div>
        </section>

        <section class="panel span-7">
          <div class="panel-head"><h2>Tilin ennuste</h2><span class="small muted">12 kk eteenpäin</span></div>
          <div class="chart-box"><canvas id="ch-forecast" aria-label="Tilin saldo ja ennuste"></canvas></div>
          <p class="small muted" id="forecast-note" style="margin:12px 0 0"></p>
        </section>

        <section class="panel span-5">
          <div class="panel-head"><h2>Kustannusennuste</h2><span class="small muted">seuraavat 12 kk</span></div>
          <div class="table-scroll"><table class="forecast-table" id="forecast-table"></table></div>
          <p class="small muted" style="margin:12px 0 0">Kiinteät kulut arvioidaan edellisen vuoden samojen kuukausien mukaan, hankinnat viimeisen 12 kuukauden keskiarvona.</p>
        </section>

        <section class="panel span-5">
          <div class="panel-head"><h2>Tehdyt hankinnat</h2><span class="small muted" id="tl-sub"></span></div>
          <div class="timeline" id="timeline"></div>
        </section>

        <section class="panel span-7" id="tapahtumat">
          <div class="panel-head">
            <h2>Tapahtumat</h2>
            <span class="small muted" id="tx-sub"></span>
          </div>
          <div class="filters" style="margin-bottom:10px">
            <input class="input" id="tx-search" type="search" placeholder="Hae kuvauksesta" style="flex:1;min-width:160px;max-width:320px">
            <select class="input" id="tx-cat" style="width:auto">
              <option value="all">Kaikki kululajit</option>
              ${[...CATEGORIES.map((c) => c.name), ...SPECIAL_CATEGORIES].map((c) => `<option>${esc(c)}</option>`).join("")}
            </select>
            <select class="input" id="tx-kind" style="width:auto">
              <option value="all">Kaikki tyypit</option>
              ${Object.entries(KIND_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
            </select>
          </div>
          <div class="table-scroll" style="max-height:620px;overflow-y:auto"><table id="tx-table"></table></div>
        </section>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  $("#f-year").value = filter.year;
  $("#f-person").value = filter.person;

  // ---------- Rajaukset ----------
  const inYear = (e) => filter.year === "all" || e.date.startsWith(filter.year);
  const byPerson = (e) => filter.person === "all" || e.payer === filter.person;
  const periodLabel = () => (filter.year === "all" ? "kaikki vuodet" : filter.year);

  // ---------- KPI:t ----------
  function renderKpis() {
    const b = balances(entries);
    const period = entries.filter((e) => inYear(e) && byPerson(e));
    const costs = period.reduce((s, e) => s + costOf(e), 0);
    const nCost = period.filter((e) => costOf(e) > 0).length;
    const fc = forecast();
    const ytd = entries.filter((e) => e.date.startsWith(thisYear)).reduce((s, e) => s + costOf(e), 0);
    const restMonths = fc.months.filter((m) => m.ym.startsWith(thisYear));
    const yearEnd = ytd + restMonths.reduce((s, m) => s + m.total, 0);
    $("#kpis").innerHTML = `
      <div class="kpi accent"><span class="label">Tilin saldo</span><span class="value">${fmt(b.accountBalance)}</span><span class="sub">yhteinen tili, ${fmtDate(todayIso())}</span></div>
      <div class="kpi"><span class="label">Kulut, ${periodLabel()}${filter.person !== "all" ? " · " + filter.person : ""}</span><span class="value">${fmt0(costs)}</span><span class="sub">${nCost} kulua</span></div>
      <div class="kpi"><span class="label">Kiinteät kulut / kk</span><span class="value">${fmt0(fc.recurringMonthly)}</span><span class="sub">sähkö, vesi ja maksut, 12 kk ka.</span></div>
      <div class="kpi"><span class="label">Ennuste ${thisYear}</span><span class="value">${fmt0(yearEnd)}</span><span class="sub">toteutunut ${fmt0(ytd)} + arvio loppuvuodelle</span></div>`;
  }

  // ---------- Saldot ----------
  function renderBalances() {
    const b = balances(entries);
    const maxAbs = Math.max(20, ...b.people.map((p) => Math.abs(p.diff)));
    $("#balances").innerHTML = b.people.map((p) => {
      const w = (Math.abs(p.diff) / maxAbs) * 50;
      const left = p.diff >= 0 ? 50 : 50 - w;
      return `<div class="balance-row">
        <span class="name"><span class="dot" style="width:10px;height:10px;border-radius:50%;background:var(${OWNER_COLORS[p.name]})"></span>${p.name}</span>
        <div class="balance-bar" title="${p.name}: ${fmt(p.diff)} tasaosuuteen nähden">
          <div class="mid"></div>
          <div class="fill" style="left:${left}%;width:${Math.max(w, 0.6)}%;background:var(${OWNER_COLORS[p.name]})"></div>
        </div>
        <span class="num ${p.diff >= 0.005 ? "pos" : p.diff <= -0.005 ? "neg" : ""}">${p.diff >= 0 ? "+" : ""}${fmt(p.diff)}</span>
      </div>`;
    }).join("");
    $("#balance-table").innerHTML = `
      <thead><tr><th></th><th class="r">Kulut</th><th class="r">Tilille</th><th class="r">Osuus</th><th class="r">Saldo</th></tr></thead>
      <tbody>${b.people.map((p) => `<tr><td><b>${p.name}</b></td><td class="r">${fmt0(p.shared)}</td><td class="r">${fmt0(p.deposit)}</td><td class="r">${fmt0(p.share)}</td><td class="r">${fmt(p.saldo)}</td></tr>`).join("")}</tbody>`;
    const top = Math.max(...b.people.map((p) => p.saldo));
    const payers = b.people.filter((p) => top - p.saldo >= 5);
    $("#settle").innerHTML = (payers.length
      ? `Tasaus tilisiirroilla: ${payers.map((p) => `<b>${p.name}</b> ${fmt(top - p.saldo)}`).join(", ")}. `
      : "Saldot ovat tasan, tasausta ei tarvita. ") +
      `<span class="muted">Saldo = omat kulut ja tilisiirrot − kolmasosa yhteisistä nettokuluista. Saldojen summa on tilin saldo.</span>`;
  }

  // ---------- Kuukausikaavio ----------
  function monthsForPeriod() {
    const now = ymOf(todayIso());
    if (filter.year !== "all") return monthRange(`${filter.year}-01`, filter.year === thisYear ? now : `${filter.year}-12`);
    const first = entries.reduce((m, e) => (e.date < m ? e.date : m), todayIso());
    return monthRange(ymOf(first), now);
  }

  function renderMonthly() {
    const months = monthsForPeriod();
    const rows = entries.filter((e) => inYear(e) && byPerson(e) && costOf(e) > 0);
    const used = CATEGORIES.filter((c) => rows.some((e) => e.category === c.name));
    const datasets = used.map((c) => ({
      label: c.name,
      data: months.map((m) => round2(rows.filter((e) => ymOf(e.date) === m && e.category === c.name).reduce((s, e) => s + costOf(e), 0))),
      backgroundColor: cssVar(c.color),
      borderColor: cssVar("--surface"),
      borderWidth: { top: 2, bottom: 0, left: 0, right: 0 },
      borderRadius: 3,
      borderSkipped: "bottom",
      maxBarThickness: 28,
      stack: "s",
    }));
    $("#monthly-sub").textContent = `${periodLabel()}${filter.person !== "all" ? " · " + filter.person : ""}`;
    draw("monthly", "ch-monthly", {
      type: "bar",
      data: { labels: months.map(monthShort), datasets },
      options: {
        ...baseOptions(),
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
          y: { stacked: true, ticks: { callback: (v) => fmt0(v) } },
        },
        plugins: {
          ...baseOptions().plugins,
          legend: { position: "bottom", labels: legendLabels() },
          tooltip: { ...tooltipBase(), mode: "index", filter: (i) => i.raw > 0,
            callbacks: { label: (i) => ` ${i.dataset.label}: ${fmt(i.raw)}`,
              footer: (items) => `Yhteensä ${fmt(items.reduce((s, i) => s + i.raw, 0))}` } },
        },
      },
    });
  }

  // ---------- Kululajit ----------
  function renderCategories() {
    const rows = entries.filter((e) => inYear(e) && byPerson(e) && costOf(e) > 0);
    const totals = CATEGORIES.map((c) => ({ ...c, total: round2(rows.filter((e) => e.category === c.name).reduce((s, e) => s + costOf(e), 0)) }))
      .filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
    const sum = totals.reduce((s, c) => s + c.total, 0);
    $("#cat-sub").textContent = `${fmt0(sum)} yhteensä`;
    $("#cat-box").style.height = `${Math.max(180, totals.length * 34 + 30)}px`;
    draw("cat", "ch-cat", {
      type: "bar",
      data: {
        labels: totals.map((c) => c.name),
        datasets: [{ data: totals.map((c) => c.total), backgroundColor: totals.map((c) => cssVar(c.color)), borderRadius: 4, borderSkipped: "start", maxBarThickness: 20 }],
      },
      options: {
        ...baseOptions(),
        indexAxis: "y",
        scales: {
          x: { ticks: { callback: (v) => fmt0(v) } },
          y: { grid: { display: false }, ticks: { color: cssVar("--ink-2") } },
        },
        plugins: {
          ...baseOptions().plugins,
          legend: { display: false },
          tooltip: { ...tooltipBase(), callbacks: { label: (i) => ` ${fmt(i.raw)} (${Math.round((i.raw / sum) * 100)} %)` } },
        },
        onClick: (_, els) => {
          if (!els.length) return;
          filter.category = totals[els[0].index].name;
          $("#tx-cat").value = filter.category;
          renderTable();
          $("#tapahtumat").scrollIntoView({ behavior: "smooth" });
        },
      },
    });
  }

  // ---------- Henkilöt ----------
  function renderPeople() {
    const ys = [...years].reverse().filter((y) => filter.year === "all" || y === filter.year);
    const datasets = [];
    for (const o of OWNERS) {
      if (filter.person !== "all" && filter.person !== o) continue;
      datasets.push({
        label: `${o}`,
        data: ys.map((y) => round2(entries.filter((e) => e.payer === o && e.date.startsWith(y) && (e.kind === "shared" || e.kind === "deposit")).reduce((s, e) => s + e.amount, 0))),
        backgroundColor: cssVar(OWNER_COLORS[o]),
        borderRadius: 4, borderSkipped: "bottom", maxBarThickness: 36,
        borderColor: cssVar("--surface"), borderWidth: { left: 1, right: 1, top: 0, bottom: 0 },
      });
    }
    draw("people", "ch-people", {
      type: "bar",
      data: { labels: ys, datasets },
      options: {
        ...baseOptions(),
        scales: { x: { grid: { display: false } }, y: { ticks: { callback: (v) => fmt0(v) } } },
        plugins: {
          ...baseOptions().plugins,
          legend: { position: "bottom", labels: legendLabels() },
          tooltip: { ...tooltipBase(), callbacks: {
            label: (i) => {
              const o = i.dataset.label, y = i.label;
              const rows = entries.filter((e) => e.payer === o && e.date.startsWith(y));
              const sh = rows.filter((e) => e.kind === "shared").reduce((s, e) => s + e.amount, 0);
              const dep = rows.filter((e) => e.kind === "deposit").reduce((s, e) => s + e.amount, 0);
              return ` ${o}: ${fmt(i.raw)} (kulut ${fmt0(sh)}, tilille ${fmt0(dep)})`;
            } } },
        },
      },
    });
  }

  // ---------- Ennuste ----------
  // Kiinteät kulut: sama kuukausi vuotta aiemmin, tai 12 kk keskiarvo jos tietoa ei ole.
  // Hankinnat: viimeisen 12 kk keskiarvo. Tilin talletukset ja tulot: 12 kk keskiarvo.
  function forecast() {
    const now = ymOf(todayIso());
    const last12 = monthRange(addMonths(now, -12), addMonths(now, -1));
    const inLast12 = (e) => last12.includes(ymOf(e.date));
    const sumBy = (pred) => entries.filter(pred).reduce((s, e) => s + costOf(e), 0);

    const recurring = RECURRING.map((cat) => {
      const avg = sumBy((e) => e.category === cat && inLast12(e)) / 12;
      return { cat, avg, byMonth: (ym) => {
        const prev = addMonths(ym, -12);
        const had = entries.some((e) => e.category === cat && ymOf(e.date) <= prev);
        return had ? sumBy((e) => e.category === cat && ymOf(e.date) === prev) : avg;
      } };
    });
    const oneOffAvg = sumBy((e) => !RECURRING.includes(e.category) && inLast12(e)) / 12;
    const depositAvg = entries.filter((e) => inLast12(e) && e.kind === "deposit" && !/tasaus/i.test(e.description)).reduce((s, e) => s + e.amount, 0) / 12;
    const incomeAvg = entries.filter((e) => inLast12(e) && (e.kind === "income" || (e.kind === "account" && e.amount > 0))).reduce((s, e) => s + e.amount, 0) / 12;
    // Tililtä maksettavat kiinteät kulut (sähkö ja vesi tulevat tililtä).
    const accountRecurring = (ym) => {
      const prev = addMonths(ym, -12);
      return entries.filter((e) => e.kind === "account" && e.amount < 0 && RECURRING.includes(e.category) && ymOf(e.date) === prev).reduce((s, e) => s - e.amount, 0);
    };

    const months = monthRange(addMonths(now, 1), addMonths(now, 12)).map((ym) => {
      const parts = Object.fromEntries(recurring.map((r) => [r.cat, r.byMonth(ym)]));
      const rec = Object.values(parts).reduce((s, v) => s + v, 0);
      return { ym, parts, recurring: rec, oneOff: oneOffAvg, total: rec + oneOffAvg, accountOut: accountRecurring(ym) };
    });
    const recurringMonthly = recurring.reduce((s, r) => s + r.avg, 0);
    return { months, recurring, oneOffAvg, depositAvg, incomeAvg, recurringMonthly };
  }

  function renderForecast() {
    const fc = forecast();
    const now = ymOf(todayIso());
    const histMonths = monthRange(addMonths(now, -23), now);
    const endOf = (ym) => `${ym}-31`;
    const hist = histMonths.map((m) => round2(accountBalanceAt(entries, endOf(m))));
    let withDep = hist[hist.length - 1], noDep = withDep;
    const projWith = [], projNo = [];
    for (const m of fc.months) {
      withDep += fc.depositAvg + fc.incomeAvg - m.accountOut;
      noDep += fc.incomeAvg - m.accountOut;
      projWith.push(round2(withDep));
      projNo.push(round2(noDep));
    }
    const labels = [...histMonths, ...fc.months.map((m) => m.ym)].map(monthShort);
    const pad = (arr, before) => [...Array(before).fill(null), ...arr];
    const lastIdx = hist.length - 1;
    const c1 = cssVar("--c1"), c2 = cssVar("--c2");
    draw("forecast", "ch-forecast", {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Toteutunut saldo", data: hist, borderColor: c1, backgroundColor: c1 + "22", fill: "origin", borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: 0.25 },
          { label: `Ennuste, talletukset ${fmt0(fc.depositAvg)}/kk`, data: pad([hist[lastIdx], ...projWith], lastIdx), borderColor: c1, borderDash: [6, 4], borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: 0.25 },
          { label: "Ennuste ilman talletuksia", data: pad([hist[lastIdx], ...projNo], lastIdx), borderColor: c2, borderDash: [6, 4], borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: 0.25 },
        ],
      },
      options: {
        ...baseOptions(),
        interaction: { mode: "index", intersect: false },
        scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14 } }, y: { ticks: { callback: (v) => fmt0(v) } } },
        plugins: {
          ...baseOptions().plugins,
          legend: { position: "bottom", labels: legendLabels() },
          tooltip: { ...tooltipBase(), filter: (i) => i.raw !== null, callbacks: { label: (i) => ` ${i.dataset.label}: ${fmt(i.raw)}` } },
        },
      },
    });
    const monthlyOut = fc.months.reduce((s, m) => s + m.accountOut, 0) / 12;
    const bal = hist[lastIdx];
    const runway = monthlyOut - fc.incomeAvg > 0 ? Math.floor(bal / (monthlyOut - fc.incomeAvg)) : null;
    $("#forecast-note").textContent =
      `Tililtä menee kiinteisiin kuluihin noin ${fmt0(monthlyOut)} kuukaudessa. ` +
      (runway !== null ? `Nykyinen saldo riittää noin ${runway} kuukaudeksi ilman uusia talletuksia. ` : "") +
      `Talletuksia on tullut viimeisen vuoden aikana keskimäärin ${fmt0(fc.depositAvg)} kuukaudessa (ilmalämpöpumpun tasaussiirrot pois lukien).`;

    const rowsHtml = fc.recurring.map((r) => {
      const total = fc.months.reduce((s, m) => s + m.parts[r.cat], 0);
      return `<tr><td><span class="dot" style="width:9px;height:9px;border-radius:50%;background:${catColor(r.cat)}"></span>${esc(r.cat)}</td><td class="r">${fmt0(total / 12)}</td><td class="r">${fmt0(total)}</td></tr>`;
    }).join("");
    const recTotal = fc.months.reduce((s, m) => s + m.recurring, 0);
    $("#forecast-table").innerHTML = `
      <thead><tr><th>Kululaji</th><th class="r">/ kk</th><th class="r">12 kk</th></tr></thead>
      <tbody>
        ${rowsHtml}
        <tr><td><b>Kiinteät yhteensä</b></td><td class="r"><b>${fmt0(recTotal / 12)}</b></td><td class="r"><b>${fmt0(recTotal)}</b></td></tr>
        <tr><td><span class="dot" style="width:9px;height:9px;border-radius:50%;background:${cssVar("--c-other")}"></span>Hankinnat ja remontit</td><td class="r">${fmt0(fc.oneOffAvg)}</td><td class="r">${fmt0(fc.oneOffAvg * 12)}</td></tr>
        <tr><td><b>Kaikki yhteensä</b></td><td class="r"><b>${fmt0(recTotal / 12 + fc.oneOffAvg)}</b></td><td class="r"><b>${fmt0(recTotal + fc.oneOffAvg * 12)}</b></td></tr>
        <tr><td class="muted">Per osakas</td><td class="r muted">${fmt0((recTotal / 12 + fc.oneOffAvg) / 3)}</td><td class="r muted">${fmt0((recTotal + fc.oneOffAvg * 12) / 3)}</td></tr>
      </tbody>`;
  }

  // ---------- Aikajana ----------
  function renderTimeline() {
    const rows = entries
      .filter((e) => inYear(e) && byPerson(e) && costOf(e) > 0 && !RECURRING.includes(e.category))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    $("#tl-sub").textContent = `${rows.length} kpl, ${fmt0(rows.reduce((s, e) => s + costOf(e), 0))}`;
    if (!rows.length) { $("#timeline").innerHTML = '<p class="empty">Ei hankintoja valitulla rajauksella.</p>'; return; }
    const groups = new Map();
    for (const e of rows) {
      const k = ymOf(e.date);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    $("#timeline").innerHTML = [...groups].map(([ym, list]) => `
      <div class="month">
        <h3>${monthLabel(ym)} <span class="muted small" style="font-family:var(--font-body);font-weight:400">· ${fmt0(list.reduce((s, e) => s + costOf(e), 0))}</span></h3>
        ${list.map((e) => `<div class="tl-item">
          <span class="dot" style="background:${catColor(e.category)}" title="${esc(e.category)}"></span>
          <span class="what">${esc(e.description)} <span class="muted small">· ${e.kind === "account" ? "tililtä" : esc(e.payer)} · ${+e.date.slice(8)}.${+e.date.slice(5, 7)}.</span></span>
          <span class="num">${fmt(costOf(e))}</span>
        </div>`).join("")}
      </div>`).join("");
  }

  // ---------- Tapahtumataulukko ----------
  function renderTable() {
    const q = filter.search.toLowerCase();
    const rows = entries.filter((e) =>
      inYear(e) && byPerson(e) &&
      (filter.category === "all" || e.category === filter.category) &&
      (filter.kind === "all" || e.kind === filter.kind) &&
      (!q || e.description.toLowerCase().includes(q) || (e.note || "").toLowerCase().includes(q)));
    const { key, dir } = filter.sort;
    rows.sort((a, b) => {
      const va = a[key], vb = b[key];
      const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "fi");
      return c * dir || (b.id - a.id);
    });
    const total = rows.reduce((s, e) => s + costOf(e), 0);
    $("#tx-sub").textContent = `${rows.length} riviä · kuluja ${fmt0(total)}`;
    const th = (k, label, cls = "") => {
      const arrow = key === k ? (dir > 0 ? " ↑" : " ↓") : "";
      return `<th class="${cls}" aria-sort="${key === k ? (dir > 0 ? "ascending" : "descending") : "none"}"><button type="button" data-sort="${k}">${label}${arrow}</button></th>`;
    };
    $("#tx-table").innerHTML = `
      <thead><tr>${th("date", "Päivä")}${th("description", "Kuvaus")}${th("category", "Kululaji")}${th("payer", "Maksaja")}${th("amount", "Summa", "r")}<th></th></tr></thead>
      <tbody>${rows.length ? rows.map((e) => `
        <tr>
          <td class="num" style="white-space:nowrap">${fmtDate(e.date)}</td>
          <td class="desc">${esc(e.description)}${e.note ? `<div class="small muted">${esc(e.note)}</div>` : ""}</td>
          <td><span class="pill" style="box-shadow:inset 3px 0 0 ${catColor(e.category)}">${esc(e.category)}</span></td>
          <td>${esc(e.payer)}<div class="small muted">${KIND_LABELS[e.kind]}</div></td>
          <td class="r ${e.amount < 0 ? "neg" : ""}">${fmt(e.amount)}</td>
          <td><a class="small" href="./?edit=${e.id}">Muokkaa</a></td>
        </tr>`).join("") : '<tr><td colspan="6" class="empty">Ei rivejä valituilla rajauksilla.</td></tr>'}</tbody>`;
  }

  // ---------- Kaavioiden yhteiset asetukset ----------
  function baseOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 300 },
      plugins: { tooltip: tooltipBase() },
    };
  }
  function tooltipBase() {
    return {
      backgroundColor: cssVar("--ink"), titleColor: cssVar("--bg"), bodyColor: cssVar("--bg"), footerColor: cssVar("--bg"),
      padding: 10, cornerRadius: 8, boxPadding: 4, usePointStyle: true,
    };
  }
  function legendLabels() {
    return { usePointStyle: true, pointStyle: "rectRounded", boxWidth: 10, boxHeight: 10, padding: 14, color: cssVar("--ink-2") };
  }
  function applyChartTheme() {
    Chart.defaults.font.family = cssVar("--font-body");
    Chart.defaults.font.size = 12;
    Chart.defaults.color = cssVar("--muted");
    Chart.defaults.borderColor = cssVar("--grid");
    Chart.defaults.scale.grid.color = cssVar("--grid");
  }
  function draw(key, canvasId, config) {
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart(document.getElementById(canvasId), config);
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  function renderAll() {
    applyChartTheme();
    renderKpis();
    renderBalances();
    renderMonthly();
    renderCategories();
    renderPeople();
    renderForecast();
    renderTimeline();
    renderTable();
  }

  // ---------- Tapahtumat ----------
  $("#f-year").addEventListener("change", (e) => { filter.year = e.target.value; store.set("dash.year", filter.year); renderAll(); });
  $("#f-person").addEventListener("change", (e) => { filter.person = e.target.value; store.set("dash.person", filter.person); renderAll(); });
  $("#tx-search").addEventListener("input", (e) => { filter.search = e.target.value; renderTable(); });
  $("#tx-cat").addEventListener("change", (e) => { filter.category = e.target.value; renderTable(); });
  $("#tx-kind").addEventListener("change", (e) => { filter.kind = e.target.value; renderTable(); });
  $("#tx-table").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sort]");
    if (!b) return;
    const k = b.dataset.sort;
    filter.sort = filter.sort.key === k ? { key: k, dir: -filter.sort.dir } : { key: k, dir: k === "date" || k === "amount" ? -1 : 1 };
    renderTable();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderAll);

  renderAll();
  if (location.hash === "#tapahtumat") setTimeout(() => $("#tapahtumat").scrollIntoView(), 50);
});
