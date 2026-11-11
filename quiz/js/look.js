// Shared look for CELEHub Quiz: topic colors and the "morph" from a topic panel into its setup page.
(function () {
  "use strict";
  var KEY = "quizMorph";
  function rgb(h) { h = h.replace("#", ""); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return "rgb(" + x.map(function (v, i) { return Math.round(v + (y[i] - v) * t); }).join(",") + ")"; }
  function grad(tint) {
    return "radial-gradient(900px 500px at 85% 10%, rgba(255,255,255,.22), transparent 60%), linear-gradient(135deg, " + mix(tint, "#000000", .45) + ", " + tint + " 60%, " + mix(tint, "#ffffff", .2) + ")";
  }
  // where the big title sits on the setup page (so the morph lands exactly on it)
  function heroFont() { var w = innerWidth; return w > 860 ? Math.min(Math.max(57.6, w * .11), 128) : Math.min(Math.max(54.4, w * .22), 96); }
  function heroPos(fs) {
    var w = innerWidth, h = innerHeight, left = Math.min(Math.max(22.4, w * .04), 51.2);
    return { left: left, top: w > 860 ? h / 2 - fs * .475 - Math.min(60, fs * .5 + 1) : left + 41 };
  }
  function reduce() { return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function make(g, name) {
    var ov = document.createElement("div"), t = document.createElement("div"), fs = heroFont(), p = heroPos(fs);
    ov.id = "morph"; ov.setAttribute("aria-hidden", "true");
    ov.style.cssText = "position:fixed;inset:0;z-index:3000;overflow:hidden;background:" + g;
    t.textContent = name;
    t.style.cssText = "position:absolute;left:" + p.left + "px;top:" + p.top + "px;font-weight:850;font-size:" + fs + "px;line-height:.95;font-family:inherit;letter-spacing:-.04em;color:#fff;white-space:nowrap;transform-origin:0 0;margin:0";
    ov.appendChild(t); document.body.appendChild(ov);
    return ov;
  }
  var EASE = "cubic-bezier(.76,0,.24,1)", MS = 560;
  var Look = {
    grad: grad,
    // home page: grow the clicked panel to fill the screen, then go to its page
    out: function (card, href, name, tint) {
      var g = grad(tint), r = card.getBoundingClientRect(), nameEl = card.querySelector(".hm-name"), nr = nameEl.getBoundingClientRect();
      var cf = parseFloat(getComputedStyle(nameEl).fontSize), ov = make(g, name), t = ov.firstChild, hf = heroFont(), p = heroPos(hf);
      ov.style.clipPath = "inset(" + r.top + "px " + (innerWidth - r.right) + "px " + (innerHeight - r.bottom) + "px " + r.left + "px)";
      t.style.transform = "translate(" + (nr.left - p.left) + "px," + (nr.top - p.top) + "px) scale(" + (cf / hf) + ")";
      void ov.offsetWidth;
      ov.style.transition = "clip-path " + MS + "ms " + EASE; t.style.transition = "transform " + MS + "ms " + EASE;
      ov.style.clipPath = "inset(0px 0px 0px 0px)"; t.style.transform = "none";
      try { sessionStorage.setItem(KEY, JSON.stringify({ g: g, name: name })); } catch (e) {}
      setTimeout(function () { location.href = href; }, MS + 30);
    },
    // setup page: the full-screen color is already there; shrink it into the left/top hero
    reveal: function () {
      var ov = document.getElementById("morph"); if (!ov) return;
      var hero = document.querySelector(".su-hero"); if (!hero) { Look.drop(); return; }
      var r = hero.getBoundingClientRect(), t = ov.firstChild;
      requestAnimationFrame(function () {
        ov.style.transition = "clip-path " + MS + "ms " + EASE + ", opacity .2s linear " + (MS - 120) + "ms";
        ov.style.clipPath = "inset(" + r.top + "px " + (innerWidth - r.right) + "px " + (innerHeight - r.bottom) + "px " + r.left + "px)";
        ov.style.opacity = "0";
        setTimeout(Look.drop, MS + 150);
      });
    },
    drop: function () { var ov = document.getElementById("morph"); if (ov) ov.remove(); },
    // page start: if we arrived through a morph, cover the screen right away
    arrive: function () {
      var v = null;
      try { v = JSON.parse(sessionStorage.getItem(KEY) || "null"); sessionStorage.removeItem(KEY); } catch (e) {}
      if (!v || reduce() || !v.g) return;
      make(v.g, v.name); setTimeout(Look.drop, 6000);
    }
  };
  window.QuizLook = Look;
  window.addEventListener("pageshow", function (e) { if (e.persisted) Look.drop(); });
})();
