// GET /api/questions?topic=mstc&n=25  ->  random questions WITHOUT the answers. Needs the visitor session.
import { TOPICS, LIMITS, init, readSession, json, fail } from "../_lib/quiz-core.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB) return fail(500, "Database is not connected.");
  if (!(await readSession(request, env))) return fail(401, "Please finish the quick check first.");
  const u = new URL(request.url);
  const topic = (u.searchParams.get("topic") || "").toLowerCase();
  if (!TOPICS.includes(topic)) return fail(400, "Unknown topic.");
  const n = Math.min(LIMITS.perExam, Math.max(1, parseInt(u.searchParams.get("n"), 10) || 25));
  const subs = (u.searchParams.get("sub") || "").split("|").map((x) => x.trim().slice(0, 60)).filter(Boolean).slice(0, 25);
  await init(env.DB);
  const rows = (await env.DB.prepare("SELECT n, q, choices, sub FROM questions WHERE topic = ? AND hidden = 0" + (subs.length ? " AND sub IN (" + subs.map(() => "?").join(",") + ")" : "") + " ORDER BY RANDOM() LIMIT ?")
    .bind(topic, ...subs, Math.min(n, LIMITS.perExam)).all()).results || [];
  if (!rows.length) return fail(404, "No questions in this topic yet.");
  return json({ ok: true, topic, questions: rows.map((r) => ({ id: r.n, q: r.q, c: JSON.parse(r.choices), sub: r.sub || "" })) });
}
