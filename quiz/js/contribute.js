// Contribute page: a visitor sends a question + answer key + solution. The admin approves it in Telegram.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var T = (window.QUIZ && window.QUIZ.TOPICS) || [], subs = {}, busy = false;

  function opt(v, t) { var o = document.createElement("option"); o.value = v; o.textContent = t; return o; }
  function paintSubs() {
    var list = Object.keys(subs[$("ctTopic").value] || {}), s = $("ctSub");
    s.innerHTML = ""; s.appendChild(opt("", "Not sure"));
    list.forEach(function (n) { s.appendChild(opt(n, n)); });
    s.parentNode.hidden = !list.length;
  }
  function build() {
    T.forEach(function (t) { $("ctTopic").appendChild(opt(t.id, t.name)); });
    var q = new URLSearchParams(location.search).get("t");
    if (q && T.some(function (t) { return t.id === q; })) $("ctTopic").value = q;
    $("ctChoices").innerHTML = "ABCD".split("").map(function (L, i) {
      return '<div class="ct-choice"><span class="ct-letter">' + L + '</span><input type="text" class="form-control nt-input" maxlength="400" aria-label="Choice ' + L + '" data-i="' + i + '">' +
        '<label class="ct-key"><input type="radio" name="ctKey" value="' + i + '" aria-label="Choice ' + L + ' is correct"><span>Correct</span></label></div>';
    }).join("");
    paintSubs();
  }
  function say(t, bad) { var m = $("ctMsg"); m.textContent = t || ""; m.className = "gate-msg" + (bad ? " bad" : ""); }

  $("ctTopic").addEventListener("change", paintSubs);
  $("ctAgain").addEventListener("click", function () {
    say(""); $("ctDone").hidden = true; $("ctForm").hidden = false; $("ctQ").focus();
  });
  $("ctF").addEventListener("submit", function (e) {
    e.preventDefault(); if (busy) return;
    var inputs = [].slice.call($("ctChoices").querySelectorAll('input[type="text"]')), key = $("ctF").querySelector('input[name="ctKey"]:checked');
    var q = $("ctQ").value.trim(), sol = $("ctSol").value.trim(), ch = inputs.map(function (i) { return i.value.trim(); });
    if (q.length < 15) return say("Write the full problem.", true);
    if (ch.some(function (c) { return !c; })) return say("Fill in all four choices.", true);
    if (!key) return say("Select the correct choice.", true);
    if (sol.length < 30) return say("Show your solution step by step so the admin can verify it.", true);
    if (!$("ctOk").checked) return say("Please confirm the box before sending.", true);
    busy = true; $("ctSend").disabled = true; say("Sending…");
    fetch("/api/contribute", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: $("ctTopic").value, sub: $("ctSub").value, q: q, choices: ch, ans: +key.value, solution: sol, source: $("ctSrc").value.trim(), website: $("ctWeb").value })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { r: r, d: d }; }); })
      .then(function (x) {
        if (x.r.status === 401) { location.replace("./"); return; }
        if (x.d && x.d.ok) { var tp = $("ctTopic").value; $("ctF").reset(); $("ctTopic").value = tp; paintSubs(); $("ctForm").hidden = true; $("ctDone").hidden = false; say(""); window.scrollTo(0, 0); return; }
        say((x.d && x.d.message) || "Couldn't send. Please try again.", true);
      })
      .catch(function () { say("No connection. Please try again.", true); })
      .then(function () { busy = false; $("ctSend").disabled = false; });
  });

  function start() {
    build();
    Promise.all([
      fetch("/api/survey", { cache: "no-store", credentials: "same-origin" }).then(function (r) { return r.json(); }),
      fetch("/api/topics", { cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return {}; })
    ]).then(function (a) {
      if (!a[0] || !a[0].name) { location.replace("./"); return; }
      subs = (a[1] && a[1].subs) || {}; paintSubs();
      $("ctLoading").hidden = true; $("ctForm").hidden = false;
    }).catch(function () { location.replace("./"); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
