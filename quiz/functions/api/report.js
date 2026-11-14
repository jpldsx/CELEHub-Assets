import { init, buildReport, tgSend, json, fail } from "../_lib/quiz-core.js";

function same(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

async function run({ request, env }) {
  if (!env.DB || !env.REPORT_KEY || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return fail(503, "Report is not set up.");
  const auth = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!same(auth, env.REPORT_KEY)) return fail(401, "Wrong key.");
  await init(env.DB);
  const h = Math.min(720, Math.max(1, parseInt(new URL(request.url).searchParams.get("hours"), 10) || 24));
  await tgSend(env, env.TELEGRAM_CHAT_ID, await buildReport(env, h));
  return json({ ok: true });
}
export const onRequestGet = run;
export const onRequestPost = run;
