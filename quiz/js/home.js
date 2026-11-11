// Topic picker (index.html): full-screen panels. Counts come from /api/topics. Clicking a panel morphs into its page.
(function () {
  "use strict";
  var Q = window.QUIZ || { TOPICS: [] };
  var grid = document.getElementById("topicGrid");
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function paint(counts) {
    var L = window.QuizLook;
    grid.innerHTML = Q.TOPICS.map(function (t, i) {
      var n = counts ? (counts[t.id] || 0) : null, live = n === null || n > 0, tint = t.tint || "#4f46e5";
      return '<a class="hm-card' + (live ? "" : " is-empty") + '" style="--i:' + i + ";--g:" + (L ? L.grad(tint) : tint) + '" data-name="' + esc(t.name) + '" data-tint="' + esc(tint) + '" ' +
        (live ? 'href="quiz.html?t=' + encodeURIComponent(t.id) + '"' : 'aria-disabled="true" tabindex="-1"') + ">" +
        '<span class="hm-name">' + esc(t.name) + "</span>" +
        '<span class="hm-meta">' + (n === null ? "" : n > 0 ? "<b>" + n + "</b> question" + (n === 1 ? "" : "s") : "Soon") + (live ? '<span class="hm-go">&rarr;</span>' : "") + "</span></a>";
    }).join("");
  }
  paint(null);
  fetch("/api/topics", { cache: "no-store" }).then(function (r) { return r.json(); })
    .then(function (d) { paint(d && d.ok ? d.topics : {}); })
    .catch(function () { var e = document.getElementById("topicErr"); e.hidden = false; e.textContent = "Couldn't load the topics. Refresh the page."; paint({}); });

  grid.addEventListener("click", function (e) {
    var a = e.target.closest("a.hm-card");
    if (!a) return;
    if (a.classList.contains("is-empty")) { e.preventDefault(); return; }
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button || !window.QuizLook || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    e.preventDefault();
    a.classList.add("is-chosen"); grid.classList.add("leaving");
    window.QuizLook.out(a, a.getAttribute("href"), a.getAttribute("data-name"), a.getAttribute("data-tint"));
  });
  window.addEventListener("pageshow", function (e) { if (e.persisted) grid.classList.remove("leaving"); });
})();
