# CELEQuiz update: daily report, weak-topic report, mock board exam

Everything below is find-and-replace. Do the files in this order. After each file, save/commit.

## Step 0. New file
Add the new file `functions/api/report.js` (sent separately).


## File: `functions/_lib/quiz-core.js`

**1. Add two lines to the database setup**

FIND:
```
    db.prepare("CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions (topic, hidden)"),
```
REPLACE WITH:
```
    db.prepare("CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions (topic, hidden)"),
    db.prepare("CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, sid TEXT NOT NULL, topic TEXT NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL, mock INTEGER NOT NULL DEFAULT 0, t INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_attempts_t ON attempts (t)"),
```

**2. Paste at the very END of the file (after the last line)**

```
/* ---------------- the activity report (daily to Telegram, or /report) ---------------- */
export async function buildReport(env, hours = 24) {
  const db = env.DB, since = Date.now() - hours * 3600 * 1000;
  const one = async (sql, ...b) => (await db.prepare(sql).bind(...b).first()) || {};
  const all = async (sql, ...b) => (await db.prepare(sql).bind(...b).all()).results || [];
  const tot = await one("SELECT COUNT(*) AS n, COUNT(DISTINCT sid) AS v FROM attempts WHERE t >= ?", since);
  const mock = await one("SELECT COUNT(*) AS n, SUM(CASE WHEN score * 100 >= total * 70 THEN 1 ELSE 0 END) AS p FROM attempts WHERE mock = 1 AND t >= ?", since);
  const per = await all("SELECT topic, COUNT(*) AS n, SUM(score) AS s, SUM(total) AS q FROM attempts WHERE t >= ? GROUP BY topic", since);
  let fresh = 0; try { fresh = (await one("SELECT COUNT(*) AS n FROM visitors WHERE created_at >= ?", since)).n || 0; } catch { /* table not created yet */ }
  const banks = await all("SELECT topic, COUNT(*) AS c FROM questions WHERE hidden = 0 GROUP BY topic");
  const by = Object.fromEntries(per.map((r) => [r.topic, r])), bank = Object.fromEntries(banks.map((r) => [r.topic, r.c]));
  const lines = TOPICS.map((t) => {
    const r = by[t];
    return `${TOPIC_NAME[t]}: ` + (r ? `${r.n} quiz${r.n === 1 ? "" : "zes"} · avg ${r.q ? Math.round(r.s / r.q * 100) : 0}%` : "no quizzes") + ` · bank ${bank[t] || 0}`;
  });
  return `\u{1F4CA} <b>CELEHub Quiz \u00b7 last ${hours} hours</b>\n\n` +
    `New visitors: <b>${fresh}</b>\nVisitors who finished a quiz: <b>${tot.v || 0}</b>\nQuizzes finished: <b>${tot.n || 0}</b>\n` +
    `Mock board exams: <b>${mock.n || 0}</b>` + (mock.n ? ` (${mock.p || 0} reached 70%)` : "") + `\n\n` + lines.join("\n");
}
```


## File: `functions/api/questions.js`

**3. Allow up to 100 questions**

FIND:
```
const n = [25, 50, 75].includes(+u.searchParams.get("n")) ? +u.searchParams.get("n") : 25;
```
REPLACE WITH:
```
const n = Math.min(LIMITS.perExam, Math.max(1, parseInt(u.searchParams.get("n"), 10) || 25));
```


## File: `functions/api/grade.js`

**4. Keep the session**

FIND:
```
  if (!(await readSession(request, env))) return fail(401, "Please finish the quick check first.");
```
REPLACE WITH:
```
  const session = await readSession(request, env);
  if (!session) return fail(401, "Please finish the quick check first.");
```

**5. Also read the topic**

FIND:
```
SELECT n, q, choices, ans, expl, sub FROM
```
REPLACE WITH:
```
SELECT n, q, choices, ans, expl, sub, topic FROM
```

**6. Record the attempt (put the new lines just above the return)**

FIND:
```
  return json({ ok: true, score, total: results.length, results });
```
REPLACE WITH:
```
  // remember the attempt (used only for the daily report); a failure here never blocks the review
  try {
    const seen = {}; for (const id of ids) { const r = byId.get(id); if (r) seen[r.topic] = (seen[r.topic] || 0) + 1; }
    const topic = Object.keys(seen).sort((a, b) => seen[b] - seen[a])[0];
    if (topic && results.length) await env.DB.prepare("INSERT INTO attempts (sid, topic, score, total, mock, t) VALUES (?, ?, ?, ?, ?, ?)").bind(String(session.n), topic, score, results.length, body.mock === true ? 1 : 0, Date.now()).run();
  } catch { /* ignore */ }
  return json({ ok: true, score, total: results.length, results });
```


## File: `functions/api/tg.js`

**7. Import the report builder**

FIND:
```
import { TOPICS, TOPIC_NAME, LIMITS, init, esc, clean, parseQuestions, addQuestions, tgSend } from
```
REPLACE WITH:
```
import { TOPICS, TOPIC_NAME, LIMITS, init, esc, clean, parseQuestions, addQuestions, tgSend, buildReport } from
```

**8. Add it to the command menu**

FIND:
```
["count", "How many questions per topic"],
```
REPLACE WITH:
```
["count", "How many questions per topic"], ["report", "Activity report (/report 168 = last 7 days)"],
```

**9. Add it to /help**

FIND:
```
<code>/list</code> <code>/list mstc</code> · <code>/find word</code> · <code>/show 41</code> · <code>/count</code>
```
REPLACE WITH:
```
<code>/list</code> <code>/list mstc</code> · <code>/find word</code> · <code>/show 41</code> · <code>/count</code> · <code>/report</code>
```

**10. Add the /report command**

FIND:
```
  if (cmd === "count") {
```
REPLACE WITH:
```
  if (cmd === "report") { const h = Math.min(720, Math.max(1, parseInt(arg, 10) || 24)); return say(await buildReport(env, h)); }
  if (cmd === "count") {
```


## File: `quiz.html`

**11. Add the Mock board button**

FIND:
```
            <button type="button" role="radio" data-v="total"><b>Exam</b><span>One big clock</span></button>
```
REPLACE WITH:
```
            <button type="button" role="radio" data-v="total"><b>Exam</b><span>One big clock</span></button>
            <button type="button" role="radio" data-v="mock" hidden><b>Mock board exam</b><span>Full-length, timed, 70% passing mark</span></button>
```

**12. Add the weak-topic box**

FIND:
```
      <div id="rvFilters" class="q-seg q-filters"
```
REPLACE WITH:
```
      <div id="weak" class="q-weak" hidden></div>
      <div id="rvFilters" class="q-seg q-filters"
```


## File: `js/quiz.js`

**13. Add the mock flag to the options**

FIND:
```
var opt = { n: 25, mode: "free", secs: 60, mins: 10, scope: "all", picks: [] }
```
REPLACE WITH:
```
var opt = { n: 25, mode: "free", mock: false, secs: 60, mins: 10, scope: "all", picks: [] }
```

**14. Replace the Pace click handler**

FIND:
```
    $("optMode").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { opt.mode = b.getAttribute("data-v"); paintSetup(); } });
```
REPLACE WITH:
```
    $("optMode").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var v = b.getAttribute("data-v");
      if (v === "mock") { opt.mock = true; opt.mode = "total"; opt.scope = "all"; opt.picks = []; opt.n = Math.min(100, avail); opt.mins = Math.round(opt.n * 1.5); minsTouched = true; }
      else { if (opt.mock) { opt.mock = false; minsTouched = false; paintCounts(); } opt.mode = v; }
      paintSetup();
    });
```

**15. Show the Mock button only when the topic has 50+ questions**

FIND:
```
    paintSubs(); paintCounts();
```
REPLACE WITH:
```
    paintSubs(); paintCounts();
    $("optMode").querySelector('[data-v="mock"]').hidden = avail < 50;
```

**16. Add help text for mock**

FIND:
```
    total: "One clock for everything. It submits itself at zero."
  };
```
REPLACE WITH:
```
    total: "One clock for everything. It submits itself at zero.",
    mock: "Board-style run: the most questions at once, one clock, no hints. Aim for 70% or higher."
  };
```

**17. Help text and hide the count/scope blocks in mock**

FIND:
```
    $("modeHelp").textContent = HELP[opt.mode];
```
REPLACE WITH:
```
    $("modeHelp").textContent = HELP[opt.mock ? "mock" : opt.mode];
    $("optCount").parentNode.hidden = opt.mock;
    $("subBlock").hidden = opt.mock || Object.keys(subs).length < 2;
```

**18. Highlight the Mock button**

FIND:
```
[].forEach.call($("optMode").children, function (b) { b.setAttribute("aria-checked", String(b.getAttribute("data-v") === opt.mode)); });
```
REPLACE WITH:
```
[].forEach.call($("optMode").children, function (b) { b.setAttribute("aria-checked", String(b.getAttribute("data-v") === (opt.mock ? "mock" : opt.mode))); });
```

**19. Summary line for mock**

FIND:
```
    if (opt.mode === "item") sum =
```
REPLACE WITH:
```
    if (opt.mock) sum = "<b>" + n + "</b> questions<span class=\"brk\"></span>" + opt.mins + " min \u00b7 pass at 70%";
    else if (opt.mode === "item") sum =
```

**20. Tell the server it was a mock**

FIND:
```
body: JSON.stringify({ answers: body }) })
```
REPLACE WITH:
```
body: JSON.stringify({ answers: body, mock: opt.mock }) })
```

**21. Passed / Not yet title**

FIND:
```
    $("scoreTitle").textContent = (pct >= 90 ? "Excellent! "
```
REPLACE WITH:
```
    $("scoreTitle").textContent = opt.mock ? (pct >= 70 ? "Passed. " : "Not yet. ") + sc + " / " + tot : (pct >= 90 ? "Excellent! "
```

**22. Passing mark and weak topics**

FIND:
```
    $("scoreSub").textContent = wrong + " wrong · " + skip + " unanswered · " + fmt(usedMs) + " used";
```
REPLACE WITH:
```
    $("scoreSub").textContent = wrong + " wrong · " + skip + " unanswered · " + fmt(usedMs) + " used" + (opt.mock ? " · passing mark 70%" : "");
    paintWeak();
```

**23. Add the weak-topic functions (put the new block just above  function applyFilter() {  )**

FIND:
```
  function applyFilter() {
```
REPLACE WITH:
```
  var weakPicks = [];
  function paintWeak() {
    var by = {}, box = $("weak");
    result.results.forEach(function (r) { if (!r.sub || !subs[r.sub]) return; var s = by[r.sub] || (by[r.sub] = { n: r.sub, t: 0, ok: 0 }); s.t++; if (r.status === "ok") s.ok++; });
    var list = Object.keys(by).map(function (k) { return by[k]; }).filter(function (s) { return s.ok < s.t; });
    list.sort(function (a, b) { return a.ok / a.t - b.ok / b.t || b.t - a.t; });
    list = list.slice(0, 4); weakPicks = list.map(function (s) { return s.n; });
    if (!list.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.innerHTML = '<div class="wk-head"><b>Weak topics</b><span>Lowest scores in this quiz</span></div>' + list.map(function (s) {
      var p = Math.round(s.ok / s.t * 100);
      return '<div class="wk-row"><span class="wk-name">' + esc(s.n) + '</span><span class="wk-val">' + s.ok + " / " + s.t + " \u00b7 " + p + '%</span><span class="wk-bar"><i style="width:' + p + '%"></i></span></div>';
    }).join("") + '<button type="button" id="btnWeak" class="btn q-btn">Practice these topics</button>';
    box.hidden = false;
  }
  $("weak").addEventListener("click", function (e) {
    if (!e.target.closest("#btnWeak") || !weakPicks.length) return;
    opt.mock = false; opt.mode = "free"; minsTouched = false; opt.scope = "pick"; opt.picks = weakPicks.slice();
    usedMs = 0; state = "setup"; show("setup"); paintCounts(); paintSetup();
  });
  function applyFilter() {
```


## File: `css/quiz.css`

**24. Paste at the very END of the file**

```
/* weak-topic report + mock board exam */
.su-modes button[data-v="mock"] { grid-column: 1 / -1; }
.q-weak { margin: 1rem 0; padding: 1rem 1.1rem; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); }
.wk-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: .2rem .8rem; margin-bottom: .6rem; }
.wk-head span { font-size: .82rem; color: var(--muted); }
.wk-row { display: grid; grid-template-columns: 1fr auto; gap: .15rem .8rem; padding: .35rem 0; }
.wk-name { font-weight: 600; }
.wk-val { font-size: .85rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.wk-bar { grid-column: 1 / -1; height: 6px; border-radius: 99px; background: var(--border); overflow: hidden; }
.wk-bar i { display: block; height: 100%; background: #dc2626; border-radius: 99px; }
.q-weak .q-btn { margin-top: .7rem; }
```


## Cloudflare setup (after you deploy)
1. Pages project > Settings > Variables and Secrets > add a **Secret** named `REPORT_KEY` with any long random text (30+ characters). Redeploy.
2. Test once: in Telegram send `/report` to the quiz bot. You should get the report.
3. Daily schedule (free): make an account at cron-job.org > Create cronjob.
   - URL: `https://<your-quiz-site>/api/report`
   - Schedule: every day at the hour you want (set the time zone to Asia/Manila or Asia/Shanghai)
   - Advanced > Request method: GET > Headers: add `Authorization` = `Bearer <your REPORT_KEY>`
   - Save. Press "Test run": the report should arrive in Telegram.
