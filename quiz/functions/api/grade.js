// POST /api/grade  { answers: { "<id>": index | null, ... } }  ->  the review, with the right answers. Needs the visitor session.
import { LIMITS, init, readSession, json, fail } from "../_lib/quiz-core.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB) return fail(500, "Database is not connected.");
  if (!(await readSession(request, env))) return fail(401, "Please finish the quick check first.");
  let body; try { body = await request.json(); } catch { return fail(400, "Bad request."); }
  const answers = body && typeof body.answers === "object" && body.answers ? body.answers : null;
  const ids = answers ? Object.keys(answers).map(Number).filter((x) => Number.isInteger(x) && x > 0) : [];
  if (!ids.length || ids.length > LIMITS.perExam) return fail(400, "Bad request.");
  await init(env.DB);
  const rows = (await env.DB.prepare(`SELECT n, q, choices, ans, expl FROM questions WHERE n IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results || [];
  const byId = new Map(rows.map((r) => [r.n, r]));
  let score = 0;
  const results = ids.map((id) => {
    const r = byId.get(id);
    if (!r) return null;
    const p = answers[id];
    const pick = Number.isInteger(p) ? p : null;
    const correct = pick === r.ans;
    if (correct) score++;
    return { id, q: r.q, c: JSON.parse(r.choices), ans: r.ans, expl: r.expl, pick, correct };
  }).filter(Boolean);
  return json({ ok: true, score, total: results.length, results });
}
