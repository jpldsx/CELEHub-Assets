// POST /api/support  { topic, kind, message, qid? }  ->  sends the visitor's note to the admin's Telegram.
// Needs the visitor session (they finished the quick survey). Max 5 notes per visitor per hour.
// Uses D1 (DB), TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
import { TOPICS, TOPIC_NAME, init, esc, clean, readSession, json, fail } from "../_lib/quiz-core.js";

const KINDS = { key: "Wrong answer key", choice: "Mistake in a choice", question: "Unclear or wrong question", other: "Something else" };
const PER_HOUR = 5;

export async function onRequestPost({ request, env }) {
  if (!env.DB) return fail(500, "Database is not connected.");
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return fail(500, "Support is not available right now.");
  const ses = await readSession(request, env);
  if (!ses) return fail(401, "Please finish the quick check first.");
  let b; try { b = await request.json(); } catch { return fail(400, "Bad request."); }
  const topic = String((b && b.topic) || "").toLowerCase(), kind = String((b && b.kind) || "");
  const message = clean(b && b.message, 600), qid = Number(b && b.qid);
  if (!TOPICS.includes(topic) || !KINDS[kind]) return fail(400, "Bad request.");
  if (message.length < 5) return fail(400, "Please write a few words about the problem.");

  await init(env.DB);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS support_log (sid TEXT NOT NULL, t INTEGER NOT NULL)").run();
  const since = Date.now() - 3600 * 1000;
  const used = await env.DB.prepare("SELECT COUNT(*) AS c FROM support_log WHERE sid = ? AND t > ?").bind(ses.n, since).first();
  if (used && used.c >= PER_HOUR) return fail(429, "You've sent a few messages already. Please try again later.");

  let qline = "";
  if (Number.isInteger(qid) && qid > 0) {
    const r = await env.DB.prepare("SELECT n, topic, q, choices, ans, sub FROM questions WHERE n = ?").bind(qid).first();
    if (r) {
      let ch = []; try { ch = JSON.parse(r.choices); } catch { /* ignore */ }
      qline = "\n\n<b>Question #" + r.n + "</b>" + (r.sub ? " · " + esc(r.sub) : "") + "\n" + esc(String(r.q).slice(0, 500)) + "\n" +
        ch.map((c, i) => "ABCDEF"[i] + ". " + esc(String(c).slice(0, 120)) + (i === r.ans ? "  ✅" : "")).join("\n") +
        "\n<i>Fix it with /show " + r.n + " or /edit " + r.n + "</i>";
    }
  }
  const text = "🆘 <b>Quiz support</b> · " + TOPIC_NAME[topic] + "\n👤 " + esc(String(ses.n).slice(0, 120)) + "\n🏷 " + KINDS[kind] + "\n\n" + esc(message) + qline;
  let ok = false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    ok = r.ok;
  } catch { ok = false; }
  if (!ok) return fail(502, "Couldn't send your message. Please try again.");
  await env.DB.prepare("INSERT INTO support_log (sid, t) VALUES (?, ?)").bind(ses.n, Date.now()).run();
  return json({ ok: true });
}
