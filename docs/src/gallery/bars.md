# Bars and areas

`masque(fig)` walks the figure and picks up histogram bins, waterfall
bars, crossbar ranges, bar plots, and horizontal and vertical spans. No
interactable is written by hand. Hover a bar, a band, or a range.

The four panels are one widget. For a single `barplot!`, see
[Click marks](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-bars" title="Bars and areas"
        style="width:100%;height:1480px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-gal-bars");
  if (!el) return;
  function isDocDark() {
    var c = document.documentElement.className || "";
    if (!c) return false;
    if (/(^|\s)theme--(documenter-light|catppuccin-latte)(\s|$)/.test(c)) return false;
    return /(^|\s)theme--/.test(c);
  }
  function pushTheme() {
    var doc = el.contentDocument;
    if (!doc) return;
    doc.documentElement.classList.toggle("pluto-dark", isDocDark());
  }
  el.addEventListener("load", pushTheme);
  new MutationObserver(pushTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  el.src = (pretty ? "../../embeds/" : "../embeds/") + "gallery_bars.html";
})();
</script>
```

## Variations

The same call also covers the other bar-like recipes in
[Recipes masque(fig) extracts](@ref). A recipe that is not in that table
is not a hit target until you add an interactable yourself.

!!! note

    Auto-extraction of these recipes is the same on `:cairo` and `:webgl`.
    This player is the Cairo figure, and hover stays in the overlay: the
    page does not re-run Julia on a click. Reach for `:webgl` when the
    figure is large or you are already on the live canvas. `barplot!` on a
    `PolarAxis` is not this figure; that call is skipped with `@warn`.

