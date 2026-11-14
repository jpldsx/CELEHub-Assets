// Shared code for the quiz: database, the signed visitor session, and the question parser.
// Used by functions/api/*.js. This file has no route of its own.

export const TOPICS = ["hpge", "mstc", "psad"];                 // add a topic here AND in js/config.js
export const TOPIC_NAME = { hpge: "HPGE", mstc: "MSTC", psad: "PSAD" };
export const LIMITS = { question: 1500, choice: 400, explain: 2000, minChoices: 2, maxChoices: 6, perExam: 100 };

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const clean = (s, max) => String(s || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, max);
export const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });
export const fail = (status, message) => json({ ok: false, message }, status);

/* ---------------- database ---------------- */
let ready = false;
export async function init(db) {
  if (ready) return;
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS questions (n INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT NOT NULL, q TEXT NOT NULL, choices TEXT NOT NULL, " +
      "ans INTEGER NOT NULL, expl TEXT NOT NULL DEFAULT '', hidden INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)"
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions (topic, hidden)"),
    db.prepare("CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, sid TEXT NOT NULL, topic TEXT NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL, mock INTEGER NOT NULL DEFAULT 0, t INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_attempts_t ON attempts (t)"),
  ]);
    try { await db.prepare("ALTER TABLE questions ADD COLUMN sub TEXT NOT NULL DEFAULT ''").run(); } catch { /* already there */ }
    ready = true;
}

/* ---------------- the visitor session (the same signed cookie the survey sets) ---------------- */
const COOKIE = "ct_session";
const SESSION_VERSION = 3;                       // must match functions/api/survey.js
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
export async function readSession(request, env) {
  const m = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  if (!m) return null;
  const [p, sig] = m[1].split(".");
  const secret = env.SESSION_SECRET || env.TURNSTILE_SECRET_KEY;
  if (!p || !sig || !secret) return null;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("celetube-session|" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!(await crypto.subtle.verify("HMAC", key, unb64u(sig), new TextEncoder().encode(p)))) return null;
    const data = JSON.parse(new TextDecoder().decode(unb64u(p)));
    return data && data.v === SESSION_VERSION && typeof data.n === "string" && data.n ? data : null;
  } catch { return null; }
}

/* ---------------- reading questions typed in Telegram ----------------
   One message (or a .txt file) can hold many questions:

     1. What is the SI unit of force?
     A. Joule
     B. Newton
     C. Pascal
     D. Watt
     Answer: B
     Explanation: F = ma, so the unit is kg*m/s^2 = newton.

   Question starts:  "1." "1)" "Q1." "Q:" "Question 1:"      (or just a blank line between questions)
   Choices:          "A." "A)" "A:" "(A)"  ... up to F
   Key:              "Answer: B"  "Ans B"  "Key: B"  "Correct: B"
   Explanation:      "Explanation: ..." "Solution: ..." "Rationale: ..." (may continue on the next lines)
   Returns { items: [{ q, choices, ans, expl }], errors: ["Question 3: ..."] }  */
const Q_START = /^\s*(?:q(?:uestion)?\s*\d*\s*[:.)\-]|\d{1,4}\s*[.)])\s*(.*)$/i;
const CHOICE = /^\s*\(?([A-Fa-f])\s*[.):\-]\s+(.*)$/;
const KEY = /^\s*(?:ans(?:wer)?|key|correct(?:\s+answer)?)\s*[:=\-]?\s*\(?([A-Fa-f])\)?\s*(?:[.)\-:].*)?$/i;
const SUB = /^\s*(?:sub(?:topic)?|category)\s*[:=]\s*(.+)$/i;
const EXPL = /^\s*(?:expl(?:anation)?|solution|sol|rationale|why|reason)\s*[:=\-]\s*(.*)$/i;

export function parseQuestions(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let cur = null, last = "q";
  const start = (first) => { cur = { q: first || "", choices: [], letters: [], key: "", expl: "", sub: "", sawChoice: false }; blocks.push(cur); last = "q"; };
  const complete = (b) => b && b.choices.length >= 2 && b.key;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (cur && complete(cur)) cur = null; continue; }               // a blank line after a finished question ends it
    let m;
    if ((m = line.match(KEY)) && cur && cur.choices.length) { cur.key = m[1].toUpperCase(); last = "key"; continue; }
    if ((m = line.match(SUB)) && cur && cur.choices.length) { cur.sub = m[1]; last = "sub"; continue; }
    if ((m = line.match(EXPL)) && cur) { cur.expl = m[1]; last = "expl"; continue; }
    if ((m = line.match(CHOICE)) && cur && (cur.q || cur.choices.length)) {
      const L = m[1].toUpperCase();
      if (!cur.letters.includes(L)) { cur.letters.push(L); cur.choices.push(m[2]); cur.sawChoice = true; last = "choice"; continue; }
    }
    if ((m = line.match(Q_START)) && !(cur && last === "q" && !cur.q.length && false)) {
      const startsNew = !cur || cur.sawChoice || cur.key || (cur.q && /^(?:q(?:uestion)?\s*\d*\s*[:.)\-])/i.test(line)) || /^\d{1,4}\s*[.)]/.test(line);
      if (startsNew) { start(m[1]); continue; }
    }
    if (!cur) start("");
    // a continuation line of whatever came last
    if (last === "q") cur.q += (cur.q ? " " : "") + line;
    else if (last === "choice") cur.choices[cur.choices.length - 1] += " " + line;
    else if (last === "expl") cur.expl += " " + line;
  }
  const items = [], errors = [];
  blocks.forEach((b, i) => {
    const tag = "Question " + (i + 1);
    const q = clean(b.q, LIMITS.question + 1);
    if (!q) return errors.push(`${tag}: no question text.`);
    if (q.length > LIMITS.question) return errors.push(`${tag}: the question is too long (max ${LIMITS.question} characters).`);
    if (b.choices.length < LIMITS.minChoices) return errors.push(`${tag} ("${q.slice(0, 40)}…"): I need at least 2 choices (A. B. ...).`);
    if (b.choices.length > LIMITS.maxChoices) return errors.push(`${tag}: at most ${LIMITS.maxChoices} choices.`);
    if (b.letters.some((L, k) => L !== "ABCDEF"[k])) return errors.push(`${tag} ("${q.slice(0, 40)}…"): the choices must go A, B, C ... in order.`);
    if (!b.key) return errors.push(`${tag} ("${q.slice(0, 40)}…"): the answer is missing. Add a line like  Answer: B`);
    const ans = "ABCDEF".indexOf(b.key);
    if (ans < 0 || ans >= b.choices.length) return errors.push(`${tag} ("${q.slice(0, 40)}…"): the answer ${b.key} is not one of the choices.`);
    const choices = b.choices.map((c) => clean(c, LIMITS.choice + 1));
    if (choices.some((c) => !c)) return errors.push(`${tag}: a choice is empty.`);
    if (choices.some((c) => c.length > LIMITS.choice)) return errors.push(`${tag}: a choice is too long (max ${LIMITS.choice} characters).`);
    if (new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) return errors.push(`${tag} ("${q.slice(0, 40)}…"): two choices are identical.`);
    const expl = clean(b.expl, LIMITS.explain + 1);
    if (expl.length > LIMITS.explain) return errors.push(`${tag}: the explanation is too long (max ${LIMITS.explain} characters).`);
    items.push({ q, choices, ans, expl, sub: clean(b.sub, 60) });
  });
  return { items, errors };
}

const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
   // adds the parsed questions; skips ones already in that topic (but fills in a missing/changed subtopic). Returns { added: [n...], dup, updated }
   export async function addQuestions(db, topic, items) {
     const have = new Map(((await db.prepare("SELECT n, q, sub FROM questions WHERE topic = ? AND hidden = 0").bind(topic).all()).results || []).map((r) => [norm(r.q), r]));
     const added = []; let dup = 0; const fresh = [], upd = [];
     for (const it of items) {
       const k = norm(it.q), ex = have.get(k);
       if (ex) { dup++; if (it.sub && ex.n && ex.sub !== it.sub) { upd.push(db.prepare("UPDATE questions SET sub = ? WHERE n = ?").bind(it.sub, ex.n)); ex.sub = it.sub; } continue; }
       have.set(k, { n: 0, sub: it.sub }); fresh.push(it);
     }
     const now = Date.now();
     for (let i = 0; i < fresh.length; i += 40) {
       const res = await db.batch(fresh.slice(i, i + 40).map((it) =>
         db.prepare("INSERT INTO questions (topic, q, choices, ans, expl, hidden, created, sub) VALUES (?, ?, ?, ?, ?, 0, ?, ?)")
           .bind(topic, it.q, JSON.stringify(it.choices), it.ans, it.expl, now, it.sub || "")));
       for (const r of res) added.push(r.meta.last_row_id);
     }
     for (let i = 0; i < upd.length; i += 40) await db.batch(upd.slice(i, i + 40));
     return { added, dup, updated: upd.length };
   }

export async function tgSend(env, chatId, text, extra = {}) {
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra }),
    });
  } catch { /* nothing else to do */ }
}

/* ---------------- the activity report (daily to Telegram, or /report) ---------------- */
export async function buildReport(env, hours = 24) {
  const db = env.DB, since = Date.now() - hours * 3600 * 1000;
  const one = async (sql, ...b) => (await db.prepare(sql).bind(...b).first()) || {};
  const all = async (sql, ...b) => (await db.prepare(sql).bind(...b).all()).results || [];
  const tot = await one("SELECT COUNT(*) AS n, COUNT(DISTINCT sid) AS v FROM attempts WHERE t >= ?", since);
  const mock = await one("SELECT COUNT(*) AS n, SUM(CASE WHEN score * 100 >= total * 70 THEN 1 ELSE 0 END) AS p FROM attempts WHERE mock = 1 AND t >= ?", since);
  const per = await all("SELECT topic, COUNT(*) AS n, SUM(score) AS s, SUM(total) AS q FROM attempts WHERE t >= ? GROUP BY topic", since);
  let fresh = 0; try { fresh = (await one("SELECT COUNT(*) AS n FROM visitors WHERE created_at >= ?", since)).n || 0; } catch { /* table not created yet */ }
  const banks = await all("SELECT topic, COUNT(*) AS c FROM questions WHERE hidden = 0 GROUP BY topic");
  const by = Object.fromEntries(per.map((r) => [r.topic, r])), bank = Object.fromEntries(banks.map((r) => [r.topic, r.c]));
  const lines = TOPICS.map((t) => {
    const r = by[t];
    return `${TOPIC_NAME[t]}: ` + (r ? `${r.n} quiz${r.n === 1 ? "" : "zes"} · avg ${r.q ? Math.round(r.s / r.q * 100) : 0}%` : "no quizzes") + ` · bank ${bank[t] || 0}`;
  });
  return `\u{1F4CA} <b>CELEHub Quiz \u00b7 last ${hours} hours</b>\n\n` +
    `New visitors: <b>${fresh}</b>\nVisitors who finished a quiz: <b>${tot.v || 0}</b>\nQuizzes finished: <b>${tot.n || 0}</b>\n` +
    `Mock board exams: <b>${mock.n || 0}</b>` + (mock.n ? ` (${mock.p || 0} reached 70%)` : "") + `\n\n` + lines.join("\n");
}
