// Tilanne-sivu: saldot, kulut kululajeittain ja ajassa, ennusteet ja tapahtumalista.

const RECURRING = CATEGORIES.filter((c) => c.recurring).map((c) => c.name);

boot("dash", async (root, entries) => {
  const fys = [...new Set(entries.map((e) => fyOf(e.date)))].sort((a, b) => b - a);
  const nowFy = currentFy();
  if (!fys.includes(nowFy)) fys.unshift(nowFy);
  const params = new URLSearchParams(location.search);
  const filter = {
    fy: store.get("dash.fy") || "all",
    person: store.get("dash.person") || "all",
    search: "",
    category: "all",
    kind: "all",
    receipt: params.get("tositteet") === "puuttuu" ? "missing" : "all",
    sort: { key: "date", dir: -1 },
  };
  if (filter.fy !== "all" && !fys.includes(+filter.fy)) filter.fy = "all";
  const charts = {};
  let settings = {};
  try { settings = await getSettings(); } catch { /* sopimusnäkymä käyttää oletuksia */ }
  setEraStart(settings);

  const TABS = [
    { id: "yleiskuva", label: "Yleiskuva" },
    { id: "osakkaat", label: "Osakkaat" },
    { id: "tilikaudet", label: "Tilikaudet" },
    { id: "sopimus", label: "Sopimus" },
    { id: "tapahtumat", label: "Tapahtumat" },
  ];
  const hashTab = () => { const h = location.hash.slice(1); return h === "roolit" ? "yleiskuva" : TABS.some((t) => t.id === h) ? h : null; };
  let tab = hashTab() || store.get("dash.tab") || "yleiskuva";
  if (!TABS.some((t) => t.id === tab)) tab = "yleiskuva";

  root.innerHTML = `
    <div class="wrap">
      <nav class="tabs" role="tablist" aria-label="Näkymät">
        ${TABS.map((t) => `<button type="button" role="tab" data-tab="${t.id}" id="tab-${t.id}" aria-controls="view-${t.id}">${t.label}</button>`).join("")}
      </nav>
      <div class="filters" role="group" aria-label="Rajaukset">
        <div class="field">
          <label class="label" for="f-fy">Tilikausi</label>
          <select class="input" id="f-fy">
            <option value="all">Kaikki tilikaudet</option>
            ${fys.map((y) => `<option value="${y}">${fyLabel(y)}${y === nowFy ? " (kuluva)" : ""}</option>`).join("")}
          </select>
        </div>
        <div class="field" id="f-person-field">
          <label class="label" for="f-person">Henkilö</label>
          <select class="input" id="f-person">
            <option value="all">Kaikki</option>
            ${OWNERS.map((o) => `<option value="${o}">${o}</option>`).join("")}
          </select>
        </div>
        <span class="small muted">Tilikausi 1.11.–31.10. Saldot lasketaan aina koko historiasta.</span>
      </div>

      <div class="grid view" id="view-yleiskuva" role="tabpanel" aria-labelledby="tab-yleiskuva">
        <section class="panel span-12" id="roolit">
          <div class="panel-head"><h2>Mökkiporukan roolit</h2><span class="small muted" id="roles-sub"></span></div>
          <div class="roles" id="roles"></div>
        </section>

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
          <div class="panel-head"><h2>Kuka on maksanut</h2><span class="small muted">kulut ja tilisiirrot tilikausittain</span></div>
          <div class="chart-box"><canvas id="ch-people" aria-label="Henkilöiden maksut tilikausittain"></canvas></div>
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

        <section class="panel span-12">
          <div class="panel-head"><h2>Tehdyt hankinnat</h2><span class="small muted" id="tl-sub"></span></div>
          <div class="timeline" id="timeline"></div>
        </section>
      </div>

      <div class="grid view" id="view-osakkaat" role="tabpanel" aria-labelledby="tab-osakkaat" hidden>
        <section class="panel span-12">
          <div class="panel-head"><h2>Ero tasaosuuteen kuukauden lopussa</h2><span class="small muted">plussalla = maksanut osuuttaan enemmän</span></div>
          <div class="chart-box tall"><canvas id="ch-owner-trend" aria-label="Osakkaiden ero tasaosuuteen kuukausittain"></canvas></div>
        </section>
        <section class="panel span-12">
          <div class="panel-head"><h2>Maksut kuukausittain</h2><span class="small muted" id="owner-monthly-sub"></span></div>
          <div class="chart-box"><canvas id="ch-owner-monthly" aria-label="Osakkaiden maksut kuukausittain"></canvas></div>
        </section>
        <section class="panel span-12">
          <div class="panel-head"><h2>Tilanne osakkaiden välillä</h2><span class="small muted" id="owner-table-sub"></span></div>
          <div class="table-scroll" style="max-height:560px;overflow-y:auto"><table id="owner-table"></table></div>
          <p class="small muted" style="margin:12px 0 0">Maksoi = yhteiset kulut + tilisiirrot kuukauden aikana. Ero = kertynyt saldo miinus osakkaiden keskiarvo kuukauden lopussa; tasatilanteessa kaikilla 0 €.</p>
        </section>
      </div>

      <div class="grid view" id="view-tilikaudet" role="tabpanel" aria-labelledby="tab-tilikaudet" hidden>
        <div class="span-12 kpis" id="fy-kpis"></div>
        <section class="panel span-7">
          <div class="panel-head"><h2>Kulut kertymänä tilikauden aikana</h2><span class="small muted">marraskuusta lokakuuhun</span></div>
          <div class="chart-box tall"><canvas id="ch-fy-trend" aria-label="Kulujen kertymä tilikausittain"></canvas></div>
        </section>
        <section class="panel span-5">
          <div class="panel-head"><h2>Kulut kululajeittain</h2><span class="small muted">tilikausittain</span></div>
          <div class="chart-box tall"><canvas id="ch-fy-cat" aria-label="Kulut kululajeittain tilikausittain"></canvas></div>
        </section>
        <section class="panel span-12">
          <div class="panel-head"><h2>Tilikausien vertailu</h2></div>
          <div class="table-scroll"><table id="fy-table"></table></div>
        </section>
        <section class="panel span-12">
          <div class="panel-head"><h2>Osakkaat tilikausittain</h2><span class="small muted">maksut ja saldon muutos kauden aikana</span></div>
          <div class="table-scroll"><table id="fy-owner-table"></table></div>
        </section>
      </div>

      <div class="grid view" id="view-sopimus" role="tabpanel" aria-labelledby="tab-sopimus" hidden>
        <div class="span-12 kpis" id="c-kpis"></div>
        <section class="panel span-7">
          <div class="panel-head"><h2>Pienhankintabudjetit</h2><span class="small muted">sopimuksen kohta 4</span></div>
          <div id="c-budgets"></div>
          <div class="chart-box short" style="margin-top:14px"><canvas id="ch-budget" aria-label="Pienhankintabudjetit kuukausittain"></canvas></div>
          <p class="small muted" id="c-budget-note" style="margin:12px 0 0"></p>
        </section>
        <section class="panel span-5">
          <div class="panel-head"><h2>Vuokratulovarat</h2><span class="small muted">kohta 5</span></div>
          <div id="c-rent"></div>
        </section>
        <section class="panel span-7">
          <div class="panel-head"><h2>Korjausrahoitus</h2><span class="small muted">kohta 6: rahoitusjärjestys</span></div>
          <div id="c-repair"></div>
        </section>
        <section class="panel span-5">
          <div class="panel-head"><h2>Tositteet</h2><span class="small muted" id="c-rcpt-sub"></span></div>
          <div id="c-receipts"></div>
        </section>
        <section class="panel span-7">
          <div class="panel-head"><h2>Juoksevat kulut</h2><span class="small muted">kohta 3</span></div>
          <div id="c-running"></div>
        </section>
        <section class="panel span-5">
          <div class="panel-head"><h2>Vuositarkistus</h2><span class="small muted">kohta 8</span></div>
          <div id="c-review"></div>
        </section>
        <section class="panel span-12">
          <details id="c-settings-box">
            <summary><h2 style="display:inline">Sopimuksen asetukset</h2> <span class="small muted" id="c-settings-sub"></span></summary>
            <div id="c-settings" style="margin-top:14px"></div>
          </details>
        </section>
      </div>

      <div class="grid view" id="view-tapahtumat" role="tabpanel" aria-labelledby="tab-tapahtumat" hidden>
        <section class="panel span-12" id="tapahtumat">
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
            <select class="input" id="tx-rcpt" style="width:auto">
              <option value="all">Kaikki tositteet</option>
              <option value="missing">Tosite puuttuu</option>
              <option value="file">Tosite liitetty</option>
              <option value="reason">Selitetty</option>
              <option value="legacy">Vanha, tasattu</option>
            </select>
          </div>
          <div class="table-scroll" style="max-height:620px;overflow-y:auto"><table id="tx-table"></table></div>
        </section>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  $("#f-fy").value = filter.fy;
  $("#f-person").value = filter.person;
  $("#tx-rcpt").value = filter.receipt;

  // ---------- Rajaukset ----------
  const inYear = (e) => filter.fy === "all" || fyOf(e.date) === +filter.fy;
  const byPerson = (e) => filter.person === "all" || e.payer === filter.person;
  const periodLabel = () => (filter.fy === "all" ? "kaikki tilikaudet" : `tilikausi ${fyLabel(+filter.fy)}`);

  // ---------- KPI:t ----------
  function renderKpis() {
    const b = balances(entries);
    const period = entries.filter((e) => inYear(e) && byPerson(e));
    const costs = period.reduce((s, e) => s + costOf(e), 0);
    const nCost = period.filter((e) => costOf(e) > 0).length;
    const fc = forecast();
    const ytd = entries.filter((e) => fyOf(e.date) === nowFy).reduce((s, e) => s + costOf(e), 0);
    const restMonths = fc.months.filter((m) => fyOf(m.ym + "-01") === nowFy);
    const yearEnd = ytd + restMonths.reduce((s, m) => s + m.total, 0);
    $("#kpis").innerHTML = `
      <div class="kpi accent"><span class="label">Tilin saldo</span><span class="value">${fmt(b.accountBalance)}</span><span class="sub">yhteinen tili, ${fmtDate(todayIso())}</span></div>
      <div class="kpi"><span class="label">Kulut, ${periodLabel()}${filter.person !== "all" ? " · " + filter.person : ""}</span><span class="value">${fmt0(costs)}</span><span class="sub">${nCost} kulua</span></div>
      <div class="kpi"><span class="label">Kiinteät kulut / kk</span><span class="value">${fmt0(fc.recurringMonthly)}</span><span class="sub">sähkö, vesi ja maksut, 12 kk ka.</span></div>
      <div class="kpi"><span class="label">Ennuste ${fyLabel(nowFy)}</span><span class="value">${fmt0(yearEnd)}</span><span class="sub">toteutunut ${fmt0(ytd)} + arvio loppukaudelle</span></div>`;
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
    if (filter.fy !== "all") return fyMonths(+filter.fy).filter((m) => m <= now);
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
          x: { ticks: { callback: (v) => fmt0(v), maxRotation: 0, maxTicksLimit: 5 } },
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
          showTab("tapahtumat");
        },
      },
    });
  }

  // ---------- Henkilöt ----------
  function renderPeople() {
    const ys = [...fys].reverse().filter((y) => filter.fy === "all" || y === +filter.fy);
    const datasets = [];
    for (const o of OWNERS) {
      if (filter.person !== "all" && filter.person !== o) continue;
      datasets.push({
        label: `${o}`,
        data: ys.map((y) => round2(entries.filter((e) => e.payer === o && fyOf(e.date) === y && (e.kind === "shared" || e.kind === "deposit")).reduce((s, e) => s + e.amount, 0))),
        backgroundColor: cssVar(OWNER_COLORS[o]),
        borderRadius: 4, borderSkipped: "bottom", maxBarThickness: 36,
        borderColor: cssVar("--surface"), borderWidth: { left: 1, right: 1, top: 0, bottom: 0 },
      });
    }
    draw("people", "ch-people", {
      type: "bar",
      data: { labels: ys.map(fyLabel), datasets },
      options: {
        ...baseOptions(),
        scales: { x: { grid: { display: false } }, y: { ticks: { callback: (v) => fmt0(v) } } },
        plugins: {
          ...baseOptions().plugins,
          legend: { position: "bottom", labels: legendLabels() },
          tooltip: { ...tooltipBase(), callbacks: {
            label: (i) => {
              const o = i.dataset.label, y = ys[i.dataIndex];
              const rows = entries.filter((e) => e.payer === o && fyOf(e.date) === y);
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
      (filter.receipt === "all" || receiptState(e) === filter.receipt) &&
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
      <thead><tr>${th("date", "Päivä")}${th("description", "Kuvaus")}${th("category", "Kululaji")}${th("payer", "Maksaja")}${th("amount", "Summa", "r")}<th>Tosite</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map((e) => `
        <tr>
          <td class="num" style="white-space:nowrap">${fmtDate(e.date)}</td>
          <td class="desc">${esc(e.description)}${e.note ? `<div class="small muted">${esc(e.note)}</div>` : ""}</td>
          <td><span class="pill" style="box-shadow:inset 3px 0 0 ${catColor(e.category)}">${esc(e.category)}</span></td>
          <td>${esc(e.payer)}<div class="small muted">${KIND_LABELS[e.kind]}</div></td>
          <td class="r ${e.amount < 0 ? "neg" : ""}">${fmt(e.amount)}</td>
          <td><button type="button" class="linkbtn rcpt-btn" data-rcpt="${e.id}" title="${esc(e.receipt_reason || "")}">${RECEIPT_BADGE[receiptState(e)]}${{ file: e.receipt_files, reason: "selite", missing: "lisää", legacy: '<span class="muted">vanha</span>' }[receiptState(e)]}</button></td>
          <td><a class="small" href="./?edit=${e.id}">Muokkaa</a></td>
        </tr>`).join("") : '<tr><td colspan="7" class="empty">Ei rivejä valituilla rajauksilla.</td></tr>'}</tbody>`;
  }

  // ---------- Roolit ----------
  function renderRoles() {
    const rows = entries.filter(inYear);
    const roles = computeRoles(rows);
    $("#roles-sub").textContent = `${periodLabel()} · kulutuksen perusteella`;
    $("#roles").innerHTML = roles.map((r) => `
      <article class="role-card" style="--owner:var(${OWNER_COLORS[r.name]})">
        <div class="role-top">
          <span class="role-emoji" aria-hidden="true">${r.role.emoji}</span>
          <div><span class="small muted">${esc(r.name)}${r.name === currentUser() ? " (sinä)" : ""}</span><h3>${esc(r.role.title)}</h3></div>
        </div>
        <p class="small" style="margin:0">${esc(r.role.desc)}${r.role.detail ? ` · <b>${esc(r.role.detail)}</b>` : ""}${r.role.share ? ` <span class="muted">(${Math.round(r.role.share * 100)} % porukan kokonaismäärästä)</span>` : ""}</p>
        ${r.badges.length ? `<div class="badges">${r.badges.map((b) => `<span class="badge" title="${esc(b.title)}: ${esc(b.desc)} · ${esc(b.detail)}">${b.emoji} ${esc(b.title)}</span>`).join("")}</div>` : ""}
      </article>`).join("");
  }

  // ---------- Osakkaat kuukausittain ----------
  // Kuukauden lopun kertynyt tilanne lasketaan koko historiasta; rajaus valitsee näytettävät kuukaudet.
  function ownerMonths() {
    const now = ymOf(todayIso());
    const first = entries.reduce((m, e) => (e.date < m ? e.date : m), todayIso());
    const all = monthRange(ymOf(first), now);
    return all.map((ym) => {
      const upto = entries.filter((e) => ymOf(e.date) <= ym);
      const inMonth = entries.filter((e) => ymOf(e.date) === ym);
      const b = balances(upto);
      return {
        ym,
        cost: inMonth.reduce((s, e) => s + costOf(e), 0),
        paid: Object.fromEntries(OWNERS.map((o) => [o, inMonth.filter((e) => e.payer === o && (e.kind === "shared" || e.kind === "deposit")).reduce((s, e) => s + e.amount, 0)])),
        diff: Object.fromEntries(b.people.map((p) => [p.name, p.diff])),
        saldo: Object.fromEntries(b.people.map((p) => [p.name, p.saldo])),
      };
    });
  }

  function renderOwners() {
    const all = ownerMonths();
    const months = filter.fy === "all" ? all : all.filter((m) => fyOf(m.ym + "-01") === +filter.fy);
    const shown = OWNERS.filter((o) => filter.person === "all" || o === filter.person);
    const labels = months.map((m) => monthShort(m.ym));
    draw("ownerTrend", "ch-owner-trend", {
      type: "line",
      data: { labels, datasets: shown.map((o) => ({
        label: o, data: months.map((m) => round2(m.diff[o])), borderColor: cssVar(OWNER_COLORS[o]), backgroundColor: cssVar(OWNER_COLORS[o]),
        borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: 0.2, stepped: false,
      })) },
      options: {
        ...baseOptions(),
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14 } },
          y: { ticks: { callback: (v) => fmt0(v) }, grid: { color: (c) => (c.tick.value === 0 ? cssVar("--muted") : cssVar("--grid")) } },
        },
        plugins: { ...baseOptions().plugins, legend: { position: "bottom", labels: legendLabels() },
          tooltip: { ...tooltipBase(), callbacks: { label: (i) => ` ${i.dataset.label}: ${i.raw >= 0 ? "+" : ""}${fmt(i.raw)}` } } },
      },
    });
    $("#owner-monthly-sub").textContent = periodLabel();
    draw("ownerMonthly", "ch-owner-monthly", {
      type: "bar",
      data: { labels, datasets: shown.map((o) => ({
        label: o, data: months.map((m) => round2(m.paid[o])), backgroundColor: cssVar(OWNER_COLORS[o]),
        borderRadius: 3, borderSkipped: "bottom", maxBarThickness: 16,
      })) },
      options: {
        ...baseOptions(),
        scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14 } }, y: { ticks: { callback: (v) => fmt0(v) } } },
        plugins: { ...baseOptions().plugins, legend: { position: "bottom", labels: legendLabels() },
          tooltip: { ...tooltipBase(), mode: "index", filter: (i) => i.raw > 0, callbacks: { label: (i) => ` ${i.dataset.label}: ${fmt(i.raw)}` } } },
      },
    });
    $("#owner-table-sub").textContent = `${periodLabel()} · uusin ensin`;
    const sign = (v) => `<span class="${v >= 0.5 ? "pos" : v <= -0.5 ? "neg" : ""}">${v >= 0 ? "+" : ""}${fmt0(v)}</span>`;
    $("#owner-table").innerHTML = `
      <thead><tr><th>Kuukausi</th><th class="r">Kulut</th>${OWNERS.map((o) => `<th class="r">${o}<br>maksoi</th><th class="r">${o}<br>ero</th>`).join("")}</tr></thead>
      <tbody>${[...months].reverse().map((m) => `<tr>
        <td style="white-space:nowrap">${monthLabel(m.ym)}${fyOf(m.ym + "-01") !== fyOf(addMonths(m.ym, 1) + "-01") ? ' <span class="pill">kausi päättyy</span>' : ""}</td>
        <td class="r">${fmt0(m.cost)}</td>
        ${OWNERS.map((o) => `<td class="r">${m.paid[o] ? fmt0(m.paid[o]) : '<span class="muted">–</span>'}</td><td class="r">${sign(m.diff[o])}</td>`).join("")}
      </tr>`).join("")}</tbody>`;
  }

  // ---------- Tilikaudet ----------
  function fyStats(fy) {
    const rows = entries.filter((e) => fyOf(e.date) === fy);
    const cost = rows.reduce((s, e) => s + costOf(e), 0);
    const recurring = rows.filter((e) => RECURRING.includes(e.category)).reduce((s, e) => s + costOf(e), 0);
    const income = rows.filter((e) => e.kind === "income" || (e.kind === "account" && e.amount > 0 && e.category !== "Pankki")).reduce((s, e) => s + e.amount, 0);
    const deposits = rows.filter((e) => e.kind === "deposit").reduce((s, e) => s + e.amount, 0);
    const end = fy === nowFy ? todayIso() : fyEnd(fy);
    const balance = accountBalanceAt(entries, end);
    const startBal = accountBalanceAt(entries, `${fy}-10-31`);
    const byCat = Object.fromEntries(CATEGORIES.map((c) => [c.name, rows.filter((e) => e.category === c.name).reduce((s, e) => s + costOf(e), 0)]));
    const before = entries.filter((e) => e.date < fyStart(fy));
    const after = entries.filter((e) => e.date <= end);
    const b0 = balances(before).people, b1 = balances(after).people;
    const people = OWNERS.map((o, i) => ({
      name: o,
      shared: rows.filter((e) => e.payer === o && e.kind === "shared").reduce((s, e) => s + e.amount, 0),
      deposit: rows.filter((e) => e.payer === o && e.kind === "deposit").reduce((s, e) => s + e.amount, 0),
      diffStart: b0[i].diff, diffEnd: b1[i].diff,
    }));
    return { fy, rows, n: rows.length, cost, recurring, oneOff: cost - recurring, income, deposits, balance, startBal, byCat, people, partial: fy === nowFy };
  }

  function renderFiscal() {
    const list = [...fys].sort((a, b) => a - b).map(fyStats).filter((f) => f.n > 0 || f.partial);
    const cur = list.find((f) => f.fy === nowFy);
    const prev = list.find((f) => f.fy === nowFy - 1);
    const fc = forecast();
    const rest = fc.months.filter((m) => fyOf(m.ym + "-01") === nowFy).reduce((s, m) => s + m.total, 0);
    const daysLeft = Math.ceil((new Date(fyEnd(nowFy) + "T23:59:59") - new Date()) / 864e5);
    // Vertailu edellisen kauden samaan ajankohtaan, jotta keskeneräinen kausi on reilusti vertailtavissa.
    const sameTimePrev = prev ? entries.filter((e) => fyOf(e.date) === prev.fy && e.date <= todayIso().replace(/^\d{4}/, (y) => String(+y - 1))).reduce((s, e) => s + costOf(e), 0) : 0;
    const delta = sameTimePrev ? (cur.cost - sameTimePrev) / sameTimePrev : null;
    $("#fy-kpis").innerHTML = `
      <div class="kpi accent"><span class="label">Kuluva tilikausi</span><span class="value">${fyLabel(nowFy)}</span><span class="sub">päättyy 31.10. · ${daysLeft} pv jäljellä</span></div>
      <div class="kpi"><span class="label">Kulut tähän mennessä</span><span class="value">${fmt0(cur.cost)}</span><span class="sub">${delta === null ? "ei vertailukautta" : `${delta >= 0 ? "+" : ""}${Math.round(delta * 100)} % vs. sama aika ${fyLabel(prev.fy)}`}</span></div>
      <div class="kpi"><span class="label">Kauden ennuste</span><span class="value">${fmt0(cur.cost + rest)}</span><span class="sub">per osakas ${fmt0((cur.cost + rest) / 3)}</span></div>
      <div class="kpi"><span class="label">Tilin saldo kauden alusta</span><span class="value">${cur.balance - cur.startBal >= 0 ? "+" : ""}${fmt0(cur.balance - cur.startBal)}</span><span class="sub">${fmt0(cur.startBal)} → ${fmt0(cur.balance)}</span></div>`;

    // Kertymä kuukausittain: vertailu tilikausien välillä samoina kuukausina.
    const monthNames = fyMonths(nowFy).map((ym) => MONTHS[+ym.slice(5) - 1].slice(0, 3));
    const nowYm = ymOf(todayIso());
    const fyColors = ["--c-other", "--c4", "--c2", "--c1"];
    const recent = list.slice(-4);
    draw("fyTrend", "ch-fy-trend", {
      type: "line",
      data: { labels: monthNames, datasets: recent.map((f, idx) => {
        let acc = 0;
        const color = cssVar(fyColors[fyColors.length - recent.length + idx]);
        return {
          label: fyLabel(f.fy) + (f.partial ? " (kesken)" : ""),
          data: fyMonths(f.fy).map((ym) => { if (ym > nowYm) return null; acc += f.rows.filter((e) => ymOf(e.date) === ym).reduce((s, e) => s + costOf(e), 0); return round2(acc); }),
          borderColor: color, backgroundColor: color, borderWidth: f.partial ? 3 : 2, pointRadius: 0, pointHoverRadius: 5, tension: 0.2,
        };
      }) },
      options: {
        ...baseOptions(),
        interaction: { mode: "index", intersect: false },
        scales: { x: { grid: { display: false }, ticks: { maxRotation: 0 } }, y: { ticks: { callback: (v) => fmt0(v) } } },
        plugins: { ...baseOptions().plugins, legend: { position: "bottom", labels: legendLabels() },
          tooltip: { ...tooltipBase(), filter: (i) => i.raw !== null, callbacks: { label: (i) => ` ${i.dataset.label}: ${fmt0(i.raw)}` } } },
      },
    });

    const usedCats = CATEGORIES.filter((c) => list.some((f) => f.byCat[c.name] > 0));
    draw("fyCat", "ch-fy-cat", {
      type: "bar",
      data: { labels: list.map((f) => fyLabel(f.fy) + (f.partial ? "*" : "")), datasets: usedCats.map((c) => ({
        label: c.name, data: list.map((f) => round2(f.byCat[c.name])), backgroundColor: cssVar(c.color),
        borderColor: cssVar("--surface"), borderWidth: { top: 2, bottom: 0, left: 0, right: 0 }, borderRadius: 3, borderSkipped: "bottom", maxBarThickness: 48, stack: "s",
      })) },
      options: {
        ...baseOptions(),
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: (v) => fmt0(v) } } },
        plugins: { ...baseOptions().plugins, legend: { position: "bottom", labels: legendLabels() },
          tooltip: { ...tooltipBase(), mode: "index", filter: (i) => i.raw > 0, callbacks: { label: (i) => ` ${i.dataset.label}: ${fmt0(i.raw)}`,
            footer: (items) => `Yhteensä ${fmt0(items.reduce((s, i) => s + i.raw, 0))}` } } },
      },
    });

    const chg = (a, b) => (b ? `<span class="small ${a > b ? "neg" : "pos"}" style="font-weight:600">${a >= b ? "▲" : "▼"} ${Math.abs(Math.round(((a - b) / b) * 100))} %</span>` : "");
    $("#fy-table").innerHTML = `
      <thead><tr><th>Tilikausi</th><th class="r">Kulut</th><th class="r">Kiinteät</th><th class="r">Hankinnat</th><th class="r">Per osakas</th><th class="r">Talletukset</th><th class="r">Tulot</th><th class="r">Tilin saldo lopussa</th><th class="r">Kirjauksia</th></tr></thead>
      <tbody>${[...list].reverse().map((f) => {
        const p = list.find((x) => x.fy === f.fy - 1);
        return `<tr>
          <td style="white-space:nowrap"><b>${fyLabel(f.fy)}</b>${f.partial ? ' <span class="pill">kesken</span>' : ""}</td>
          <td class="r">${fmt0(f.cost)} ${f.partial ? "" : chg(f.cost, p && p.cost)}</td>
          <td class="r">${fmt0(f.recurring)}</td><td class="r">${fmt0(f.oneOff)}</td>
          <td class="r">${fmt0(f.cost / 3)}</td><td class="r">${fmt0(f.deposits)}</td><td class="r">${fmt0(f.income)}</td>
          <td class="r">${fmt0(f.balance)}</td><td class="r">${f.n}</td></tr>`;
      }).join("")}</tbody>`;

    const sign = (v) => `<span class="${v >= 0.5 ? "pos" : v <= -0.5 ? "neg" : ""}">${v >= 0 ? "+" : ""}${fmt0(v)}</span>`;
    $("#fy-owner-table").innerHTML = `
      <thead><tr><th>Tilikausi</th><th>Osakas</th><th class="r">Kulut</th><th class="r">Tilille</th><th class="r">Yhteensä</th><th class="r">Ero alussa</th><th class="r">Ero lopussa</th><th class="r">Muutos</th></tr></thead>
      <tbody>${[...list].reverse().map((f) => f.people.map((p, i) => `<tr${i === 0 ? ' class="group-start"' : ""}>
        ${i === 0 ? `<td rowspan="3" style="white-space:nowrap"><b>${fyLabel(f.fy)}</b></td>` : ""}
        <td><span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:var(${OWNER_COLORS[p.name]})"></span>${p.name}</td>
        <td class="r">${fmt0(p.shared)}</td><td class="r">${fmt0(p.deposit)}</td><td class="r"><b>${fmt0(p.shared + p.deposit)}</b></td>
        <td class="r">${sign(p.diffStart)}</td><td class="r">${sign(p.diffEnd)}</td><td class="r">${sign(p.diffEnd - p.diffStart)}</td>
      </tr>`).join("")).join("")}</tbody>`;
  }

  // ---------- Sopimus ----------
  const LIMIT_DEFAULTS = { settleLimit: 500, buffer: 100, handlerShare: 50, rentPayoutFrom: 2000, rentKeep: 1400 };


  function contract(asOf = todayIso()) {
    const limits = { ...LIMIT_DEFAULTS, ...(settings.limits || {}) };
    const cur = currentResponsible(settings, entries, asOf);
    const isSuggested = cur.suggested;
    const next = cur.next;
    const kv = cur.who;
    // Budjetit alkavat nollasta kuluvastaavan kauden tai uuden ajan alusta, kumpi on myöhempi.
    const budgetFrom = cur.from > ERA_START ? cur.from : ERA_START;
    const budgetAt = (date) => {
      const rows = entries.filter((e) => e.date >= budgetFrom && e.date <= date);
      const credit = rows.filter((e) => e.payer === kv && (e.kind === "deposit" || e.kind === "shared")).reduce((s, e) => s + e.amount, 0);
      return Object.fromEntries(OWNERS.filter((o) => o !== kv).map((o) => [o,
        credit - rows.filter((e) => e.payer === o && (e.kind === "shared" || e.kind === "deposit")).reduce((s, e) => s + e.amount, 0)]));
    };
    const budgets = budgetAt(asOf);
    const periodRows = entries.filter((e) => e.date >= budgetFrom && e.date <= asOf);
    const kvDeposits = periodRows.filter((e) => e.payer === kv && e.kind === "deposit").reduce((s, e) => s + e.amount, 0);
    const kvPurchases = periodRows.filter((e) => e.payer === kv && e.kind === "shared").reduce((s, e) => s + e.amount, 0);
    const accountRunning = periodRows.filter((e) => e.kind === "account" && e.amount < 0 && e.category !== "Pankki" && !/hoitaja/i.test(e.description)).reduce((s, e) => s - e.amount, 0);

    const rentRows = entries.filter((e) => e.kind === "income" && e.date >= ERA_START);
    const rentIncome = rentRows.reduce((s, e) => s + e.amount, 0);
    const handlerDue = rentIncome * limits.handlerShare / 100;
    const handlerPaid = entries.filter((e) => e.kind === "account" && e.amount < 0 && e.date >= ERA_START && /hoitaja/i.test(e.description)).reduce((s, e) => s - e.amount, 0);
    const handlerOwed = Math.max(0, handlerDue - handlerPaid);
    const rentFunds = rentIncome - handlerDue;
    const handlers = {};
    for (const e of rentRows) { const h = OWNERS.includes(e.created_by) ? e.created_by : "Ei tiedossa"; handlers[h] = (handlers[h] || 0) + e.amount * limits.handlerShare / 100; }
    const accountBalance = balances(entries).accountBalance;
    const runningFunds = accountBalance - rentFunds - handlerOwed;
    const payout = rentFunds > limits.rentPayoutFrom ? rentFunds - limits.rentKeep : 0;
    const excess = Object.fromEntries(Object.entries(budgets).map(([o, b]) => [o, Math.max(0, b - limits.buffer)]));
    return { limits, cur, next, kv, isSuggested, budgetFrom, budgets, budgetAt, kvDeposits, kvPurchases, accountRunning,
      rentIncome, handlerDue, handlerPaid, handlerOwed, rentFunds, handlers, accountBalance, runningFunds, payout, excess };
  }

  function meter(value, min, max, marks = []) {
    const pct = (v) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100;
    const zero = pct(0);
    const left = Math.min(zero, pct(value)), width = Math.abs(pct(value) - zero);
    return `<div class="meter">
      ${marks.map((m) => `<span class="meter-mark ${m.cls || ""}" style="left:${pct(m.v)}%" title="${esc(m.label)}"></span>`).join("")}
      <span class="meter-fill" style="left:${left}%;width:${Math.max(width, 0.6)}%;background:${marks.color || "var(--accent)"}"></span>
    </div>`;
  }

  function renderContract() {
    const c = contract();
    const L = c.limits;
    const others = OWNERS.filter((o) => o !== c.kv);
    const settleAlerts = others.filter((o) => Math.abs(c.budgets[o]) > L.settleLimit);
    const tracked = entries.filter((e) => receiptState(e) !== "legacy");
    const covered = tracked.filter((e) => receiptState(e) !== "missing").length;
    $("#c-kpis").innerHTML = `
      <div class="kpi accent"><span class="label">Kuluvastaava</span><span class="value">${esc(c.kv)}</span><span class="sub">${c.isSuggested ? "ehdotus talletusten perusteella – vahvista asetuksista" : `${fmtDate(c.cur.from)}–${c.cur.until ? fmtDate(c.cur.until) : ""}`}${settings.bookkeeper ? ` · kirjanpitäjä ${esc(settings.bookkeeper)}` : ""}</span></div>
      <div class="kpi"><span class="label">Tasausraja ±${fmt0(L.settleLimit)}</span><span class="value">${settleAlerts.length ? `⚠ ${settleAlerts.length}` : "✓ OK"}</span><span class="sub">${settleAlerts.length ? `${settleAlerts.join(" ja ")}: tasausta voi vaatia` : "kaikki budjetit rajojen sisällä"}</span></div>
      <div class="kpi"><span class="label">Vuokratulovarat</span><span class="value">${fmt0(c.rentFunds)}</span><span class="sub">${c.payout > 0 ? `jaettavissa ${fmt0(c.payout)}` : `jakoraja ${fmt0(L.rentPayoutFrom)}`}</span></div>
      <div class="kpi"><span class="label">Tositteet</span><span class="value">${tracked.length ? Math.round((covered / tracked.length) * 100) + " %" : "–"}</span><span class="sub">${tracked.length ? `${tracked.length - covered} kirjaukselta puuttuu` : "ei uusia kirjauksia"} · ${fmtDate(ERA_START)} alkaen</span></div>`;

    // Pienhankintabudjetit
    const span = Math.max(L.settleLimit * 1.4, ...others.map((o) => Math.abs(c.budgets[o]) * 1.1));
    $("#c-budgets").innerHTML = `
      <div class="budget-row kv">
        <span class="name"><span class="dot" style="background:var(${OWNER_COLORS[c.kv]})"></span>${esc(c.kv)} <span class="pill">kuluvastaava</span></span>
        <span class="small">talletti ${fmt0(c.kvDeposits)}${c.kvPurchases ? ` + pienhankinnat ${fmt0(c.kvPurchases)}` : ""} → kasvattaa muiden budjettia</span>
      </div>
      ${others.map((o) => {
        const b = c.budgets[o];
        const status = Math.abs(b) > L.settleLimit ? `<span class="status warn">⚠ yli ±${fmt0(L.settleLimit)} – tasausta voi vaatia</span>`
          : b > L.buffer ? `<span class="status">${fmt0(b - L.buffer)} puskurin yli → korjausrahoitukseen</span>`
          : b >= 0 ? `<span class="status">puskurin sisällä</span>` : "";
        return `<div class="budget-row">
          <span class="name"><span class="dot" style="background:var(${OWNER_COLORS[o]})"></span>${esc(o)}</span>
          ${meter(b, -span, span, Object.assign([
            { v: -L.settleLimit, label: `−${L.settleLimit} € tasausraja`, cls: "limit" },
            { v: 0, label: "0", cls: "zero" },
            { v: L.buffer, label: `${L.buffer} € puskuri`, cls: "buffer" },
            { v: L.settleLimit, label: `${L.settleLimit} € tasausraja`, cls: "limit" },
          ], { color: `var(${OWNER_COLORS[o]})` }))}
          <span class="num ${b >= 0 ? "" : "neg"}"><b>${b >= 0 ? "+" : ""}${fmt0(b)}</b></span>
          <span class="small muted" style="grid-column:2/-1">${b >= 0 ? `käyttämätöntä budjettia – mökin saatava ${fmt0(b)}` : `hankintoja ${fmt0(-b)} yli budjetin`}${status ? ` · ${status}` : ""}</span>
        </div>`;
      }).join("")}`;
    const months = monthRange(ymOf(c.budgetFrom), ymOf(todayIso()));
    const limitLine = (v, label) => ({ label, data: months.map(() => v), borderColor: cssVar("--muted"), borderDash: [4, 4], borderWidth: 1, pointRadius: 0, pointHoverRadius: 0 });
    draw("budget", "ch-budget", {
      type: "line",
      data: { labels: months.map(monthShort), datasets: [
        ...others.map((o) => ({ label: o, data: months.map((ym) => round2(c.budgetAt(`${ym}-31`)[o])), borderColor: cssVar(OWNER_COLORS[o]), backgroundColor: cssVar(OWNER_COLORS[o]), borderWidth: 2, pointRadius: months.length < 4 ? 4 : 0, pointHoverRadius: 5, tension: 0.2 })),
        limitLine(L.settleLimit, "Tasausraja"), limitLine(-L.settleLimit, "Tasausraja −"),
      ] },
      options: {
        ...baseOptions(),
        interaction: { mode: "index", intersect: false },
        scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14 } }, y: { ticks: { callback: (v) => fmt0(v) } } },
        plugins: { ...baseOptions().plugins,
          legend: { position: "bottom", labels: { ...legendLabels(), filter: (l) => !l.text.startsWith("Tasausraja −") } },
          tooltip: { ...tooltipBase(), filter: (i) => !i.dataset.label.startsWith("Tasausraja"), callbacks: { label: (i) => ` ${i.dataset.label}: ${fmt0(i.raw)}` } } },
      },
    });
    $("#c-budget-note").textContent = `Budjetti = kuluvastaavan talletukset ja pienhankinnat ${fmtDate(c.budgetFrom)} alkaen − osakkaan omat hankinnat ja tilisiirrot. ` +
      `Plussalla oleva budjetti on mökin saatava osakkaalta. Kuluvastaavan vaihtuessa budjetit tasataan ja aloitetaan nollasta. Vanhat kirjaukset ennen ${fmtDate(ERA_START)} on tasattu.`;

    // Vuokratulovarat
    const rentMax = Math.max(L.rentPayoutFrom * 1.2, c.rentFunds * 1.1);
    $("#c-rent").innerHTML = `
      <div class="big-num">${fmt(c.rentFunds)}</div>
      ${meter(c.rentFunds, 0, rentMax, Object.assign([{ v: L.rentKeep, label: `${L.rentKeep} € jää aina`, cls: "buffer" }, { v: L.rentPayoutFrom, label: `${L.rentPayoutFrom} € jakoraja`, cls: "limit" }], { color: "var(--c3)" }))}
      <div class="meter-scale small muted"><span>0 €</span><span>jää ${fmt0(L.rentKeep)}</span><span>jako ${fmt0(L.rentPayoutFrom)}</span></div>
      <p class="small" style="margin:10px 0">${c.payout > 0 ? `<b>Osakkaille voi jakaa ${fmt0(c.payout)}</b> (${fmt0(c.payout / 3)} / osakas).` : `Jakoon on matkaa ${fmt0(Math.max(0, L.rentPayoutFrom - c.rentFunds))}. Varoja käytetään vain pakollisiin korjauksiin ja suuriin investointeihin.`}</p>
      <table class="mini">
        <tr><td>Vuokratulot ${fmtDate(ERA_START)} alkaen</td><td class="r">${fmt(c.rentIncome)}</td></tr>
        <tr><td>Hoitajien korvaus ${L.handlerShare} %</td><td class="r">−${fmt(c.handlerDue)}</td></tr>
        ${Object.entries(c.handlers).map(([h, v]) => `<tr><td class="muted">&nbsp;&nbsp;${esc(h)}</td><td class="r muted">${fmt(v)}</td></tr>`).join("")}
        <tr><td>Korvauksia maksettu tililtä</td><td class="r">${fmt(c.handlerPaid)}</td></tr>
        ${c.handlerOwed > 0.005 ? `<tr><td><b>Hoitajille maksamatta</b></td><td class="r"><b>${fmt(c.handlerOwed)}</b></td></tr>` : ""}
      </table>
      <p class="small muted" style="margin:10px 0 0">Vuokratulo kirjataan välityspalkkioiden jälkeen. Hoitaja = tulon kirjannut osakas. Maksettu korvaus kirjataan tililtä kuvauksella, jossa on sana "hoitaja".</p>`;

    // Korjausrahoitus
    const pool2 = Object.values(c.excess).reduce((s, v) => s + v, 0);
    const savedAmt = +(store.get("dash.repair") || 3000);
    $("#c-repair").innerHTML = `
      <div class="field" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
        <label class="label" for="repair-amt">Korjauksen hinta</label>
        <div class="amount-wrap" style="width:160px"><input class="input" id="repair-amt" inputmode="decimal" value="${savedAmt}" style="font-size:1.1rem;min-height:44px;padding:8px 36px 8px 12px"><span class="euro" style="font-size:1rem;right:12px">€</span></div>
      </div>
      <div id="repair-out"></div>`;
    const calc = () => {
      const amt = Math.max(0, parseAmount($("#repair-amt").value) || 0);
      store.set("dash.repair", String(amt));
      const s1 = Math.min(amt, Math.max(0, c.rentFunds));
      const s2 = Math.min(amt - s1, pool2);
      const s3 = amt - s1 - s2;
      const w = (v) => (amt ? (v / amt) * 100 : 0);
      $("#repair-out").innerHTML = `
        <div class="stackbar" role="img" aria-label="Rahoituksen jakautuminen">
          ${s1 ? `<span style="width:${w(s1)}%;background:var(--c3)"></span>` : ""}${s2 ? `<span style="width:${w(s2)}%;background:var(--c4)"></span>` : ""}${s3 ? `<span style="width:${w(s3)}%;background:var(--c2)"></span>` : ""}
        </div>
        <ol class="funding">
          <li><i style="background:var(--c3)"></i><span>Vuokratulovarat <span class="muted small">käytettävissä ${fmt0(c.rentFunds)}</span></span><b>${fmt0(s1)}</b></li>
          <li><i style="background:var(--c4)"></i><span>Budjettien puskurin ylittävä osa <span class="muted small">${others.map((o) => `${o} ${fmt0(c.excess[o])}`).join(", ")}</span></span><b>${fmt0(s2)}</b></li>
          <li><i style="background:var(--c2)"></i><span>Loput tasan <span class="muted small">${fmt0(s3 / 3)} / osakas</span></span><b>${fmt0(s3)}</b></li>
        </ol>
        <p class="small muted" style="margin:10px 0 0">Pakollinen korjaus: enemmistöpäätös asiantuntijan suosituksen rajoissa. Muut suuret hankinnat: yksimielisesti ennen töiden aloittamista. Osakkaiden työ on talkootyötä, materiaalit korvataan.</p>`;
    };
    $("#repair-amt").addEventListener("input", calc);
    calc();

    // Tositteet
    const scope = entries.filter((e) => inYear(e) && receiptState(e) !== "legacy");
    const cnt = { file: 0, reason: 0, missing: 0 };
    scope.forEach((e) => cnt[receiptState(e)]++);
    const tot = Math.max(1, scope.length);
    $("#c-rcpt-sub").textContent = periodLabel();
    const byCreator = OWNERS.map((o) => {
      const mine = scope.filter((e) => e.created_by === o);
      return { o, n: mine.length, miss: mine.filter((e) => receiptState(e) === "missing").length };
    });
    $("#c-receipts").innerHTML = `
      <div class="stackbar" role="img" aria-label="Tositteiden kattavuus">
        <span style="width:${(cnt.file / tot) * 100}%;background:var(--c3)"></span><span style="width:${(cnt.reason / tot) * 100}%;background:var(--c1)"></span><span style="width:${(cnt.missing / tot) * 100}%;background:var(--surface-2)"></span>
      </div>
      <ul class="funding" style="list-style:none;padding:0">
        <li><i style="background:var(--c3)"></i><span>📎 Kuitti tai lasku liitetty</span><b>${cnt.file}</b></li>
        <li><i style="background:var(--c1)"></i><span>✎ Selitetty miksi ei ole</span><b>${cnt.reason}</b></li>
        <li><i style="background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line)"></i><span>Puuttuu <a class="small" href="#tapahtumat" data-missing>näytä</a></span><b>${cnt.missing}</b></li>
      </ul>
      <p class="small muted" style="margin:10px 0 0">Omat kirjaukset ilman tositetta: ${byCreator.map((b) => `${b.o} ${b.miss}/${b.n}`).join(" · ")}. Seurataan ${fmtDate(ERA_START)} alkaen – vanhat kirjaukset on tasattu ilman tositteita.</p>`;

    // Juoksevat kulut
    const cover = c.accountRunning ? c.kvDeposits / c.accountRunning : null;
    $("#c-running").innerHTML = `
      <p style="margin:0 0 10px">Juoksevat kulut maksetaan tililtä, ja niistä vastaa kuluvastaava <b>${esc(c.kv)}</b>, joka tallettaa tilille tarvittavan summan.</p>
      <table class="mini">
        <tr><td>Tililtä maksettu ${fmtDate(c.budgetFrom)} alkaen</td><td class="r">${fmt(c.accountRunning)}</td></tr>
        <tr><td>Kuluvastaavan talletukset samalla jaksolla</td><td class="r">${fmt(c.kvDeposits)}</td></tr>
        <tr><td>Kattavuus</td><td class="r"><b>${cover === null ? "–" : Math.round(cover * 100) + " %"}</b></td></tr>
        <tr><td>Juoksevien kulujen varat tilillä</td><td class="r"><b>${fmt(c.runningFunds)}</b></td></tr>
        <tr><td class="muted">= tilin saldo ${fmt0(c.accountBalance)} − vuokratulovarat${c.handlerOwed > 0.005 ? " − maksamattomat korvaukset" : ""}</td><td></td></tr>
      </table>`;

    // Vuositarkistus
    const daysLeft = Math.ceil((new Date(fyEnd(nowFy) + "T23:59:59") - new Date()) / 864e5);
    const inReview = todayIso().slice(5, 7) === "11";
    $("#c-review").innerHTML = `
      <p style="margin:0 0 10px">${inReview ? `<b>Nyt on vuositarkistuksen aika!</b> Tilikausi ${fyLabel(nowFy - 1)} päättyi.` : `Tilikausi ${fyLabel(nowFy)} päättyy <b>${daysLeft} päivän</b> päästä. Kirjanpito käydään yhdessä läpi marraskuussa.`}</p>
      <ul class="checklist">
        <li>Käykää kirjanpito läpi ja täydentäkää puuttuvat tositteet</li>
        <li>Valitkaa kuluvastaava ja kirjanpitäjä (yksimielisesti)</li>
        <li>Tarkistakaa vuokrahinnat ja käyttökorvaukset</li>
        <li>Tarkistakaa euromääräiset rajat (${fmt0(L.settleLimit)} tasaus, ${fmt0(L.buffer)} puskuri, ${fmt0(L.rentPayoutFrom)}/${fmt0(L.rentKeep)} vuokratulot)</li>
        <li>Tasatkaa budjetit, jos kuluvastaava vaihtuu</li>
      </ul>`;

    renderSettings(c);
  }

  function renderSettings(c) {
    const resp = (settings.responsibles || []).length ? settings.responsibles : [currentResponsible(settings, entries)];
    const L = c.limits;
    $("#c-settings-sub").textContent = settings.updated_at ? `· muokattu ${fmtDate(settings.updated_at.slice(0, 10))} (${settings.updated_by || "?"})` : "· oletusarvot";
    const ownerSel = (v, id, empty) => `<select class="input" ${id}>${empty ? `<option value="">${empty}</option>` : ""}${OWNERS.map((o) => `<option ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select>`;
    $("#c-settings").innerHTML = `
      <div class="settings-grid">
        <div>
          <span class="label">Kuluvastaavat</span> <span class="small muted">alkaen – asti (valinnainen) – kuka</span>
          <div id="s-resp" style="display:grid;gap:8px;margin-top:6px">
            ${resp.map((r) => `<div class="s-row"><input class="input" type="date" value="${r.from}" data-from title="Alkaen"><input class="input" type="date" value="${r.until || ""}" data-until title="Asti (valinnainen)">${ownerSel(r.who, "data-who")}<button type="button" class="linkbtn danger" data-rm>Poista</button></div>`).join("")}
          </div>
          <button type="button" class="linkbtn" id="s-add" style="margin-top:6px">+ Kuluvastaavan vaihdos</button>
        </div>
        <div class="field"><label class="label" for="s-era">Uusi aika alkaa</label><input class="input" id="s-era" type="date" value="${ERA_START}"><span class="small muted">Vanhemmat kirjaukset on tasattu: ei tositteita, budjetit nollasta.</span></div>
        <div class="field"><label class="label">Kirjanpitäjä</label>${ownerSel(settings.bookkeeper, 'id="s-book"', "Ei valittu")}</div>
        ${[["settleLimit", "Tasausraja €"], ["buffer", "Puskuri / osakas €"], ["handlerShare", "Hoitajan osuus %"], ["rentPayoutFrom", "Vuokratulojen jakoraja €"], ["rentKeep", "Vuokratuloja jää vähintään €"]]
          .map(([k, l]) => `<div class="field"><label class="label" for="s-${k}">${l}</label><input class="input" id="s-${k}" inputmode="decimal" value="${L[k]}"></div>`).join("")}
      </div>
      <button type="button" class="btn primary" id="s-save" style="margin-top:14px">Tallenna asetukset</button>`;
    const box = $("#c-settings");
    box.querySelector("#s-add").addEventListener("click", () => {
      const row = document.createElement("div");
      row.className = "s-row";
      row.innerHTML = `<input class="input" type="date" value="${fyStart(nowFy + 1)}" data-from title="Alkaen"><input class="input" type="date" value="${fyEnd(nowFy + 1)}" data-until title="Asti (valinnainen)">${ownerSel(OWNERS[0], "data-who")}<button type="button" class="linkbtn danger" data-rm>Poista</button>`;
      box.querySelector("#s-resp").append(row);
    });
    box.querySelector("#s-resp").addEventListener("click", (ev) => { if (ev.target.closest("[data-rm]")) ev.target.closest(".s-row").remove(); });
    box.querySelector("#s-save").addEventListener("click", async (ev) => {
      const body = {
        responsibles: [...box.querySelectorAll(".s-row")].map((r) => ({ from: r.querySelector("[data-from]").value, until: r.querySelector("[data-until]").value || null, who: r.querySelector("[data-who]").value })),
        bookkeeper: box.querySelector("#s-book").value || null,
        eraStart: box.querySelector("#s-era").value || null,
        limits: Object.fromEntries(Object.keys(LIMIT_DEFAULTS).map((k) => [k, parseAmount(box.querySelector(`#s-${k}`).value)])),
      };
      ev.target.disabled = true;
      try {
        await saveSettings(body);
        settings = await getSettings();
        setEraStart(settings);
        toast("Asetukset tallennettu");
        renderContract();
        $("#c-settings-box").open = true;
      } catch (e) { toast(e.message, true); }
      finally { ev.target.disabled = false; }
    });
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

  // Vain näkyvä välilehti piirretään: piilotettuun canvasiin Chart.js ei saa kokoa.
  const VIEWS = {
    yleiskuva: () => { renderRoles(); renderKpis(); renderBalances(); renderMonthly(); renderCategories(); renderPeople(); renderForecast(); renderTimeline(); },
    osakkaat: renderOwners,
    tilikaudet: renderFiscal,
    sopimus: renderContract,
    tapahtumat: renderTable,
  };
  function renderAll() {
    applyChartTheme();
    VIEWS[tab]();
  }
  function showTab(id, scroll = true) {
    tab = id;
    store.set("dash.tab", id);
    root.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === id));
    root.querySelectorAll(".view").forEach((v) => { v.hidden = v.id !== `view-${id}`; });
    root.querySelector(".filters").hidden = id === "tilikaudet";
    $("#f-person-field").hidden = id === "sopimus";
    if (location.hash.slice(1) !== id) history.replaceState(null, "", `${location.pathname}${location.search}#${id}`);
    renderAll();
    if (scroll) window.scrollTo({ top: 0 });
  }

  // ---------- Tapahtumat ----------
  root.querySelector(".tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); });
  $("#view-sopimus").addEventListener("click", (e) => {
    if (!e.target.closest("[data-missing]")) return;
    e.preventDefault();
    filter.receipt = "missing"; $("#tx-rcpt").value = "missing";
    showTab("tapahtumat");
  });
  $("#f-fy").addEventListener("change", (e) => { filter.fy = e.target.value; store.set("dash.fy", filter.fy); renderAll(); });
  $("#f-person").addEventListener("change", (e) => { filter.person = e.target.value; store.set("dash.person", filter.person); renderAll(); });
  $("#tx-search").addEventListener("input", (e) => { filter.search = e.target.value; renderTable(); });
  $("#tx-cat").addEventListener("change", (e) => { filter.category = e.target.value; renderTable(); });
  $("#tx-kind").addEventListener("change", (e) => { filter.kind = e.target.value; renderTable(); });
  $("#tx-rcpt").addEventListener("change", (e) => { filter.receipt = e.target.value; renderTable(); });
  $("#tx-table").addEventListener("click", (e) => {
    const r = e.target.closest("[data-rcpt]");
    if (r) {
      openReceiptDialog(entries.find((x) => x.id === +r.dataset.rcpt), (upd) => {
        entries = entries.map((x) => (x.id === upd.id ? { ...x, ...upd } : x));
        renderTable();
      });
      return;
    }
    const b = e.target.closest("[data-sort]");
    if (!b) return;
    const k = b.dataset.sort;
    filter.sort = filter.sort.key === k ? { key: k, dir: -filter.sort.dir } : { key: k, dir: k === "date" || k === "amount" ? -1 : 1 };
    renderTable();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderAll);

  showTab(tab, false);
  if (location.hash === "#roolit") setTimeout(() => $("#roolit").scrollIntoView(), 50);
  window.addEventListener("hashchange", () => { const t = hashTab(); if (t && t !== tab) showTab(t); });
});
