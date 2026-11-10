// TEMPORARY: open /api/health to see which settings the server can see (yes/no only). Delete this file when everything works.
export async function onRequestGet({ env }) {
  const names = ["DB", "TURNSTILE_SECRET_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TG_WEBHOOK_SECRET", "SESSION_SECRET", "IP_SALT"];
  const out = {};
  for (const n of names) out[n] = env[n] ? "yes" : "MISSING";
  try { if (env.DB) { await env.DB.prepare("SELECT 1").first(); out.DB_works = "yes"; } } catch (e) { out.DB_works = "NO: " + String(e && e.message || e).slice(0, 120); }
  return new Response(JSON.stringify(out, null, 1), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
