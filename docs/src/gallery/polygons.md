# Polygons

`masque(fig)` also picks up filled areas: `band!`, `density!`,
`contourf!`, `violin!`, `voronoiplot!`, and `boxplot!`. Hover a region
to read its payload. Nothing here is wired with `PolygonInteractable`.

For a `poly!` you authored as a ring, see [Click marks](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-polygons" title="Polygons"
        style="width:100%;height:860px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-gal-polygons");
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
  el.src = (pretty ? "../../embeds/" : "../embeds/") + "gallery_polygons.html";
})();
</script>
```

## Variations

Pass the rings yourself when the geometry did not come from one of
those recipes:

```julia
PolygonInteractable(
    ax, rings;
    id = :regions,
    payloads = [(; index = k, shape = "ring$k") for k in eachindex(rings)],
)
```

The bond is an `ElementEvent` with `index` and the payload fields.

!!! note

    These filled-area recipes extract the same way on `:cairo` and
    `:webgl`. This player is the Cairo figure. Hover is overlay-only on the
    static page. A manual `PolygonInteractable` is the same hit on both
    backends. `heatmap!` on a `PolarAxis` is skipped with `@warn`; it is not
    a polygon layer.

