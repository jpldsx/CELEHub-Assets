// The "quick check + survey" gate of CELEHub Quiz (same steps as CELEHub, without the ad-blocker step).
// Used by index.html only. Calls window.QuizGate.onUnlock(name) when the visitor is allowed in.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var KEY = (window.QUIZ || {}).TURNSTILE_SITE_KEY || "";
  var ENDPOINT = "/api/survey";
  var gate = $("gate"), form = $("gateForm"), submit = $("gateSubmit"), verify = $("gateVerify");
  var tsWidget = null, tsToken = "", afterVerifyMsg = "", pending = "", me = null;
  var ADULT_AGE = 18, MINOR_KEY = "celehub.minor", minorTimer = null;

  function parseName(full) {
    var s = String(full), m = s.match(/^Visitor ID ([0-9A-Z]{5})$/) || s.match(/#([0-9A-Z]{5})$/);
    return m ? { label: "Visitor ID", id: m[1] } : { label: s, id: "" };
  }
  function vMsg(t, kind) { var el = $("verifyMsg"); el.textContent = t || ""; el.className = "gate-msg" + (kind ? " " + kind : ""); }
  function gMsg(t, bad) { var el = $("gateMsg"); el.textContent = t || ""; el.className = "gate-msg" + (bad ? " bad" : ""); }
  function ready() { submit.disabled = !tsToken; }
  function setGated(on) {
    gate.hidden = !on;
    document.body.classList.toggle("gated", on);
    var parts = document.querySelectorAll("header.mt-header, main, footer");
    for (var i = 0; i < parts.length; i++) { if (on) parts[i].setAttribute("inert", ""); else parts[i].removeAttribute("inert"); }
  }
  function hideAll() { ["gateLoading", "gateVerify", "gateForm", "gateDone", "gateMinor"].forEach(function (id) { $(id).hidden = true; }); }

  function loadTurnstile(cb) {
    if (window.turnstile) return cb();
    var s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true; s.defer = true; s.onload = cb;
    s.onerror = function () { vMsg("Couldn't load the security check. Turn off any blockers and refresh the page.", "bad"); };
    document.head.appendChild(s);
  }
  function renderTurnstile() {
    if (!KEY) { vMsg("Setup needed: add your Turnstile site key to TURNSTILE_SITE_KEY in js/config.js.", "bad"); return; }
    loadTurnstile(function () {
      if (tsWidget !== null) { window.turnstile.reset(tsWidget); return; }
      tsWidget = window.turnstile.render("#tsBox", {
        sitekey: KEY,
        callback: function (t) { tsToken = t; ready(); if (!verify.hidden) verified(); },
        "expired-callback": function () { tsToken = ""; ready(); if (!form.hidden) showVerify("Verification expired. Please send the form again."); },
        "error-callback": function () { tsToken = ""; ready(); vMsg("Security check failed. Please refresh and try again.", "bad"); }
      });
    });
  }
  function showVerify(msg) {
    afterVerifyMsg = msg || "";
    hideAll(); verify.hidden = false; vMsg(""); tsToken = ""; ready(); setGated(true); renderTurnstile();
  }
  function verified() {
    vMsg("✓ Verified", "ok");
    setTimeout(function () {
      if (!tsToken || verify.hidden) return;
      verify.hidden = true; form.hidden = false;
      gMsg(afterVerifyMsg, !!afterVerifyMsg); afterVerifyMsg = "";
      try { $("gName").focus(); } catch (e) {}
    }, 600);
  }

  function minorFlagged() { try { var t = +localStorage.getItem(MINOR_KEY); return t > 0 && Date.now() - t < 864e5; } catch (e) { return false; } }
  function showMinor() {
    try { localStorage.setItem(MINOR_KEY, String(Date.now())); } catch (e) {}
    hideAll(); $("gateMinor").hidden = false; setGated(true);
    var u = String(window.CELEHUB_MINOR_URL || "https://www.khanacademy.org/"), go = $("minorGo"), count = $("minorCount");
    if (!/^https:\/\//i.test(u)) { go.hidden = true; count.textContent = ""; return; }
    go.hidden = false; go.href = u;
    var left = 8; clearInterval(minorTimer);
    count.textContent = "Taking you there in " + left + "…";
    minorTimer = setInterval(function () {
      left--;
      if (left <= 0) { clearInterval(minorTimer); window.location.replace(u); }
      else count.textContent = "Taking you there in " + left + "…";
    }, 1000);
  }
  function showGate(msg) { if (minorFlagged()) showMinor(); else showVerify(msg); }

  function unlock(name) {
    me = name;
    var p = parseName(name); $("asName").textContent = p.label; $("asId").textContent = p.id; $("asBox").hidden = false;
    setGated(false);
    if (window.QuizGate && window.QuizGate.onUnlock) window.QuizGate.onUnlock(name);
  }
  function showDone(name) {
    pending = name; var p = parseName(name);
    $("doneLabel").textContent = p.label; $("doneId").textContent = p.id;
    hideAll(); $("gateDone").hidden = false;
    setTimeout(function () { $("gateContinue").focus(); }, 60);
  }
  $("gateContinue").addEventListener("click", function () { $("gateDone").hidden = true; unlock(pending); });

  fetch(ENDPOINT, { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d && d.ok && d.name) unlock(d.name); else showGate(); })
    .catch(function () { showGate(); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = form.elements;
    if (f.website.value) return;
    var data = {
      fullName: f.fullName.value.trim().replace(/\s+/g, " "), age: f.age.value.trim(), school: f.school.value.trim(),
      reviewCenter: f.reviewCenter.value.trim(), consent: f.consent.checked, turnstileToken: tsToken
    };
    var age = parseInt(data.age, 10);
    if (data.fullName.length < 2 || !data.school || !data.reviewCenter || !data.age) { gMsg("Please fill in every field.", true); return; }
    if (!(age >= 5 && age <= 99)) { gMsg("Please enter a valid age.", true); return; }
    if (age < ADULT_AGE) { form.reset(); showMinor(); return; }
    var C = window.CELEHUB_CHECKS;
    var problem = C ? (C.nameProblem(data.fullName) || C.schoolProblem(data.school) || C.placeProblem(data.reviewCenter, "review center")) : "";
    if (problem) { gMsg(problem, true); return; }
    if (!data.consent) { gMsg("Please tick the box to continue.", true); return; }
    if (!data.turnstileToken) { gMsg("Please wait for the security check to finish.", true); return; }
    submit.disabled = true; gMsg("Saving…");
    fetch(ENDPOINT, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (d && d.minor) { form.reset(); showMinor(); return; }
          if (!r.ok || !d.ok) {
            var er = new Error(d.message || "Something went wrong. Please try again.");
            er.keep = r.status === 400 && !/security check/i.test(er.message);
            throw er;
          }
          form.reset(); tsToken = ""; showDone(d.name);
        });
      }).catch(function (err) {
        if (err.keep && tsToken) { gMsg(err.message, true); ready(); return; }
        showVerify(err.message);
      });
  });

  $("notYou").addEventListener("click", function () {
    fetch(ENDPOINT, { method: "DELETE", credentials: "same-origin" }).catch(function () {}).then(function () {
      me = null; $("asBox").hidden = true; form.reset(); showGate();
    });
  });
  window.QuizGate = window.QuizGate || {};
})();
