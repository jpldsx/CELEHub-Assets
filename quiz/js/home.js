// Topic picker (index.html). Shown behind the gate; counts come from /api/topics.
(function () {
  "use strict";
  var Q = window.QUIZ || { TOPICS: [] };
  var grid = document.getElementById("topicGrid");
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  if (Q.CELEHUB_URL) document.getElementById("celehubLink").href = Q.CELEHUB_URL;

  function paint(counts) {
    grid.innerHTML = Q.TOPICS.map(function (t) {
      var n = counts ? (counts[t.id] || 0) : null;
      var live = n === null || n > 0;
      var meta = n === null ? "" : n > 0 ? n + " question" + (n === 1 ? "" : "s") : "Coming soon";
      return '<a class="topic-card' + (live ? "" : " is-empty") + '" style="--tint:' + esc(t.tint || "#4f46e5") + '" ' +
        (live ? 'href="quiz.html?t=' + encodeURIComponent(t.id) + '"' : 'aria-disabled="true" tabindex="-1"') + ">" +
        '<span class="topic-ico"><i class="bi ' + esc(t.icon || "bi-journal-text") + '"></i></span>' +
        '<span class="topic-name">' + esc(t.name) + "</span>" +
        (t.full ? '<span class="topic-full">' + esc(t.full) + "</span>" : "") +
        '<span class="topic-meta">' + esc(meta) + "</span>" +
        (live ? '<span class="topic-go"><i class="bi bi-arrow-right"></i></span>' : "") + "</a>";
    }).join("");
  }
  paint(null);
  fetch("/api/topics", { cache: "no-store" }).then(function (r) { return r.json(); })
    .then(function (d) { paint(d && d.ok ? d.topics : {}); })
    .catch(function () { var e = document.getElementById("topicErr"); e.hidden = false; e.textContent = "Couldn't load the topics. Refresh the page."; paint({}); });
})();
