// Cloudflare Pages Function  ->  POST /api/tg      (Telegram webhook: your private question manager)
//
//   Add questions: type the topic command, then the questions (one or many in one message):
//
//       /mstc
//       1. What is the SI unit of force?
//       A. Joule
//       B. Newton
//       C. Pascal
//       D. Watt
//       Answer: B
//       Explanation: F = ma, so kg*m/s^2 = newton.
//
//       2. Next question ...
//
//   Or send a .txt file with the same format and write the topic (/mstc) as its caption.
//   /add <topic> does the same as /hpge /mstc /psad.
//
//   /key 41 B 42 D 43 A ..... fix many answer keys at once      /explain 41 text ... set an explanation
//   /edit 41 + a full question  replaces question 41           /show 41   /find word   /list [topic]
//   /del 41 (undo button)   /move 41 psad   /count   /menu   /help
//
// Only YOU can use it: TELEGRAM_CHAT_ID (your private chat) + the secret TG_WEBHOOK_SECRET.
// Needs: D1 as DB, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TG_WEBHOOK_SECRET.
// Only if TELEGRAM_CHAT_ID is a group (starts with -): also TELEGRAM_OWNER_ID = your own user id.

import { TOPICS, TOPIC_NAME, LIMITS, init, esc, clean, parseQuestions, addQuestions, tgSend } from "../_lib/quiz-core.js";

const ok = () => new Response("ok");
const MAX_FILE = 300 * 1024;
const MENU = [
  ["help", "Show all commands"], ["count", "How many questions per topic"], ["list", "Latest questions (/list mstc)"],
  ["hpge", "Add questions to HPGE"], ["mstc", "Add questions to MSTC"], ["psad", "Add questions to PSAD"],
  ["key", "Fix answer keys: /key 41 B 42 D"], ["explain", "Set an explanation"], ["edit", "Replace a question"],
  ["show", "Show one question"], ["find", "Search questions"], ["del", "Remove a question"], ["move", "Move a question to another topic"],
].map(([command, description]) => ({ command, description }));

const HELP =
  "<b>CELEHub Quiz manager</b>\n\n" +
  "<b>Add questions</b>\nSend <code>/mstc</code> (or /hpge, /psad) and under it one or many questions:\n<pre>1. Unit of force?\nA. Joule\nB. Newton\nC. Pascal\nD. Watt\nAnswer: B\nExplanation: F = ma</pre>" +
  "Choices A–F (2 to 6). Every question needs an <code>Answer:</code> line. A .txt file works too: attach it with the topic as caption.\n\n" +
  "<b>Answer keys</b>\n<code>/key 41 B 42 D 43 A</code> fixes many at once.\n<code>/explain 41 The reason…</code>\n<code>/edit 41</code> + a full question on the next lines replaces it.\n\n" +
  "<b>Manage</b>\n<code>/list</code> <code>/list mstc</code> · <code>/find word</code> · <code>/show 41</code> · <code>/count</code>\n<code>/del 41</code> (with Undo) · <code>/move 41 psad</code>\n<code>/menu</code> fills the command list when you type /";

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return ok();
  if (!env.TG_WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TG_WEBHOOK_SECRET) return new Response("no", { status: 403 });
  let up; try { up = await request.json(); } catch { return ok(); }
  try {
    const owner = String(env.TELEGRAM_OWNER_ID || (String(env.TELEGRAM_CHAT_ID).startsWith("-") ? "" : env.TELEGRAM_CHAT_ID));
    if (!owner) return ok();
    if (up.callback_query) {
      const cq = up.callback_query;
      if (String(cq.from && cq.from.id) !== owner || String(cq.message && cq.message.chat.id) !== String(env.TELEGRAM_CHAT_ID)) return ok();
      await init(env.DB);
      return await onButton(env, cq);
    }
    const msg = up.message;
    if (!msg || (!msg.text && !msg.document)) return ok();
    if (String(msg.chat.id) !== String(env.TELEGRAM_CHAT_ID) || String(msg.from && msg.from.id) !== owner) return ok();
    await init(env.DB);
    let text = msg.text || msg.caption || "";
    if (msg.document) {
      const d = msg.document;
      if (!/\.txt$/i.test(d.file_name || "") && !/^text\//.test(d.mime_type || "")) { await tgSend(env, msg.chat.id, "I can read .txt files only."); return ok(); }
      if ((d.file_size || 0) > MAX_FILE) { await tgSend(env, msg.chat.id, "That file is too big (max 300 KB). Split it in two."); return ok(); }
      const fi = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(d.file_id)}`).then((r) => r.json()).catch(() => null);
      const body = fi && fi.ok ? await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fi.result.file_path}`).then((r) => r.text()).catch(() => "") : "";
      if (!body) { await tgSend(env, msg.chat.id, "⚠️ I could not download that file. Try again."); return ok(); }
      text = (msg.caption || "").split("\n")[0] + "\n" + body;
    }
    await onText(env, msg.chat.id, text);
  } catch (e) {
    await tgSend(env, env.TELEGRAM_CHAT_ID, "⚠️ Something went wrong: " + esc(String(e && e.message || e).slice(0, 200)));
  }
  return ok();
}

const L = (i) => "ABCDEF"[i];
function show(r, full = true) {
  const ch = JSON.parse(r.choices);
  let s = `<b>#${r.n}</b> · ${TOPIC_NAME[r.topic] || r.topic}${r.hidden ? " · <i>removed</i>" : ""}\n${esc(r.q)}`;
  if (full) {
    s += "\n" + ch.map((c, i) => `${i === r.ans ? "✅" : "▫️"} ${L(i)}. ${esc(c)}`).join("\n");
    s += r.expl ? `\n💡 ${esc(r.expl)}` : "\n<i>(no explanation)</i>";
  }
  return s;
}
const chunks = (s, n = 3800) => { const o = []; while (s.length > n) { let k = s.lastIndexOf("\n", n); if (k < 1) k = n; o.push(s.slice(0, k)); s = s.slice(k); } o.push(s); return o; };

async function onText(env, chat, text) {
  const db = env.DB;
  const say = (t, extra) => tgSend(env, chat, t, extra);
  const sayLong = async (t) => { for (const c of chunks(t)) await say(c); };
  const m = text.trim().match(/^\/([a-z_]+)(?:@\w+)?[ \t]*([\s\S]*)$/i);
  if (!m) return say("Start with a topic command, e.g. <code>/mstc</code> and then the questions. Send /help to see how.");
  const cmd = m[1].toLowerCase(), arg = m[2].trim();

  if (cmd === "start" || cmd === "help") return say(HELP);
  if (cmd === "menu") {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setMyCommands`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commands: MENU }),
    }).then((x) => x.json()).catch(() => null);
    return say(r && r.ok ? "✅ Command menu updated. Reopen the chat and type / to see it." : "⚠️ Telegram did not accept the menu. Try again in a minute.");
  }

  let topic = TOPICS.includes(cmd) ? cmd : "";
  let body = arg;
  if (cmd === "add") { const t = arg.split(/\s+/)[0].toLowerCase(); if (TOPICS.includes(t)) { topic = t; body = arg.slice(t.length).trim(); } else return say("Use <code>/add mstc</code> followed by the questions. Topics: " + TOPICS.join(", ") + ".\nOr simply <code>/mstc</code>."); }
  if (topic) {
    if (!body) return say(`Send the questions under the command, like:\n<pre>/${topic}\n1. Question text?\nA. First\nB. Second\nC. Third\nD. Fourth\nAnswer: B\nExplanation: why (optional)</pre>`);
    const { items, errors } = parseQuestions(body);
    if (!items.length && !errors.length) return say("I could not find a question in that. Send /help to see the format.");
    const { added, dup, updated } = await addQuestions(db, topic, items);
    let out = `✅ <b>${added.length}</b> added to ${TOPIC_NAME[topic]}` + (added.length ? ` (#${added[0]}${added.length > 1 ? "–#" + added[added.length - 1] : ""})` : "") +
      (dup ? `\n↩️ ${dup} already there, skipped.` + (updated ? `\n🏷 ${updated} subtopic tags updated.` : "") : "") +
      (items.some((i) => !i.expl) && added.length ? `\n💡 ${items.filter((i) => !i.expl).length} without an explanation (add later with /explain N …).` : "");
    if (errors.length) out += `\n\n⚠️ <b>${errors.length} not added:</b>\n` + errors.slice(0, 15).map((e) => "• " + esc(e)).join("\n") + (errors.length > 15 ? `\n…and ${errors.length - 15} more.` : "") + "\nFix those and send only them again.";
    return sayLong(out);
  }

  if (cmd === "count") {
    const rows = (await db.prepare("SELECT topic, COUNT(*) AS c FROM questions WHERE hidden = 0 GROUP BY topic").all()).results || [];
    const by = Object.fromEntries(rows.map((r) => [r.topic, r.c]));
    return say("<b>Questions</b>\n" + TOPICS.map((t) => `${TOPIC_NAME[t]}: ${by[t] || 0}`).join("\n") + `\nTotal: ${TOPICS.reduce((a, t) => a + (by[t] || 0), 0)}`);
  }
  if (cmd === "list") {
    const t = arg.toLowerCase();
    if (t && !TOPICS.includes(t)) return say("Topics: " + TOPICS.join(", "));
    const rows = (await (t ? db.prepare("SELECT * FROM questions WHERE hidden = 0 AND topic = ? ORDER BY n DESC LIMIT 15").bind(t) : db.prepare("SELECT * FROM questions WHERE hidden = 0 ORDER BY n DESC LIMIT 15")).all()).results || [];
    if (!rows.length) return say("Nothing yet.");
    return sayLong(rows.map((r) => `#${r.n} · ${TOPIC_NAME[r.topic]} · ${esc(r.q.slice(0, 70))}${r.q.length > 70 ? "…" : ""} · <b>${L(r.ans)}</b>`).join("\n"));
  }
  if (cmd === "find") {
    if (arg.length < 2) return say("Use <code>/find word</code>");
    const rows = (await db.prepare("SELECT * FROM questions WHERE hidden = 0 AND q LIKE ? ESCAPE '\\' ORDER BY n DESC LIMIT 15").bind("%" + arg.replace(/[\\%_]/g, "\\$&") + "%").all()).results || [];
    return rows.length ? sayLong(rows.map((r) => `#${r.n} · ${TOPIC_NAME[r.topic]} · ${esc(r.q.slice(0, 70))}${r.q.length > 70 ? "…" : ""} · <b>${L(r.ans)}</b>`).join("\n")) : say("No match.");
  }
  if (cmd === "show") {
    const r = await db.prepare("SELECT * FROM questions WHERE n = ?").bind(parseInt(arg, 10) || 0).first();
    return r ? say(show(r)) : say("No question with that number.");
  }
  if (cmd === "key") {
    const pairs = [...arg.matchAll(/(\d+)\s*[:=.\-]?\s*([A-Fa-f])\b/g)];
    if (!pairs.length) return say("Use <code>/key 41 B 42 D 43 A</code>");
    const done = [], bad = [];
    for (const [, nStr, letter] of pairs) {
      const n = +nStr, idx = "ABCDEF".indexOf(letter.toUpperCase());
      const r = await db.prepare("SELECT choices FROM questions WHERE n = ?").bind(n).first();
      if (!r) { bad.push(`#${n} not found`); continue; }
      if (idx >= JSON.parse(r.choices).length) { bad.push(`#${n} has no choice ${letter.toUpperCase()}`); continue; }
      await db.prepare("UPDATE questions SET ans = ? WHERE n = ?").bind(idx, n).run();
      done.push(`#${n}→${letter.toUpperCase()}`);
    }
    return say((done.length ? `✅ Answer key updated: ${done.join(", ")}` : "Nothing changed.") + (bad.length ? `\n⚠️ ${bad.join("; ")}` : ""));
  }
  if (cmd === "explain") {
    const mm = arg.match(/^(\d+)\s+([\s\S]+)$/);
    if (!mm) return say("Use <code>/explain 41 The reason is…</code> (send <code>/explain 41 -</code> to clear it)");
    const e = mm[2].trim() === "-" ? "" : clean(mm[2], LIMITS.explain + 1);
    if (e.length > LIMITS.explain) return say(`Too long (max ${LIMITS.explain} characters).`);
    const r = await db.prepare("UPDATE questions SET expl = ? WHERE n = ?").bind(e, +mm[1]).run();
    return say(r.meta.changes ? `✅ Explanation ${e ? "saved" : "cleared"} for #${mm[1]}.` : "No question with that number.");
  }
  if (cmd === "edit") {
    const mm = arg.match(/^(\d+)\s*([\s\S]*)$/);
    if (!mm || !mm[2]) return say("Use <code>/edit 41</code> and under it the full new question (with choices and Answer:).");
    const old = await db.prepare("SELECT n FROM questions WHERE n = ?").bind(+mm[1]).first();
    if (!old) return say("No question with that number.");
    const { items, errors } = parseQuestions(mm[2]);
    if (items.length !== 1) return say("⚠️ " + (errors[0] ? esc(errors[0]) : "Send exactly one question.") );
    const it = items[0];
    await db.prepare("UPDATE questions SET q = ?, choices = ?, ans = ?, expl = ? WHERE n = ?").bind(it.q, JSON.stringify(it.choices), it.ans, it.expl, old.n).run();
    return say("✅ Replaced.\n\n" + show(await db.prepare("SELECT * FROM questions WHERE n = ?").bind(old.n).first()));
  }
  if (cmd === "del") {
    const ns = [...arg.matchAll(/\d+/g)].map((x) => +x[0]).slice(0, 50);
    if (!ns.length) return say("Use <code>/del 41</code> (or several: <code>/del 41 42 43</code>)");
    for (const n of ns) {
      const r = await db.prepare("UPDATE questions SET hidden = 1 WHERE n = ? AND hidden = 0").bind(n).run();
      if (r.meta.changes) await say("🗑 Removed #" + n, { reply_markup: { inline_keyboard: [[{ text: "↩️ Undo", callback_data: "un:" + n }]] } });
      else await say("#" + n + " not found.");
    }
    return;
  }
  if (cmd === "move") {
    const mm = arg.match(/^(\d+)\s+(\w+)$/);
    if (!mm || !TOPICS.includes(mm[2].toLowerCase())) return say("Use <code>/move 41 psad</code>. Topics: " + TOPICS.join(", "));
    const r = await db.prepare("UPDATE questions SET topic = ? WHERE n = ?").bind(mm[2].toLowerCase(), +mm[1]).run();
    return say(r.meta.changes ? `✅ #${mm[1]} moved to ${TOPIC_NAME[mm[2].toLowerCase()]}.` : "No question with that number.");
  }
  return say("I don't know that command. Send /help.");
}

async function onButton(env, cq) {
  const [act, nStr] = String(cq.data || "").split(":");
  const n = parseInt(nStr, 10);
  const answer = (text) => fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: cq.id, text }),
  }).catch(() => {});
  if (act !== "un" || !n) { await answer("?"); return ok(); }
  const r = await env.DB.prepare("UPDATE questions SET hidden = 0 WHERE n = ?").bind(n).run();
  await answer(r.meta.changes ? "Restored" : "Not found");
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: "↩️ Restored #" + n }),
  }).catch(() => {});
  return ok();
}
