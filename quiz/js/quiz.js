// CELEHub Quiz: setup -> exam (flashcards) -> review. Answers never reach the browser until Submit.
(function () {
  "use strict";
  var Q = window.QUIZ || { TOPICS: [] };
  var $ = function (id) { return document.getElementById(id); };
  var LETTERS = "ABCDEF";
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    // plain-text math -> nicer display: a^2 -> superscript, (x+1)/(x-1) and 3/4 -> stacked fraction, sqrt( -> root sign, <= >= !=
  var PG = "\\(((?:[^()]|\\([^()]*\\))+)\\)";
  var FR1 = new RegExp(PG + "\\/" + PG, "g"), FR2 = new RegExp(PG + "\\/(?!\\()([A-Za-z0-9.]+)(?![\\w.\\/(])", "g"), FR3 = new RegExp("(?<![\\w^.)\\/])([A-Za-z0-9.]+)\\/" + PG, "g"), FR4 = /(?<![\w^.\/])(\d{1,4})\/(\d{1,4})(?![\w.\/(])/g;
  function fr(n, d) { return '<span class="fr"><span class="fn">' + n + '</span><span class="fd">' + d + "</span></span>"; }
  function M(t) {
    var h = esc(t);
    h = h.replace(FR1, function (m, a, b) { return fr(a, b); })
         .replace(FR2, function (m, a, b) { return fr(a, b); })
         .replace(FR3, function (m, a, b) { return fr(a, b); })
         .replace(FR4, function (m, a, b) { return fr(a, b); });
    h = h.replace(/\^(\(([^()]+)\)|-?[A-Za-z0-9.]+)/g, function (m, a, b) { return "<sup>" + (b || a) + "</sup>"; });
    return h.replace(/\bsqrt\(/g, "\u221a(").replace(/\bcbrt\(/g, "\u221b(").replace(/&lt;=/g, "\u2264").replace(/&gt;=/g, "\u2265").replace(/!=/g, "\u2260");
  }
  function fmt(ms) { var s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); s = s % 60; return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (s < 10 ? "0" : "") + s; }
  function show(id) { ["setup", "exam", "review", "loading"].forEach(function (k) { $(k).hidden = k !== id; }); document.body.classList.toggle("setup-mode", id === "setup"); window.scrollTo(0, 0); }
  function fatal(t) { if (window.QuizLook) QuizLook.drop(); $("loading").hidden = true; ["setup", "exam", "review"].forEach(function (k) { $(k).hidden = true; }); var f = $("fatal"); f.hidden = false; f.innerHTML = esc(t) + ' <a href="./">Back to topics</a>'; }
  function reduceMotion() { return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; }

  var topic = (new URLSearchParams(location.search).get("t") || "").toLowerCase();
  var T = Q.TOPICS.filter(function (t) { return t.id === topic; })[0];
  var opt = { n: 10, mode: "free", secs: 60, mins: 10 }, minsTouched = false, avail = 0;
  var qs = [], perm = {}, ans = {}, cur = 0, state = "setup", startedAt = 0, tick = null, itemEnd = 0, totalEnd = 0, usedMs = 0, grading = false;
  var result = null, rv = [], rvIdx = 0, rvFilter = "all";

  /* ---------------- start ---------------- */
  if (!T) { fatal("That topic doesn't exist."); return; }
  $("topicBadge").hidden = false; $("topicBadge").textContent = T.name;
  document.title = T.name + " quiz – CELEHub Quiz";
  Promise.all([
    fetch("/api/survey", { cache: "no-store", credentials: "same-origin" }).then(function (r) { return r.json(); }),
    fetch("/api/topics", { cache: "no-store" }).then(function (r) { return r.json(); })
  ]).then(function (a) {
    if (!(a[0] && a[0].ok && a[0].name)) { location.replace("./"); return; }
    avail = (a[1] && a[1].ok && a[1].topics[topic]) || 0;
    if (!avail) { fatal("No questions in " + T.name + " yet. Check back soon."); return; }
    buildSetup(); show("setup"); if (window.QuizLook) QuizLook.reveal();
  }).catch(function () { fatal("Couldn't load. Check your connection and refresh."); });

  /* ---------------- setup ---------------- */
  function countOptions() { var o = [10, 25, 50].filter(function (v) { return v <= avail; }); return o.length ? o : [avail]; }
  function buildSetup() {
    $("setupTitle").textContent = T.name;
    $("setup").style.setProperty("--t1", T.tint || "#4f46e5");
    if (window.QuizLook) document.querySelector(".su-hero").style.background = QuizLook.grad(T.tint || "#4f46e5");
    $("setupSub").textContent = (T.full ? T.full + " \u00b7 " : "") + avail + " question" + (avail === 1 ? "" : "s");
    var co = countOptions(); opt.n = co.indexOf(10) >= 0 ? 10 : co[0];
    $("optCount").innerHTML = co.map(function (v) { return '<button type="button" role="radio" data-v="' + v + '">' + v + "</button>"; }).join("");
    $("optCount").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { opt.n = +b.getAttribute("data-v"); paintSetup(); } });
    $("optMode").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { opt.mode = b.getAttribute("data-v"); paintSetup(); } });
    $("timeChips").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var v = +b.getAttribute("data-v"); if (opt.mode === "item") opt.secs = v; else { opt.mins = v; minsTouched = true; }
      paintSetup();
    });
    $("timeVal").addEventListener("input", function () {
      var v = parseInt(this.value, 10) || 0;
      if (opt.mode === "item") opt.secs = v; else { opt.mins = v; minsTouched = true; }
      paintSetup(true);
    });
    $("startBtn").addEventListener("click", start);
    paintSetup();
  }
  var HELP = {
    free: "Take your time. Go back and forth freely.",
    item: "A clock on every question. Time's up, you move on. No going back.",
    total: "One clock for everything. It submits itself at zero."
  };
  var CHIPS = { item: [15, 30, 45, 60, 90, 120], total: [10, 20, 30, 45, 60, 90, 120] };
  function paintSetup(typing) {
    [].forEach.call($("optCount").children, function (b) { b.setAttribute("aria-checked", String(+b.getAttribute("data-v") === opt.n)); });
    [].forEach.call($("optMode").children, function (b) { b.setAttribute("aria-checked", String(b.getAttribute("data-v") === opt.mode)); });
    $("modeHelp").textContent = HELP[opt.mode];
    var tb = $("timeBox"), tv = $("timeVal");
    tb.hidden = opt.mode === "free";
    if (opt.mode === "total" && !minsTouched) opt.mins = Math.max(5, opt.n);
    if (opt.mode !== "free") {
      var item = opt.mode === "item", cur = item ? opt.secs : opt.mins;
      $("timeLabel").textContent = item ? "Seconds per question" : "Minutes for the whole exam";
      $("timeUnit").textContent = item ? "sec" : "min";
      tv.min = item ? 5 : 1; tv.max = item ? 600 : 360;
      if (!typing) tv.value = cur;
      $("timeChips").innerHTML = CHIPS[opt.mode].map(function (v) { return '<button type="button" data-v="' + v + '" aria-pressed="' + (v === cur) + '">' + v + (item ? "s" : "m") + "</button>"; }).join("");
    }
    var n = opt.n, sum;
    if (opt.mode === "item") sum = "<b>" + n + "</b> questions<span class=\"brk\"></span>" + opt.secs + " sec each";
    else if (opt.mode === "total") sum = "<b>" + n + "</b> questions<span class=\"brk\"></span>" + opt.mins + " min total";
    else sum = "<b>" + n + "</b> questions<span class=\"brk\"></span>your pace";
    $("setupSum").innerHTML = sum;
  }
  function start() {
    var msg = $("startMsg"); msg.textContent = "";
    if (opt.mode === "item" && !(opt.secs >= 5 && opt.secs <= 600)) { msg.textContent = "Choose between 5 and 600 seconds."; return; }
    if (opt.mode === "total" && !(opt.mins >= 1 && opt.mins <= 360)) { msg.textContent = "Choose between 1 and 360 minutes."; return; }
    var b = $("startBtn"); b.disabled = true; msg.className = "gate-msg"; msg.textContent = "Getting your questions…";
    fetch("/api/questions?topic=" + encodeURIComponent(topic) + "&n=" + opt.n, { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.json().then(function (d) { return { r: r, d: d }; }); })
      .then(function (x) {
        if (x.r.status === 401) { location.replace("./"); return; }
        if (!x.d.ok) throw new Error(x.d.message || "Something went wrong.");
        begin(x.d.questions);
      }).catch(function (e) { msg.className = "gate-msg bad"; msg.textContent = e.message || "Couldn't load the questions."; })
      .then(function () { b.disabled = false; });
  }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------------- exam ---------------- */
  function begin(list) {
    qs = list; perm = {}; ans = {}; cur = 0; grading = false; result = null; usedMs = 0;
    qs.forEach(function (q) { perm[q.id] = shuffle(q.c.map(function (_, i) { return i; })); });
    state = "exam"; startedAt = Date.now();
    totalEnd = startedAt + opt.mins * 60000;
    $("qTotal").textContent = qs.length;
    buildDots();
    show("exam");
    renderQ(0);
    clearInterval(tick); tick = setInterval(onTick, 250); onTick();
    $("btnSubmit").innerHTML = '<i class="bi bi-send-fill"></i> Submit';
    var old = $("examMsg"); if (old) old.remove();
  }
  function onTick() {
    if (state !== "exam") return;
    var now = Date.now(), t = $("qTimer"), txt = $("qTimerText"), left;
    if (opt.mode === "free") { txt.textContent = fmt(now - startedAt); t.className = "q-timer"; return; }
    if (opt.mode === "total") { left = totalEnd - now; txt.textContent = fmt(left); t.className = "q-timer" + (left <= 60000 ? " warn" : ""); if (left <= 0) submit(true); return; }
    left = itemEnd - now; txt.textContent = fmt(left); t.className = "q-timer" + (left <= 10000 ? " warn" : "");
    if (left <= 0) { if (cur >= qs.length - 1) submit(true); else go(cur + 1, true); }
  }
  function buildDots() {
    $("navDots").innerHTML = qs.map(function (q, i) { return opt.mode === "item" ? '<span class="q-dot" data-i="' + i + '">' + (i + 1) + "</span>" : '<button type="button" class="q-dot" data-i="' + i + '" aria-label="Question ' + (i + 1) + '">' + (i + 1) + "</button>"; }).join("");
  }
  function paintDots() {
    [].forEach.call($("navDots").children, function (d, i) {
      d.classList.toggle("is-now", i === cur);
      d.classList.toggle("is-done", ans[qs[i].id] !== undefined && ans[qs[i].id] !== null);
      d.classList.toggle("is-past", opt.mode === "item" && i < cur);
      if (i === cur) d.setAttribute("aria-current", "step"); else d.removeAttribute("aria-current");
    });
  }
    var flipT = null, swapping = false;
  function fillQ(q) {
    var len = q.q.length, longest = Math.max.apply(null, q.c.map(function (c) { return c.length; }));
    $("qNum").textContent = "Question " + (cur + 1);
    $("qText").innerHTML = M(q.q);
    $("qCard").setAttribute("data-size", len <= 70 ? "1" : len <= 140 ? "2" : len <= 260 ? "3" : "4");
    var box = $("qChoices");
    box.className = "q-choices" + (longest > 46 || q.c.length > 4 ? " one" : "");
    box.setAttribute("data-size", longest <= 24 ? "1" : longest <= 80 ? "2" : "3");
    box.innerHTML = perm[q.id].map(function (orig, pos) {
      return '<button type="button" class="q-choice" style="--i:' + pos + '" role="radio" data-o="' + orig + '" aria-checked="' + (ans[q.id] === orig) + '"><span class="q-letter">' + LETTERS[pos] + '</span><span class="q-ctext">' + M(q.c[orig]) + "</span></button>";
    }).join("");
    paintChoices();
  }
  function renderQ(dir) {
    var q = qs[cur], card = $("qCard");
    $("qNow").textContent = cur + 1;
    $("qBar").style.width = ((cur + 1) / qs.length * 100) + "%";
    var last = cur === qs.length - 1;
    $("btnPrev").hidden = opt.mode === "item"; $("btnPrev").disabled = cur === 0;
    $("btnNext").hidden = last; $("btnSubmit").hidden = !last;
    if (opt.mode === "item") itemEnd = Date.now() + opt.secs * 1000;
    paintDots();
    clearTimeout(flipT);
    if (!dir || reduceMotion()) { swapping = false; card.className = "q-card"; fillQ(q); }
    else {
      swapping = true;
      card.className = "q-card flip-out" + (dir < 0 ? " back" : "");
      flipT = setTimeout(function () {
        fillQ(qs[cur]); swapping = false;
        card.className = "q-card flip-in" + (dir < 0 ? " back" : "");
      }, 170);
    }
    onTick();
  }
  function paintChoices() {
    var q = qs[cur];
    [].forEach.call($("qChoices").querySelectorAll(".q-choice"), function (b) {
      var on = ans[q.id] === +b.getAttribute("data-o");
      b.classList.toggle("is-on", on); b.setAttribute("aria-checked", String(on));
    });
  }
  function pick(orig) {
    if (swapping) return;
    var q = qs[cur];
    ans[q.id] = ans[q.id] === orig ? undefined : orig;
    if (ans[q.id] === undefined) delete ans[q.id];
    paintChoices(); paintDots();
  }
  function go(i, auto) {
    if (i < 0 || i >= qs.length || i === cur || grading) return;
    if (opt.mode === "item" && i < cur) return;
    var dir = i > cur ? 1 : -1; cur = i; renderQ(dir);
  }
  $("qChoices").addEventListener("click", function (e) { var b = e.target.closest(".q-choice"); if (b && state === "exam" && !grading) pick(+b.getAttribute("data-o")); });
  $("btnNext").addEventListener("click", function () { go(cur + 1); });
  $("btnPrev").addEventListener("click", function () { go(cur - 1); });
  $("navDots").addEventListener("click", function (e) { var d = e.target.closest("button.q-dot"); if (d && opt.mode !== "item") go(+d.getAttribute("data-i")); });
  $("btnSubmit").addEventListener("click", function () { requestSubmit(); });

  function unanswered() { return qs.filter(function (q) { return ans[q.id] === undefined; }).length; }
  function requestSubmit() {
    if (grading) return;
    var u = unanswered();
    if (!u) { submit(false); return; }
    $("confirmText").textContent = "You have " + u + " unanswered question" + (u === 1 ? "" : "s") + ". " + (opt.mode === "item" ? "You can't come back to them." : "They will be marked as unanswered.");
    $("confirm").hidden = false; $("confirmYes").focus();
  }
  $("confirmNo").addEventListener("click", function () { $("confirm").hidden = true; });
  $("confirmYes").addEventListener("click", function () { $("confirm").hidden = true; submit(false); });

  function submit(auto) {
    if (grading || state !== "exam") return;
    grading = true; $("confirm").hidden = true;
    if (!usedMs) usedMs = Date.now() - startedAt;
    clearInterval(tick);
    var btn = $("btnSubmit"); btn.hidden = false; btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Grading…';
    var old = $("examMsg"); if (old) old.remove();
    var body = {}; qs.forEach(function (q) { body[q.id] = ans[q.id] === undefined ? null : ans[q.id]; });
    fetch("/api/grade", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: body }) })
      .then(function (r) { return r.json().then(function (d) { return { r: r, d: d }; }); })
      .then(function (x) {
        if (x.r.status === 401) { location.replace("./"); return; }
        if (!x.d.ok) throw new Error(x.d.message || "Something went wrong.");
        result = x.d; state = "review"; grading = false; btn.disabled = false; startReview();
      }).catch(function (e) {
        grading = false; btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Try submitting again';
        var m = document.createElement("p"); m.id = "examMsg"; m.className = "gate-msg bad"; m.setAttribute("role", "alert");
        m.textContent = (e.message || "Couldn't submit.") + " Your answers are still here.";
        $("exam").insertBefore(m, document.querySelector("#exam .q-nav"));
      });
  }

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || "")) return;
    var k = e.key;
    if (state === "exam" && $("confirm").hidden && !grading) {
      var li = LETTERS.indexOf(k.toUpperCase());
      if (k.length === 1 && li >= 0) { var q = qs[cur], o = perm[q.id][li]; if (o !== undefined) { pick(o); e.preventDefault(); } }
      else if (k === "ArrowRight") go(cur + 1);
      else if (k === "ArrowLeft") go(cur - 1);
    } else if (state === "review") {
      if (k === "ArrowRight") rvGo(rvIdx + 1); else if (k === "ArrowLeft") rvGo(rvIdx - 1);
    }
  });
  window.addEventListener("beforeunload", function (e) { if (state === "exam" && Object.keys(ans).length) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------------- review ---------------- */
  function startReview() {
    var order = {}; qs.forEach(function (q, i) { order[q.id] = i; });
    result.results.sort(function (a, b) { return order[a.id] - order[b.id]; });
    result.results.forEach(function (r) { r.pos = order[r.id]; r.status = r.pick === null ? "skip" : r.correct ? "ok" : "bad"; });
    var tot = result.total, sc = result.score, pct = tot ? Math.round(sc / tot * 100) : 0;
    var wrong = result.results.filter(function (r) { return r.status === "bad"; }).length, skip = result.results.filter(function (r) { return r.status === "skip"; }).length;
    $("scorePct").textContent = pct + "%"; $("scoreRing").style.setProperty("--p", pct);
    $("scoreRing").className = "q-ring " + (pct >= 75 ? "good" : pct >= 50 ? "mid" : "low");
    $("scoreTitle").textContent = (pct >= 90 ? "Excellent! " : pct >= 75 ? "Great job! " : pct >= 50 ? "Good effort. " : "Keep practicing. ") + sc + " / " + tot;
    $("scoreSub").textContent = wrong + " wrong · " + skip + " unanswered · " + fmt(usedMs) + " used";
    var counts = { all: tot, bad: wrong, skip: skip, ok: sc };
    var defs = [["all", "All"], ["bad", "Wrong"], ["skip", "Unanswered"], ["ok", "Correct"]];
    $("rvFilters").innerHTML = defs.filter(function (d) { return d[0] === "all" || counts[d[0]] > 0; }).map(function (d) { return '<button type="button" data-f="' + d[0] + '">' + d[1] + " (" + counts[d[0]] + ")</button>"; }).join("");
    rvFilter = wrong ? "bad" : "all"; applyFilter(); show("review");
  }
  function applyFilter() {
    rv = result.results.filter(function (r) { return rvFilter === "all" || r.status === rvFilter; });
    rvIdx = 0;
    [].forEach.call($("rvFilters").children, function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-f") === rvFilter)); });
    $("rvDots").innerHTML = rv.map(function (r, i) { return '<button type="button" class="q-dot is-' + r.status + '" data-i="' + i + '" aria-label="Question ' + (r.pos + 1) + '">' + (r.pos + 1) + "</button>"; }).join("");
    paintRv(0);
  }
  function paintRv(dir) {
    var r = rv[rvIdx], card = $("rvCard");
    if (!r) { card.innerHTML = '<p class="text-secondary mb-0">Nothing here.</p>'; return; }
    var label = { ok: "Correct", bad: "Wrong", skip: "Unanswered" }[r.status];
    var order = perm[r.id] || r.c.map(function (_, i) { return i; });
    card.innerHTML = '<div class="q-num">Question ' + (r.pos + 1) + ' <span class="q-chip ' + r.status + '">' + label + '</span></div><h2 class="q-text">' + M(r.q) + '</h2><div class="q-choices">' +
      order.map(function (o, p) {
        var isAns = o === r.ans, isPick = o === r.pick, cls = isAns ? " is-right" : isPick ? " is-wrong" : "";
        var tag = isAns && isPick ? "Your answer · correct" : isAns ? "Correct answer" : isPick ? "Your answer" : "";
        return '<div class="q-choice static' + cls + '"><span class="q-letter">' + LETTERS[p] + '</span><span class="q-ctext">' + M(r.c[o]) + "</span>" + (tag ? '<span class="q-tag">' + tag + "</span>" : "") + "</div>";
      }).join("") + "</div>" +
      (r.expl ? '<div class="q-expl"><i class="bi bi-lightbulb"></i><div><b>Explanation</b><p>' + M(r.expl) + "</p></div></div>" : "");
    $("rvPos").textContent = (rvIdx + 1) + " of " + rv.length;
    $("rvPrev").disabled = rvIdx === 0; $("rvNext").disabled = rvIdx === rv.length - 1;
    [].forEach.call($("rvDots").children, function (d, i) { d.classList.toggle("is-now", i === rvIdx); });
    if (dir && !reduceMotion()) { card.classList.remove("in-r", "in-l"); void card.offsetWidth; card.classList.add(dir > 0 ? "in-r" : "in-l"); }
  }
  function rvGo(i) { if (i < 0 || i >= rv.length || i === rvIdx) return; var d = i > rvIdx ? 1 : -1; rvIdx = i; paintRv(d); }
  $("rvPrev").addEventListener("click", function () { rvGo(rvIdx - 1); });
  $("rvNext").addEventListener("click", function () { rvGo(rvIdx + 1); });
  $("rvDots").addEventListener("click", function (e) { var d = e.target.closest("button.q-dot"); if (d) rvGo(+d.getAttribute("data-i")); });
  $("rvFilters").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { rvFilter = b.getAttribute("data-f"); applyFilter(); } });
  $("btnAgain").addEventListener("click", function () { usedMs = 0; show("setup"); paintSetup(); state = "setup"; });
})();
