// Cell-series players on Documenter pages: `<iframe data-masque-embed="<name>">` loads
// `embeds/<name>.html`, follows the page's light/dark theme, and falls back to the
// player's text twin when it cannot render.
//
// The text twin is the `details` admonition (`Main.masque_fallback` in docs/make.jl)
// right after the iframe's `.masque-embed-wrap`. A `pluto_html` player draws its cells
// only once Pluto's frontend loads from jsDelivr. If no `pluto-cell` appears within
// LOAD_GRACE_MS of the iframe's load event, or the iframe never loads within
// HANG_MS of scrolling into view, the iframe is hidden and the twin opens. A player that
// renders within GIVE_UP_MS of loading swaps back.
(function () {
  "use strict";
  var LOAD_GRACE_MS = 8000;
  var HANG_MS = 20000;
  var GIVE_UP_MS = 60000;

  function isDocDark() {
    var c = document.documentElement.className || "";
    if (!c) return false;
    if (/(^|\s)theme--(documenter-light|catppuccin-latte)(\s|$)/.test(c)) return false;
    return /(^|\s)theme--/.test(c);
  }

  function frameDoc(el) {
    try {
      return el.contentDocument;
    } catch (e) {
      return null;
    }
  }

  function textTwin(wrap) {
    var next = wrap && wrap.nextElementSibling;
    return next && next.matches("details.admonition.is-details") ? next : null;
  }

  function mount(el) {
    var wrap = el.closest(".masque-embed-wrap") || el;
    var twin = textTwin(wrap);
    var rendered = false;
    var loaded = false;

    function pushTheme() {
      var doc = frameDoc(el);
      if (doc && doc.documentElement) doc.documentElement.classList.toggle("pluto-dark", isDocDark());
    }

    function showPlayer() {
      rendered = true;
      wrap.style.display = "";
      if (twin && twin.classList.contains("masque-fallback-active")) {
        twin.classList.remove("masque-fallback-active");
        twin.open = false;
      }
    }

    function showTwin() {
      if (rendered || !twin) return;
      wrap.style.display = "none";
      twin.classList.add("masque-fallback-active");
      twin.open = true;
    }

    // true: the player drew its cells. null: cannot tell (a file:// build keeps the
    // iframe cross-origin), so leave the player alone.
    function drew() {
      var doc = frameDoc(el);
      if (!doc) return null;
      return !!doc.querySelector("pluto-cell");
    }

    el.addEventListener("load", function () {
      var doc = frameDoc(el);
      if (doc && doc.URL === "about:blank") return;
      loaded = true;
      pushTheme();
      var t0 = Date.now();
      (function poll() {
        var d = drew();
        if (d === null || d) return showPlayer();
        var waited = Date.now() - t0;
        if (waited > LOAD_GRACE_MS) showTwin();
        if (waited < GIVE_UP_MS) setTimeout(poll, 250);
      })();
    });

    if (twin && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        if (!entries.some(function (e) { return e.isIntersecting; })) return;
        io.disconnect();
        setTimeout(function () {
          if (!loaded) showTwin();
        }, HANG_MS);
      });
      io.observe(wrap);
    }

    new MutationObserver(pushTheme).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    var base = typeof documenterBaseURL === "string" ? documenterBaseURL : ".";
    el.src = base + "/embeds/" + el.getAttribute("data-masque-embed") + ".html";
  }

  function mountAll() {
    document.querySelectorAll("iframe[data-masque-embed]").forEach(mount);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountAll);
  } else {
    mountAll();
  }
})();
