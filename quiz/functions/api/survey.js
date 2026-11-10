const ADULT_AGE = 18;
const SESSION_VERSION = 3; 

const COOKIE = "ct_session";
const MAX_AGE = 60 * 60 * 24 * 365;

const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
const fail = (status, message, headers) => json({ ok: false, message }, status, headers);

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const clean = (s, max) =>
  String(s || "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/* ---------- signed session cookie (HMAC-SHA256) ---------- */
const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmacKey(env, usage) {
  const secret = env.SESSION_SECRET || env.TURNSTILE_SECRET_KEY;
  if (!secret) return null;
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode("celetube-session|" + secret),
    { name: "HMAC", hash: "SHA-256" }, false, usage
  );
}
async function signSession(env, data) {
  const key = await hmacKey(env, ["sign"]);
  if (!key) return null;
  const p = b64u(new TextEncoder().encode(JSON.stringify(data)));
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(p));
  return p + "." + b64u(sig);
}
async function readSession(request, env) {
  const m = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  if (!m) return null;
  const [p, sig] = m[1].split(".");
  if (!p || !sig) return null;
  try {
    const key = await hmacKey(env, ["verify"]);
    if (!key) return null;
    const ok = await crypto.subtle.verify("HMAC", key, unb64u(sig), new TextEncoder().encode(p));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(unb64u(p)));
    return data && data.v === SESSION_VERSION && typeof data.n === "string" && data.n ? data : null;
  } catch { return null; }
}
const cookieHeader = (request, value, maxAge) =>
  `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax` +
  (new URL(request.url).protocol === "https:" ? "; Secure" : "");

const NAME_PHRASES = ["juan dela cruz","juan de la cruz","john doe","jane doe","full name","first last","first name last name","your name","my name","no name","mickey mouse","lorem ipsum","juan tamad","name name","last name","first name","santa claus","donald duck","harry potter"];
const NAME_WORDS = ["test","tester","testing","asdf","asdfgh","qwerty","admin","anonymous","anon","unknown","none","name","fullname","firstname","lastname","sample","fake","lorem","ipsum","batman","superman","spiderman","ironman","naruto","hello","hehe","haha","hahaha","lol","fuck","fucker","shit","bitch","puta","putang","putangina","tangina","gago","gaga","ulol","pakyu","dick","pussy","asshole","nigger"];
const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
function nameProblem(raw) {
  const bad = "That doesn't look like a real name. Please enter your real first and last name.";
  const n = String(raw || "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!/^[\p{L}][\p{L}\p{M}'’.\- ]*$/u.test(n)) return "Please type your real name using letters only (no numbers or symbols).";
  const words = n.split(" ");
  const core = words.filter((w) => !/^(jr|sr|ii|iii|iv)\.?$/i.test(w));
  if (core.length < 2) return "Please enter your first name and last name.";
  const flat = n.toLowerCase().replace(/[.'’\-]/g, "").replace(/\s+/g, " ");
  if (NAME_PHRASES.includes(flat)) return bad;
  if (/(\p{L})\1\1/iu.test(core.join(" "))) return bad;
  if (new Set(core.map((w) => w.toLowerCase())).size === 1) return bad;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^(jr|sr|ii|iii|iv)\.?$/i.test(w)) continue;
    const letters = w.replace(/[^\p{L}]/gu, "");
    const ends = i === 0 || i === words.length - 1;
    if (!letters) return bad;
    if (letters.length < 2 && (ends || !/\.$/.test(w))) return bad;
    const plain = letters.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    if (NAME_WORDS.includes(plain)) return bad;
    if (/^[a-z]+$/.test(plain)) {
      if (plain.length >= 3 && !/[aeiouy]/.test(plain)) return bad;
      if (/[^aeiouy]{5,}/.test(plain)) return bad;
      if (plain.length >= 4 && KEY_ROWS.some((r) => r.includes(plain) || [...r].reverse().join("").includes(plain))) return bad;
    }
    if (plain.length >= 5 && new Set(plain).size <= 2) return bad;
  }
  return "";
}

function placeProblem(raw, what) {
  const t = String(raw || "").trim();
  const plain = t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const msg = "Please enter a real " + what + " (type \"None\" if you don't have one).";
  if (/^(none|n\/a|na|no|nothing)$/i.test(t)) return what === "review center" ? "" : msg;
  if ((t.match(/\p{L}/gu) || []).length < 2) return msg;
  if (/(.)\1\1\1/u.test(t) || /(\p{L})\1\1/iu.test(t)) return msg;
  if (plain.length >= 4 && KEY_ROWS.some((r) => r.includes(plain))) return msg;
  return "";
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

let ready = false;
async function init(db) {
  if (ready) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, fp TEXT, created_at INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_visitors_fp ON visitors(fp)"),
  ]);
  ready = true;
}

async function fingerprint(env, fullName, school) {
  const norm = (x) =>
    x.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const key = await hmacKey(env, ["sign"]);
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("fp|" + norm(fullName) + "|" + norm(school)))
  );
  return [...sig.slice(0, 12)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function randomCode() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (x) => CROCKFORD[x & 31]).join("");
}

async function issueVisitorId(db, fp) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const id = randomCode();
    const taken = await db.prepare("SELECT 1 AS x FROM visitors WHERE id = ?").bind(id).first();
    if (taken) continue;
    try {
      await db.prepare("INSERT INTO visitors (id, fp, created_at) VALUES (?, ?, ?)").bind(id, fp, Date.now()).run();
      return id;
    } catch { /* someone grabbed it first -> try another code */ }
  }
  return null;
}

const sameSite = (request) => {
  const origin = request.headers.get("Origin");
  return !origin || new URL(origin).host === new URL(request.url).host;
};

/* ------------------------------ GET ------------------------------ */
export async function onRequestGet({ request, env }) {
  const s = await readSession(request, env);
  return json({ ok: true, name: s ? s.n : null });
}

/* ------------------------------ POST ----------------------------- */
export async function onRequestPost({ request, env }) {
  if (!env.TURNSTILE_SECRET_KEY || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID || !env.DB) {
    return fail(500, "The site is not fully set up yet. Please try again later.");
  }
  if (!sameSite(request)) return fail(403, "Forbidden");

  let data;
  try { data = await request.json(); } catch { return fail(400, "Bad request"); }
  if (data.website) return json({ ok: true, name: "Visitor ID 00000" });

  const fullName = clean(data.fullName, 80);
  const school = clean(data.school, 100);
  const reviewCenter = clean(data.reviewCenter, 100);
  const age = parseInt(data.age, 10);

  if (fullName.length < 2 || !school || !reviewCenter) return fail(400, "Please fill in every field.");
  if (!(age >= 5 && age <= 99)) return fail(400, "Please enter a valid age.");
  if (age < ADULT_AGE) {
    return json({ ok: false, minor: true, message: "This site is for ages 18 and up." }, 403);
  }
  const nameIssue = nameProblem(fullName);
  if (nameIssue) return fail(400, nameIssue);
  const schoolIssue = placeProblem(school, "school");
  if (schoolIssue) return fail(400, schoolIssue);
  const centerIssue = placeProblem(reviewCenter, "review center");
  if (centerIssue) return fail(400, centerIssue);
  if (data.consent !== true) return fail(400, "Please tick the box to continue.");

  const token = String(data.turnstileToken || "");
  if (!token || token.length > 2048) return fail(400, "Please complete the security check.");
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (ip) body.set("remoteip", ip);
  let verified = false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    verified = !!(await r.json()).success;
  } catch { return fail(502, "Couldn't run the security check. Please try again."); }
  if (!verified) return fail(403, "Security check failed. Please try again.");

  await init(env.DB);
  const fp = await fingerprint(env, fullName, school);
  const before = ((await env.DB.prepare("SELECT id FROM visitors WHERE fp = ? ORDER BY created_at LIMIT 5").bind(fp).all()).results || [])
    .map((r) => r.id);
  const id = await issueVisitorId(env.DB, fp);
  if (!id) return fail(500, "Couldn't create your visitor ID. Please try again.");
  const name = `Visitor ID ${id}`;

  const text =
    `📝 <b>New CELEHub Visitor</b>\n\n` +
    `🆔 <b>Visitor ID:</b> ${id}\n` +
    `👤 <b>Name:</b> ${esc(fullName)}\n` +
    `🎂 <b>Age:</b> ${age}\n` +
    `🏫 <b>School:</b> ${esc(school)}\n` +
    `📚 <b>Review Center:</b> ${esc(reviewCenter)}` +
    (before.length ? `\n\nℹ️ Same name + school registered before as: ${before.join(", ")}` : "");
  try {
    const tg = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!tg.ok) throw new Error("telegram " + tg.status);
  } catch {
    await env.DB.prepare("DELETE FROM visitors WHERE id = ?").bind(id).run().catch(() => {});
    return fail(502, "Couldn't save your answers right now. Please try again.");
  }
  
  const value = await signSession(env, { n: name, v: SESSION_VERSION, iat: Date.now() });
  return json({ ok: true, name }, 200, { "Set-Cookie": cookieHeader(request, value, MAX_AGE) });
}

/* ----------------------------- DELETE ---------------------------- */
export async function onRequestDelete({ request, env }) {
  if (!sameSite(request)) return fail(403, "Forbidden");
  const clear = { "Set-Cookie": cookieHeader(request, "", 0) };
  if (new URL(request.url).searchParams.get("erase") !== "1") return json({ ok: true }, 200, clear);

  const s = await readSession(request, env);
  const m = s && /^Visitor ID ([0-9A-Z]{5})$/.exec(s.n);
  if (!m || !env.DB) {
    return json({ ok: false, message: "We could not find your visit on this device. Please email us your Visitor ID and we will delete your data by hand." }, 404, clear);
  }
  const id = m[1], name = s.n;
  try {
    
    await env.DB.batch([
      env.DB.prepare("DELETE FROM comments WHERE parent_id IN (SELECT id FROM comments WHERE name = ? AND parent_id IS NULL)").bind(name),
      env.DB.prepare("DELETE FROM comments WHERE name = ?").bind(name),
    ]).catch(() => {});
    await env.DB.prepare("DELETE FROM visitors WHERE id = ?").bind(id).run().catch(() => {});
  } catch {
    return fail(500, "Something went wrong while deleting. Please email us your Visitor ID.");
  }
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID, parse_mode: "HTML", disable_web_page_preview: true,
          text: `🗑 <b>Data deletion request</b>\n🆔 Visitor ID: ${id}\nTheir ID, comments and replies were deleted from the database. Please also delete their survey message in this chat (search for the ID).`,
        }),
      });
    } catch { /* the database part is already done */ }
  }
  return json({ ok: true }, 200, clear);
}

export const onRequest = () => fail(405, "Method not allowed");   // other methods
