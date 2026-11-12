// A short heads-up shown once per visit: the practice questions may contain mistakes.
(function () {
  "use strict";
  var KEY = "quizNotice", box = document.getElementById("notice"), ok = document.getElementById("noticeOk");
  if (!box || !ok) return;
  function seen() { try { return sessionStorage.getItem(KEY) === "1"; } catch (e) { return false; } }
  function mark() { try { sessionStorage.setItem(KEY, "1"); } catch (e) {} }
  function close() { box.hidden = true; mark(); document.body.classList.remove("noticing"); }
  function open() { box.hidden = false; document.body.classList.add("noticing"); ok.focus(); }
  function check() {
    if (!box.hidden || seen()) return;
    if (document.body.classList.contains("gated")) return;      // wait until the visitor is through the survey
    open();
  }
  ok.addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !box.hidden) close(); });
  new MutationObserver(check).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  window.addEventListener("load", function () { setTimeout(check, 600); });
})();
