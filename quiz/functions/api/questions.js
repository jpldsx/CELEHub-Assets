// GET /api/questions?topic=mstc&n=25  ->  random questions WITHOUT the answers. Needs the visitor session.
import { TOPICS, LIMITS, init, readSession, json, fail } from "../_lib/quiz-core.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB) return fail(500, "Database is not connected.");
  if (!(await readSession(request, env))) return fail(401, "Please finish the quick check first.");
  const u = new URL(request.url);
  const topic = (u.searchParams.get("topic") || "").toLowerCase();
  if (!TOPICS.includes(topic)) return fail(400, "Unknown topic.");
  const n = [10, 25, 50].includes(+u.searchParams.get("n")) ? +u.searchParams.get("n") : 10;
  await init(env.DB);
  const rows = (await env.DB.prepare("SELECT n, q, choices FROM questions WHERE topic = ? AND hidden = 0 ORDER BY RANDOM() LIMIT ?")
    .bind(topic, Math.min(n, LIMITS.perExam)).all()).results || [];
  if (!rows.length) return fail(404, "No questions in this topic yet.");
  return json({ ok: true, topic, questions: rows.map((r) => ({ id: r.n, q: r.q, c: JSON.parse(r.choices) })) });
}
