// GET /api/topics  ->  { ok, topics: { hpge: 120, mstc: 80, psad: 45 } }   (how many questions each topic has)
import { TOPICS, init, json, fail } from "../_lib/quiz-core.js";

export async function onRequestGet({ env }) {
  if (!env.DB) return fail(500, "Database is not connected.");
  await init(env.DB);
  const rows = (await env.DB.prepare("SELECT topic, COUNT(*) AS c FROM questions WHERE hidden = 0 GROUP BY topic").all()).results || [];
  const topics = {};
  for (const t of TOPICS) topics[t] = 0;
  for (const r of rows) if (r.topic in topics) topics[r.topic] = r.c;
  const sr = (await env.DB.prepare("SELECT topic, sub, COUNT(*) AS c FROM questions WHERE hidden = 0 AND sub != '' GROUP BY topic, sub ORDER BY sub").all()).results || [];
  const subs = {};
  for (const t of TOPICS) subs[t] = {};
  for (const r of sr) if (r.topic in subs) subs[r.topic][r.sub] = r.c;
  return json({ ok: true, topics, subs }, 200, { "Cache-Control": "public, max-age=30" });
}
