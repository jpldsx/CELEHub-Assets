# CELEQuiz update: visitor contributions (submit page + Telegram approval)

Do the earlier update first (daily report, mock exam, weak topics), then this one. Save each file after editing.

## Step 0. Three NEW files (sent separately)
Save them in your project like this:
- `api-contribute.js` is saved as `functions/api/contribute.js`
- `contribute.html` is saved in the project root, next to `quiz.html`
- `js-contribute.js` is saved as `js/contribute.js`

## File: `functions/_lib/quiz-core.js`

**1. Add the submissions table to the database setup**

FIND:
```
    db.prepare("CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions (topic, hidden)"),
```
REPLACE WITH:
```
    db.prepare("CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions (topic, hidden)"),
    db.prepare("CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, sid TEXT NOT NULL, topic TEXT NOT NULL, sub TEXT NOT NULL DEFAULT '', q TEXT NOT NULL, choices TEXT NOT NULL, ans INTEGER NOT NULL, sol TEXT NOT NULL, source TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', qn INTEGER, created INTEGER NOT NULL, decided INTEGER)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_submissions_s ON submissions (status, created)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_submissions_sid ON submissions (sid, created)"),
```

**2. Paste at the very END of the file (after the last line)**

```
/* ---------------- contributed questions (visitors send, you approve in Telegram) ---------------- */
const STOP = new Set("a an the of and to in is are at by for on with its it as be from that this which find what how many much each per if then".split(" "));
const words = (q) => new Set((String(q).toLowerCase().replace(/\d+/g, " ").match(/[a-z]{3,}/g) || []).filter((w) => !STOP.has(w)));
export const normText = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// the most similar question already in the bank: { n, q, score } (score 0 to 1)
export async function nearestQuestion(db, topic, q) {
  const w = words(q); let best = null;
  const rows = (await db.prepare("SELECT n, q FROM questions WHERE topic = ? AND hidden = 0").bind(topic).all()).results || [];
  for (const r of rows) {
    const v = words(r.q); if (w.size < 3 || v.size < 3) continue;
    let both = 0; for (const x of w) if (v.has(x)) both++;
    const score = both / (w.size + v.size - both);
    if (!best || score > best.score) best = { n: r.n, q: r.q, score };
  }
  return best;
}
export function subCard(s, extra = "") {
  let ch = []; try { ch = JSON.parse(s.choices); } catch { /* ignore */ }
  return "\u{1F4DD} <b>Contributed question #" + s.id + "</b> \u00b7 " + (TOPIC_NAME[s.topic] || s.topic) + (s.sub ? " \u00b7 " + esc(s.sub) : "") +
    "\n\u{1F464} " + esc(String(s.sid).slice(0, 60)) + "\n\n" + esc(String(s.q).slice(0, 900)) + "\n" +
    ch.map((c, i) => "ABCD"[i] + ". " + esc(String(c).slice(0, 200)) + (i === s.ans ? "  \u2705" : "")).join("\n") +
    "\n\n<b>Solution</b>\n" + esc(String(s.sol).slice(0, 1300)) + (s.source ? "\n\n<b>Source</b> " + esc(String(s.source).slice(0, 200)) : "") + extra;
}
export const subButtons = (id) => ({ reply_markup: { inline_keyboard: [[{ text: "\u2705 Approve", callback_data: "ap:" + id }, { text: "\u274C Reject", callback_data: "rj:" + id }]] } });
// approve (adds it to the bank) or reject a pending submission. Returns { ok, text }
export async function decideSubmission(db, id, approve) {
  const s = await db.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first();
  if (!s) return { ok: false, text: "Submission #" + id + " not found." };
  if (s.status !== "pending") return { ok: false, text: "Submission #" + id + " was already " + s.status + ".", s };
  const now = Date.now();
  if (!approve) { await db.prepare("UPDATE submissions SET status = 'rejected', decided = ? WHERE id = ?").bind(now, id).run(); return { ok: true, text: "\u274C Rejected", s: { ...s, status: "rejected" } }; }
  let ch = []; try { ch = JSON.parse(s.choices); } catch { /* ignore */ }
  const expl = clean(s.sol + (s.source ? "\nSource: " + s.source : ""), LIMITS.explain);
  const r = await addQuestions(db, s.topic, [{ q: s.q, choices: ch, ans: s.ans, expl, sub: s.sub }]);
  const qn = r.added[0] || null;
  await db.prepare("UPDATE submissions SET status = 'approved', qn = ?, decided = ? WHERE id = ?").bind(qn, now, id).run();
  return { ok: true, text: qn ? "\u2705 Approved as question #" + qn + " \u00b7 fix it with /edit " + qn : "\u2705 Approved, but it was already in the bank.", s: { ...s, status: "approved", qn } };
}
```


## File: `functions/api/tg.js`

**3. Import the new helpers (find only this part of the import line)**

FIND:
```
addQuestions, tgSend
```
REPLACE WITH:
```
addQuestions, tgSend, decideSubmission, subCard, subButtons
```

**4. Add the commands to the Telegram menu**

FIND:
```
["count", "How many questions per topic"],
```
REPLACE WITH:
```
["count", "How many questions per topic"], ["pending", "Contributed questions waiting for you"], ["approve", "Approve a contribution: /approve 12"], ["reject", "Reject a contribution: /reject 12"],
```

**5. Add a line to /help**

FIND:
```
\n<code>/del 41</code> (with Undo)
```
REPLACE WITH:
```
\n<b>Contributions</b> from visitors arrive with Approve / Reject buttons. <code>/pending</code> lists the waiting ones; <code>/approve 12</code> · <code>/reject 12</code> work too.\n<code>/del 41</code> (with Undo)
```

**6. Add the new commands (put the new block directly above this line)**

FIND:
```
  if (cmd === "count") {
```
REPLACE WITH:
```
  if (cmd === "pending") {
    const rows = (await db.prepare("SELECT * FROM submissions WHERE status = 'pending' ORDER BY id LIMIT 10").all()).results || [];
    if (!rows.length) return say("No contributed questions are waiting.");
    for (const s of rows) await say(subCard(s), subButtons(s.id));
    const left = (await db.prepare("SELECT COUNT(*) AS c FROM submissions WHERE status = 'pending'").first()).c - rows.length;
    return left > 0 ? say(left + " more waiting. Handle these, then send /pending again.") : undefined;
  }
  if (cmd === "approve" || cmd === "reject") {
    const ids = [...arg.matchAll(/\d+/g)].map((x) => +x[0]).slice(0, 30);
    if (!ids.length) return say("Use <code>/" + cmd + " 12</code> (or several: <code>/" + cmd + " 12 13</code>). /pending shows the numbers.");
    for (const id of ids) { const r = await decideSubmission(db, id, cmd === "approve"); await say("#" + id + ": " + r.text); }
    return;
  }
  if (cmd === "count") {
```

**7. Handle the Approve / Reject buttons (put the new block directly above this line)**

FIND:
```
  if (act !== "un" || !n) { await answer("?"); return ok(); }
```
REPLACE WITH:
```
  if ((act === "ap" || act === "rj") && n) {
    const r = await decideSubmission(env.DB, n, act === "ap");
    await answer(r.ok ? (act === "ap" ? "Approved" : "Rejected") : r.text);
    if (r.s) await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cq.message.chat.id, message_id: cq.message.message_id, parse_mode: "HTML", disable_web_page_preview: true, text: subCard(r.s) + "\n\n" + (r.ok ? r.text : "Already " + r.s.status) }),
    }).catch(() => {});
    return ok();
  }
  if (act !== "un" || !n) { await answer("?"); return ok(); }
```


## File: `quiz.html`

**8. Add a Contribute button on the result screen**

FIND:
```
        <a class="btn q-btn" href="./"><i class="bi bi-grid"></i> Other topics</a>
```
REPLACE WITH:
```
        <a class="btn q-btn" href="./"><i class="bi bi-grid"></i> Other topics</a>
        <a id="btnContrib" class="btn q-btn" href="contribute.html"><i class="bi bi-plus-circle"></i> Contribute</a>
```


## File: `js/quiz.js`

**9. Point that button at the current topic**

FIND:
```
  $("topicBadge").hidden = false; $("topicBadge").textContent = T.name;
```
REPLACE WITH:
```
  $("topicBadge").hidden = false; $("topicBadge").textContent = T.name;
  $("btnContrib").href = "contribute.html?t=" + encodeURIComponent(topic);
```


## File: `index.html`

**10. Add the Contribute link on the home page**

FIND:
```
    <p id="topicErr" class="gate-msg bad" hidden></p>
```
REPLACE WITH:
```
    <p id="topicErr" class="gate-msg bad" hidden></p>
    <a class="hm-contrib" href="contribute.html">Contribute a question</a>
```


## File: `css/quiz.css`

**11. Paste at the very END of the file**

```
/* ---- contribute page ---- */
.ct-panel { max-width: 720px; margin-inline: auto; }
.ct-title { font-size: clamp(1.5rem, 4vw, 2rem); font-weight: 850; letter-spacing: -.02em; margin: .2rem 0 .3rem; }
.ct-lead { color: var(--muted); margin: 0 0 1rem; }
.ct-row { display: grid; grid-template-columns: 1fr 1fr; gap: .8rem; }
.ct-row > div[hidden] { display: none; }
.ct-gap { margin-top: .9rem; }
.ct-choices { display: grid; gap: .5rem; }
.ct-choice { display: grid; grid-template-columns: 2rem 1fr auto; align-items: center; gap: .6rem; }
.ct-letter { width: 2rem; height: 2rem; display: grid; place-items: center; border-radius: 9px; font-weight: 800; background: var(--surface-2); color: var(--muted); }
.ct-key { display: inline-flex; align-items: center; gap: .35rem; font-size: .85rem; font-weight: 650; color: var(--muted); white-space: nowrap; cursor: pointer; }
.ct-key input { accent-color: #4f46e5; width: 1.1rem; height: 1.1rem; }
.ct-check { display: flex; align-items: flex-start; gap: .55rem; margin: 1rem 0 .2rem; font-size: .92rem; cursor: pointer; }
.ct-check input { margin-top: .25rem; accent-color: #4f46e5; }
.ct-trap { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
@media (max-width: 560px) { .ct-row { grid-template-columns: 1fr; } .ct-key span { display: none; } }
/* links to the contribute page */
.hm-contrib { position: fixed; left: 50%; top: .9rem; transform: translateX(-50%); z-index: 15; padding: .45rem 1rem; border-radius: 999px; font-size: .85rem; font-weight: 650; color: #fff; text-decoration: none; background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.35); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.hm-contrib:hover { color: #fff; background: rgba(255,255,255,.3); }
```


## How it works after deploy
1. A visitor opens **Contribute a question** (home page, or the result screen after a quiz), fills the problem, four choices, the correct choice, the step-by-step solution and an optional reference, and confirms they solved it.
2. You get a card in Telegram with the question, the key marked, the solution, the visitor ID, and a warning if it looks similar to a question already in the bank. Tap **Approve** or **Reject**.
3. Approve adds it to the bank at once (the solution becomes the explanation). Fix wording with `/edit N` if needed.
4. `/pending` lists the ones still waiting. `/approve 12` and `/reject 12` also work.
5. Limits: 5 submissions per visitor per day. A question already in the bank, or already waiting, is refused.
No new Cloudflare secret is needed.
