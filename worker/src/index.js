// Paapelin kirjanpito – API (Cloudflare Worker + D1)
//
// GET    /api/health           ilman tunnistautumista
// GET    /api/entries          kaikki rivit
// POST   /api/entries          uusi rivi
// PUT    /api/entries/:id      muokkaa riviä
// DELETE /api/entries/:id      poista rivi
//
// Kaikki /api/entries-kutsut vaativat otsakkeen "Authorization: Bearer <APP_PASSWORD>".

const KINDS = ["shared", "deposit", "account", "income"];
const PAYERS = ["Santtu", "Vili", "Urpo", "Tili", "Vuokratulot"];

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

  if (!path.startsWith("/api/entries")) throw httpError(404, "Ei löytynyt");
  if (!authorized(request, env)) throw httpError(401, "Väärä salasana");

  const idMatch = path.match(/^\/api\/entries\/(\d+)$/);

  if (path === "/api/entries" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT * FROM entries ORDER BY date DESC, id DESC"
    ).all();
    return json(results);
  }

  if (path === "/api/entries" && request.method === "POST") {
    const e = validate(await request.json());
    const row = await env.DB.prepare(
      `INSERT INTO entries (date, description, payer, kind, amount, category, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    ).bind(e.date, e.description, e.payer, e.kind, e.amount, e.category, e.note, e.created_by).first();
    return json(row, 201);
  }

  if (idMatch && request.method === "PUT") {
    const e = validate(await request.json());
    const row = await env.DB.prepare(
      `UPDATE entries SET date = ?, description = ?, payer = ?, kind = ?, amount = ?,
         category = ?, note = ?, updated_at = datetime('now')
       WHERE id = ? RETURNING *`
    ).bind(e.date, e.description, e.payer, e.kind, e.amount, e.category, e.note, idMatch[1]).first();
    if (!row) throw httpError(404, "Riviä ei löytynyt");
    return json(row);
  }

  if (idMatch && request.method === "DELETE") {
    const { meta } = await env.DB.prepare("DELETE FROM entries WHERE id = ?").bind(idMatch[1]).run();
    if (!meta.changes) throw httpError(404, "Riviä ei löytynyt");
    return json({ ok: true });
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
