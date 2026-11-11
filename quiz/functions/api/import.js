// Cloudflare Pages Function  ->  POST /api/import     (bulk question import, for scripts)
//
//   Header:  Authorization: Bearer <IMPORT_KEY>
//   URL:     /api/import?topic=mstc
//   Body:    the same text format the Telegram bot accepts (a leading "/mstc" line is fine too)
//
// Needs the secret IMPORT_KEY (any long random text) plus the D1 binding DB.
import { TOPICS, TOPIC_NAME, init, json, fail, parseQuestions, addQuestions } from "../_lib/quiz-core.js";

const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.IMPORT_KEY) return fail(503, "Import is not set up (IMPORT_KEY / DB missing).");
  const auth = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!same(auth, String(env.IMPORT_KEY))) return fail(401, "Wrong import key.");

  let text = await request.text();
  if (text.length > 600000) return fail(413, "Too big. Split into files under 600 KB.");
  let topic = (new URL(request.url).searchParams.get("topic") || "").toLowerCase();
  const m = text.match(/^\s*\/(\w+)[ \t]*\r?\n/);
  if (m && TOPICS.includes(m[1].toLowerCase())) { if (!topic) topic = m[1].toLowerCase(); text = text.slice(m[0].length); }
  if (!TOPICS.includes(topic)) return fail(400, "Unknown topic. Use ?topic=" + TOPICS.join(" | "));

  await init(env.DB);
  const { items, errors } = parseQuestions(text);
  const { added, dup } = await addQuestions(env.DB, topic, items);
  return json({ ok: true, topic: TOPIC_NAME[topic], added: added.length, duplicates: dup, errors: errors.length, first: added[0] || null, last: added.at(-1) || null });
}
