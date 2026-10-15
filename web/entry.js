// Syöttösivu: uuden kulun tai tilisiirron kirjaus, viimeisimmät rivit ja muokkaus.

const TYPES = [
  { id: "shared", label: "Maksoin yhteisen kulun", hint: "Maksoit omasta pussista. Kulu jaetaan kolmeen osaan." },
  { id: "deposit", label: "Siirsin rahaa tilille", hint: "Siirto yhteiselle tilille kasvattaa omaa panostasi." },
  { id: "out", label: "Maksettu tililtä", hint: "Lasku maksettiin suoraan yhteiseltä tililtä (esim. sähkö, vesi)." },
  { id: "income", label: "Tulo tilille", hint: "Vuokratulo, korko tai muu tilille tullut raha." },
];

function formTypeOf(e) {
  if (e.kind === "shared" || e.kind === "deposit") return e.kind;
  if (e.kind === "account" && e.amount < 0) return "out";
  return "income";
}

boot("entry", (root, entries) => {
  const state = {
    type: "shared",
    payer: currentUser(),
    category: null,
    categoryTouched: false,
    editing: null,
  };

  root.innerHTML = `
    <div class="wrap narrow" style="display:grid;gap:24px">
      <form class="panel entry-form" id="entry-form" novalidate>
        <div class="panel-head" style="margin:0">
          <h1 id="form-title">Uusi kirjaus</h1>
          <button type="button" class="linkbtn" id="cancel-edit" hidden>Peru muokkaus</button>
        </div>

        <div class="field">
          <span class="label">Mitä tapahtui?</span>
          <div class="seg" id="type-seg">
            ${TYPES.map((t) => `<button type="button" data-type="${t.id}">${t.label}</button>`).join("")}
          </div>
          <p class="hint" id="type-hint"></p>
        </div>

        <div class="field">
          <label class="label" for="amount">Summa</label>
          <div class="amount-wrap">
            <input class="input" id="amount" inputmode="decimal" autocomplete="off" placeholder="0,00" required>
            <span class="euro">€</span>
          </div>
        </div>

        <div class="field">
          <label class="label" for="description">Kuvaus</label>
          <input class="input" id="description" list="desc-list" autocomplete="off" placeholder="Esim. Terassilaudat, Sähkö" maxlength="200" required>
          <datalist id="desc-list"></datalist>
        </div>

        <div class="field" id="payer-field">
          <span class="label">Kuka maksoi?</span>
          <div class="chips" id="payer-chips">
            ${OWNERS.map((o) => `<button type="button" class="chip" data-payer="${o}"><span class="dot" style="background:var(${OWNER_COLORS[o]})"></span>${o}</button>`).join("")}
          </div>
        </div>

        <div class="field" id="category-field">
          <span class="label">Kululaji <span class="muted small" id="cat-guess" style="text-transform:none;letter-spacing:0;font-weight:400"></span></span>
          <div class="chips" id="category-chips"></div>
        </div>

        <div class="row2">
          <div class="field">
            <label class="label" for="date">Päivä</label>
            <input class="input" id="date" type="date" required>
          </div>
          <div class="field">
            <label class="label" for="note">Lisätieto</label>
            <input class="input" id="note" autocomplete="off" placeholder="Valinnainen" maxlength="500">
          </div>
        </div>

        <p class="error-text" id="form-error" role="alert"></p>
        <div class="form-actions">
          <button class="btn primary" type="submit" id="save-btn">Tallenna</button>
        </div>
      </form>

      <section class="panel">
        <div class="panel-head">
          <h2>Viimeisimmät kirjaukset</h2>
          <a class="small" href="./tilanne.html#tapahtumat">Kaikki tapahtumat</a>
        </div>
        <ul class="recent" id="recent"></ul>
      </section>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const form = $("#entry-form");
  $("#date").value = todayIso();

  function categoryOptions() {
    if (state.type === "income") return ["Vuokratulot", "Pankki", "Muut"];
    return CATEGORIES.map((c) => c.name);
  }

  function render() {
    root.querySelectorAll("[data-type]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.type === state.type));
    $("#type-hint").textContent = TYPES.find((t) => t.id === state.type).hint;
    const needsPayer = state.type === "shared" || state.type === "deposit";
    $("#payer-field").hidden = !needsPayer;
    root.querySelectorAll("[data-payer]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.payer === state.payer));
    $("#category-field").hidden = state.type === "deposit";
    const opts = categoryOptions();
    if (!opts.includes(state.category)) state.category = null;
    $("#category-chips").innerHTML = opts.map((c) => {
      const col = CATEGORIES.find((x) => x.name === c);
      const dot = col ? `<span class="dot" style="background:var(${col.color})"></span>` : "";
      return `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${c === state.category}">${dot}${esc(c)}</button>`;
    }).join("");
    $("#form-title").textContent = state.editing ? "Muokkaa kirjausta" : "Uusi kirjaus";
    $("#cancel-edit").hidden = !state.editing;
    $("#save-btn").textContent = state.editing ? "Tallenna muutokset" : "Tallenna";
  }

  function renderRecent() {
    const descs = [...new Set(entries.map((e) => e.description))].slice(0, 200);
    $("#desc-list").innerHTML = descs.map((d) => `<option value="${esc(d)}"></option>`).join("");
    const recent = [...entries].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "") || b.id - a.id).slice(0, 12);
    if (!recent.length) { $("#recent").innerHTML = '<li class="empty">Ei vielä kirjauksia.</li>'; return; }
    $("#recent").innerHTML = recent.map((e) => {
      const who = e.kind === "account" || e.kind === "income" ? "Tili" : e.payer;
      const amt = e.kind === "shared" ? e.amount : e.amount;
      return `<li data-id="${e.id}">
        <span class="desc">${esc(e.description)}</span>
        <span class="amt ${amt < 0 ? "neg" : ""}">${fmt(amt)}</span>
        <span class="meta">${fmtDate(e.date)} · ${esc(who)} · ${esc(e.category)}</span>
        <span class="acts">
          <button type="button" class="linkbtn" data-edit="${e.id}">Muokkaa</button>
          <button type="button" class="linkbtn danger" data-del="${e.id}">Poista</button>
        </span>
      </li>`;
    }).join("");
  }

  function resetForm() {
    state.editing = null;
    state.category = null;
    state.categoryTouched = false;
    form.reset();
    $("#date").value = todayIso();
    $("#cat-guess").textContent = "";
    $("#form-error").textContent = "";
    history.replaceState(null, "", location.pathname);
    render();
  }

  function startEdit(e) {
    state.editing = e;
    state.type = formTypeOf(e);
    state.payer = OWNERS.includes(e.payer) ? e.payer : state.payer;
    state.category = e.category;
    state.categoryTouched = true;
    $("#amount").value = String(Math.abs(e.amount)).replace(".", ",");
    $("#description").value = e.description;
    $("#date").value = e.date;
    $("#note").value = e.note || "";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    $("#amount").focus({ preventScroll: true });
  }

  $("#type-seg").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-type]");
    if (!b) return;
    state.type = b.dataset.type;
    if (state.type === "income" && !state.category) state.category = "Vuokratulot";
    render();
  });
  $("#payer-chips").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-payer]");
    if (b) { state.payer = b.dataset.payer; render(); }
  });
  $("#category-chips").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-cat]");
    if (b) { state.category = b.dataset.cat; state.categoryTouched = true; $("#cat-guess").textContent = ""; render(); }
  });
  $("#description").addEventListener("input", () => {
    if (state.categoryTouched || state.type === "deposit") return;
    const guess = guessCategory($("#description").value, entries);
    if (guess && categoryOptions().includes(guess)) {
      state.category = guess;
      $("#cat-guess").textContent = "· ehdotettu kuvauksen perusteella";
      render();
    }
  });
  $("#cancel-edit").addEventListener("click", resetForm);

  $("#recent").addEventListener("click", async (ev) => {
    const edit = ev.target.closest("[data-edit]");
    const del = ev.target.closest("[data-del]");
    if (edit) startEdit(entries.find((e) => e.id === +edit.dataset.edit));
    if (del) {
      // Kaksivaiheinen vahvistus ilman selaimen dialogia.
      if (del.dataset.confirm !== "1") {
        del.dataset.confirm = "1";
        del.textContent = "Vahvista poisto";
        setTimeout(() => { del.dataset.confirm = ""; del.textContent = "Poista"; }, 4000);
        return;
      }
      try {
        await deleteEntry(del.dataset.del);
        entries = entries.filter((e) => e.id !== +del.dataset.del);
        if (state.editing && state.editing.id === +del.dataset.del) resetForm();
        renderRecent();
        toast("Kirjaus poistettu");
      } catch (e) { toast(e.message, true); }
    }
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = $("#form-error");
    err.textContent = "";
    const amount = parseAmount($("#amount").value);
    const description = $("#description").value.trim();
    if (!(amount > 0)) { err.textContent = "Anna summa euroina, esim. 24,90."; $("#amount").focus(); return; }
    if (!description) { err.textContent = "Kirjoita lyhyt kuvaus."; $("#description").focus(); return; }
    if ((state.type === "shared" || state.type === "deposit") && !state.payer) { err.textContent = "Valitse kuka maksoi."; return; }

    let kind = state.type, payer = state.payer, signed = amount, category = state.category || "Muut";
    if (state.type === "deposit") category = "Tilisiirto";
    if (state.type === "out") { kind = "account"; payer = "Tili"; signed = -amount; }
    if (state.type === "income") {
      if (category === "Vuokratulot") { kind = "income"; payer = "Vuokratulot"; }
      else { kind = "account"; payer = "Tili"; }
    }
    const body = { date: $("#date").value, description, payer, kind, amount: signed, category, note: $("#note").value.trim() || null, created_by: currentUser() };

    const btn = $("#save-btn");
    btn.disabled = true;
    try {
      if (state.editing) {
        const saved = await updateEntry(state.editing.id, body);
        entries = entries.map((e) => (e.id === saved.id ? saved : e));
        toast("Muutokset tallennettu");
      } else {
        const saved = await createEntry(body);
        entries = [saved, ...entries];
        toast(`Tallennettu: ${description} ${fmt(signed)}`);
      }
      const keepType = state.type;
      resetForm();
      state.type = keepType;
      render();
      renderRecent();
    } catch (e) {
      err.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  });

  render();
  renderRecent();

  const editId = new URLSearchParams(location.search).get("edit");
  if (editId) {
    const e = entries.find((x) => x.id === +editId);
    if (e) startEdit(e);
  }
});
