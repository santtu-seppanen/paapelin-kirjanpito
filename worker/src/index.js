// Paapelin kirjanpito – API (Cloudflare Worker + D1)
//
// GET    /api/health           ilman tunnistautumista
// GET    /api/entries          kaikki rivit
// POST   /api/entries          uusi rivi
// PUT    /api/entries/:id      muokkaa riviä
// DELETE /api/entries/:id      poista rivi (ja sen tositteet)
// GET    /api/entries/:id/receipts   rivin tositteet (ilman tiedostosisältöä)
// POST   /api/entries/:id/receipts   uusi tosite: tiedosto raakana bodyna (X-Filename-otsake)
//                                    tai JSON {reason} kun tositetta ei ole
// GET    /api/receipts/:id     tositteen tiedosto
// DELETE /api/receipts/:id     poista tosite
// GET    /api/documents        asiakirjat (ilman sisältöä)
// POST   /api/documents        uusi asiakirja raakana bodyna (X-Filename, X-Title)
// GET    /api/documents/:id    asiakirjan tiedosto
// GET    /api/settings         sopimuksen asetukset
// PUT    /api/settings         tallenna asetukset
//
// Kaikki kutsut paitsi health vaativat otsakkeen "Authorization: Bearer <APP_PASSWORD>".

const KINDS = ["shared", "deposit", "account", "income"];
const PAYERS = ["Santtu", "Vili", "Urpo", "Tili", "Vuokratulot"];
// D1:n rivin enimmäiskoko on 2 Mt; jätetään tilaa muille sarakkeille.
const MAX_FILE_BYTES = 1_900_000;
const FILE_TYPES = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      const res = await route(request, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      const status = err.status || 500;
      return json({ error: status === 500 ? "Palvelinvirhe" : err.message }, status, cors);
    }
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");

  if (path === "/api/health") return json({ ok: true });

  if (!/^\/api\/(entries|receipts|documents|settings)/.test(path)) throw httpError(404, "Ei löytynyt");
  if (!authorized(request, env)) throw httpError(401, "Väärä salasana");

  const idMatch = path.match(/^\/api\/entries\/(\d+)$/);
  const entryReceipts = path.match(/^\/api\/entries\/(\d+)\/receipts$/);
  const receiptMatch = path.match(/^\/api\/receipts\/(\d+)$/);
  const docMatch = path.match(/^\/api\/documents\/(\d+)$/);

  if (path === "/api/entries" && request.method === "GET") {
    // receipt_files = liitettyjen tiedostojen määrä, receipt_reason = viimeisin selite puuttuvalle tositteelle.
    const { results } = await env.DB.prepare(
      `SELECT e.*,
         (SELECT COUNT(*) FROM receipts r WHERE r.entry_id = e.id AND r.data IS NOT NULL) AS receipt_files,
         (SELECT r.reason FROM receipts r WHERE r.entry_id = e.id AND r.reason IS NOT NULL ORDER BY r.id DESC LIMIT 1) AS receipt_reason
       FROM entries e ORDER BY e.date DESC, e.id DESC`
    ).all();
    return json(results);
  }

  if (path === "/api/entries" && request.method === "POST") {
    const e = validate(await request.json());
    const row = await env.DB.prepare(
      `INSERT INTO entries (date, description, payer, kind, amount, category, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    ).bind(e.date, e.description, e.payer, e.kind, e.amount, e.category, e.note, e.created_by).first();
    return json({ ...row, receipt_files: 0, receipt_reason: null }, 201);
  }

  if (idMatch && request.method === "PUT") {
    const e = validate(await request.json());
    const row = await env.DB.prepare(
      `UPDATE entries SET date = ?, description = ?, payer = ?, kind = ?, amount = ?,
         category = ?, note = ?, updated_at = datetime('now')
       WHERE id = ? RETURNING *`
    ).bind(e.date, e.description, e.payer, e.kind, e.amount, e.category, e.note, idMatch[1]).first();
    if (!row) throw httpError(404, "Riviä ei löytynyt");
    return json(await withReceiptSummary(env, row));
  }

  if (idMatch && request.method === "DELETE") {
    const [, del] = await env.DB.batch([
      env.DB.prepare("DELETE FROM receipts WHERE entry_id = ?").bind(idMatch[1]),
      env.DB.prepare("DELETE FROM entries WHERE id = ?").bind(idMatch[1]),
    ]);
    if (!del.meta.changes) throw httpError(404, "Riviä ei löytynyt");
    return json({ ok: true });
  }

  // ---------- Tositteet ----------
  if (entryReceipts && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, entry_id, filename, mime, size, reason, created_by, created_at
       FROM receipts WHERE entry_id = ? ORDER BY id`
    ).bind(entryReceipts[1]).all();
    return json(results);
  }

  if (entryReceipts && request.method === "POST") {
    const entryId = entryReceipts[1];
    const entry = await env.DB.prepare("SELECT * FROM entries WHERE id = ?").bind(entryId).first();
    if (!entry) throw httpError(404, "Riviä ei löytynyt");
    const user = cleanUser(request.headers.get("X-User"));
    const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    if (type === "application/json") {
      const body = await request.json();
      const reason = String(body.reason || "").trim().slice(0, 300);
      if (!reason) throw httpError(400, "Kirjoita selite, miksi tositetta ei ole");
      await env.DB.prepare("INSERT INTO receipts (entry_id, reason, created_by) VALUES (?, ?, ?)")
        .bind(entryId, reason, user).run();
    } else {
      const file = await readFile(request, type);
      // Kun tiedosto liitetään, vanhat "ei tositetta" -selitteet ovat turhia.
      await env.DB.batch([
        env.DB.prepare("DELETE FROM receipts WHERE entry_id = ? AND data IS NULL").bind(entryId),
        env.DB.prepare("INSERT INTO receipts (entry_id, filename, mime, size, data, created_by) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(entryId, file.name, file.mime, file.bytes.byteLength, file.bytes, user),
      ]);
    }
    return json(await withReceiptSummary(env, entry), 201);
  }

  if (receiptMatch && request.method === "GET") {
    const r = await env.DB.prepare("SELECT filename, mime, data FROM receipts WHERE id = ? AND data IS NOT NULL")
      .bind(receiptMatch[1]).first();
    if (!r) throw httpError(404, "Tositetta ei löytynyt");
    return fileResponse(r);
  }

  if (receiptMatch && request.method === "DELETE") {
    const r = await env.DB.prepare("DELETE FROM receipts WHERE id = ? RETURNING entry_id").bind(receiptMatch[1]).first();
    if (!r) throw httpError(404, "Tositetta ei löytynyt");
    const entry = await env.DB.prepare("SELECT * FROM entries WHERE id = ?").bind(r.entry_id).first();
    return json(entry ? await withReceiptSummary(env, entry) : { ok: true });
  }

  // ---------- Asiakirjat ----------
  if (path === "/api/documents" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id, title, filename, mime, size, created_by, created_at FROM documents ORDER BY id DESC"
    ).all();
    return json(results);
  }

  if (path === "/api/documents" && request.method === "POST") {
    const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    const file = await readFile(request, type);
    const title = decodeHeader(request.headers.get("X-Title")).trim().slice(0, 120) || file.name;
    const row = await env.DB.prepare(
      `INSERT INTO documents (title, filename, mime, size, data, created_by) VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id, title, filename, mime, size, created_by, created_at`
    ).bind(title, file.name, file.mime, file.bytes.byteLength, file.bytes, cleanUser(request.headers.get("X-User"))).first();
    return json(row, 201);
  }

  if (docMatch && request.method === "GET") {
    const r = await env.DB.prepare("SELECT filename, mime, data FROM documents WHERE id = ?").bind(docMatch[1]).first();
    if (!r) throw httpError(404, "Asiakirjaa ei löytynyt");
    return fileResponse(r);
  }

  // ---------- Asetukset ----------
  if (path === "/api/settings" && request.method === "GET") {
    const r = await env.DB.prepare("SELECT value, updated_by, updated_at FROM settings WHERE key = 'contract'").first();
    return json(r ? { ...JSON.parse(r.value), updated_by: r.updated_by, updated_at: r.updated_at } : {});
  }

  if (path === "/api/settings" && request.method === "PUT") {
    const value = JSON.stringify(validateSettings(await request.json()));
    await env.DB.prepare(
      `INSERT INTO settings (key, value, updated_by, updated_at) VALUES ('contract', ?, ?, datetime('now'))
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
    ).bind(value, cleanUser(request.headers.get("X-User"))).run();
    return json(JSON.parse(value));
  }

  throw httpError(405, "Metodia ei tueta");
}

function validate(body) {
  const e = {
    date: String(body.date || ""),
    description: String(body.description || "").trim().slice(0, 200),
    payer: String(body.payer || ""),
    kind: String(body.kind || ""),
    amount: Math.round(Number(body.amount) * 100) / 100,
    category: String(body.category || "Muut").trim().slice(0, 60),
    note: body.note ? String(body.note).slice(0, 500) : null,
    created_by: body.created_by ? String(body.created_by).slice(0, 40) : null,
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw httpError(400, "Päivämäärä puuttuu tai on väärässä muodossa");
  if (!e.description) throw httpError(400, "Kuvaus puuttuu");
  if (!KINDS.includes(e.kind)) throw httpError(400, "Tuntematon tapahtumatyyppi");
  if (!PAYERS.includes(e.payer)) throw httpError(400, "Tuntematon maksaja");
  if (!Number.isFinite(e.amount) || e.amount === 0) throw httpError(400, "Summa puuttuu");
  return e;
}

async function withReceiptSummary(env, entry) {
  const r = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM receipts WHERE entry_id = ?1 AND data IS NOT NULL) AS receipt_files,
       (SELECT reason FROM receipts WHERE entry_id = ?1 AND reason IS NOT NULL ORDER BY id DESC LIMIT 1) AS receipt_reason`
  ).bind(entry.id).first();
  return { ...entry, ...r };
}

async function readFile(request, type) {
  if (!FILE_TYPES.test(type)) throw httpError(415, "Vain kuvat ja PDF-tiedostot kelpaavat");
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) throw httpError(400, "Tiedosto on tyhjä");
  if (bytes.byteLength > MAX_FILE_BYTES) throw httpError(413, "Tiedosto on liian suuri (enintään 1,9 Mt)");
  const name = decodeHeader(request.headers.get("X-Filename")).replace(/[\\/\r\n"]/g, "_").slice(0, 120) || "tosite";
  return { bytes, mime: type, name };
}

function fileResponse(r) {
  return new Response(r.data instanceof ArrayBuffer ? r.data : new Uint8Array(r.data), {
    headers: {
      "Content-Type": r.mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(r.filename)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

function decodeHeader(v) {
  try { return decodeURIComponent(v || ""); } catch { return v || ""; }
}

function cleanUser(v) {
  return v ? decodeHeader(v).slice(0, 40) : null;
}

function validateSettings(body) {
  const num = (v, def) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Math.round(Number(v) * 100) / 100 : def);
  const owners = ["Santtu", "Vili", "Urpo"];
  const responsibles = (Array.isArray(body.responsibles) ? body.responsibles : [])
    .map((r) => ({ from: String(r.from || ""), until: /^\d{4}-\d{2}-\d{2}$/.test(r.until) ? r.until : null, who: String(r.who || "") }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.from) && owners.includes(r.who) && (!r.until || r.until >= r.from))
    .sort((a, b) => a.from.localeCompare(b.from))
    .slice(0, 50);
  const l = body.limits || {};
  return {
    responsibles,
    bookkeeper: owners.includes(body.bookkeeper) ? body.bookkeeper : null,
    eraStart: /^\d{4}-\d{2}-\d{2}$/.test(body.eraStart) ? body.eraStart : null,
    limits: {
      settleLimit: num(l.settleLimit, 500),
      buffer: num(l.buffer, 100),
      handlerShare: Math.min(100, Math.max(0, num(l.handlerShare, 50))),
      rentPayoutFrom: num(l.rentPayoutFrom, 2000),
      rentKeep: num(l.rentKeep, 1400),
    },
  };
}

function authorized(request, env) {
  const header = request.headers.get("Authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = env.APP_PASSWORD || "";
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0] || "",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Filename, X-Title, X-User",
    "Access-Control-Expose-Headers": "Content-Disposition",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
