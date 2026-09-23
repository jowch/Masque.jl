# Colorbar

`masque(fig)` finds a `Colorbar` in the figure layout and adds a
readout. Hover the bar for the data value under the pointer. A click in
a live notebook round-trips a `ColorbarEvent` with `value`. The layer
kind is `:axis`.

`masque(fig)` builds that [`ColorbarInteractable`](@ref) for you. Write
one yourself when you are not using `masque(fig)`. See
[Read coordinates](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-colorbar" title="Colorbar"
        style="width:100%;height:1100px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-gal-colorbar");
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
  el.src = (pretty ? "../../embeds/" : "../embeds/") + "gallery_colorbar.html";
})();
</script>
```

## Variations

Pass `value=` to put the readout back at a number, or pass a
`ColorbarEvent`. The heatmap cells are a separate layer. Hovering a
cell is the grid readout, not the bar.

!!! note

    The colorbar readout is the same on `:cairo` and `:webgl`. This player
    is the Cairo figure. Hover works here; the click bond is a live
    notebook, because a colorbar click is a value rather than a listed
    mark. `Colorbar` is not a pan or orbit target.

