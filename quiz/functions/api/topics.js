// GET /api/topics  ->  { ok, topics: { hpge: 120, mstc: 80, psad: 45 } }   (how many questions each topic has)
import { TOPICS, init, json, fail } from "../_lib/quiz-core.js";

export async function onRequestGet({ env }) {
  if (!env.DB) return fail(500, "Database is not connected.");
  await init(env.DB);
  const rows = (await env.DB.prepare("SELECT topic, COUNT(*) AS c FROM questions WHERE hidden = 0 GROUP BY topic").all()).results || [];
  const topics = {};
  for (const t of TOPICS) topics[t] = 0;
  for (const r of rows) if (r.topic in topics) topics[r.topic] = r.c;
  return json({ ok: true, topics }, 200, { "Cache-Control": "public, max-age=30" });
}
