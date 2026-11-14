// POST /api/contribute  { topic, sub, q, choices:[A,B,C,D], ans:0-3, solution, source?, website? }
// A visitor sends a question with its answer key and solution. It is stored as "pending" and sent to your Telegram
// with Approve / Reject buttons. Nothing reaches the bank until you approve it.
// Needs the visitor session. Max 5 per visitor per day. Uses D1 (DB), TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
import { TOPICS, TOPIC_NAME, LIMITS, init, clean, readSession, normText, nearestQuestion, subCard, subButtons, tgSend, esc, json, fail } from "../_lib/quiz-core.js";

const PER_DAY = 5;

export async function onRequestPost({ request, env }) {
  if (!env.DB) return fail(500, "Database is not connected.");
  const ses = await readSession(request, env);
  if (!ses) return fail(401, "Please finish the quick check first.");
  let b; try { b = await request.json(); } catch { return fail(400, "Bad request."); }
  if (b && b.website) return json({ ok: true });                                   // hidden field: bots only
  const topic = String((b && b.topic) || "").toLowerCase();
  if (!TOPICS.includes(topic)) return fail(400, "Choose a subject.");
  const q = clean(b.q, LIMITS.question + 1), sol = clean(b.solution, LIMITS.explain + 1), source = clean(b.source, 200), sub = clean(b.sub, 60);
  const choices = Array.isArray(b.choices) ? b.choices.slice(0, 4).map((c) => clean(c, LIMITS.choice + 1)) : [];
  const ans = Number(b.ans);
  if (q.length < 15) return fail(400, "Write the full problem (at least a sentence).");
  if (q.length > LIMITS.question) return fail(400, "The problem is too long (max " + LIMITS.question + " characters).");
  if (choices.length !== 4 || choices.some((c) => !c)) return fail(400, "Fill in all four choices.");
  if (choices.some((c) => c.length > LIMITS.choice)) return fail(400, "A choice is too long (max " + LIMITS.choice + " characters).");
  if (new Set(choices.map((c) => c.toLowerCase())).size !== 4) return fail(400, "Two choices are the same.");
  if (![0, 1, 2, 3].includes(ans)) return fail(400, "Mark which choice is correct.");
  if (sol.length < 30) return fail(400, "Show your solution step by step so the admin can verify it (at least a few lines).");
  if (sol.length > LIMITS.explain) return fail(400, "The solution is too long (max " + LIMITS.explain + " characters).");

  await init(env.DB);
  const day = await env.DB.prepare("SELECT COUNT(*) AS c FROM submissions WHERE sid = ? AND created > ?").bind(String(ses.n), Date.now() - 86400000).first();
  if (day && day.c >= PER_DAY) return fail(429, "You've sent " + PER_DAY + " questions today. Thank you! Please come back tomorrow.");
  const k = normText(q);
  const have = (await env.DB.prepare("SELECT q FROM questions WHERE topic = ? AND hidden = 0").bind(topic).all()).results || [];
  if (have.some((r) => normText(r.q) === k)) return fail(409, "That question is already in the bank.");
  const wait = (await env.DB.prepare("SELECT q FROM submissions WHERE topic = ? AND status = 'pending'").bind(topic).all()).results || [];
  if (wait.some((r) => normText(r.q) === k)) return fail(409, "Someone already sent that question. Thank you!");

  const near = await nearestQuestion(env.DB, topic, q);
  const r = await env.DB.prepare("INSERT INTO submissions (sid, topic, sub, q, choices, ans, sol, source, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(String(ses.n), topic, sub, q, JSON.stringify(choices), ans, sol, source, Date.now()).run();
  const id = r.meta.last_row_id;
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const warn = near && near.score >= 0.5 ? "\n\n⚠️ <b>Looks similar to #" + near.n + "</b> (" + Math.round(near.score * 100) + "% of the words):\n<i>" + esc(String(near.q).slice(0, 220)) + "</i>" : "";
    await tgSend(env, env.TELEGRAM_CHAT_ID, subCard({ id, sid: ses.n, topic, sub, q, choices: JSON.stringify(choices), ans, sol, source }, warn), subButtons(id));
  }
  return json({ ok: true });
}
