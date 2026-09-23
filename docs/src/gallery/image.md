# Image ROI

The figure is an RGB image. The box selects a window of cells, not a
list of pixels. On release the bond is one `GridWindowEvent`: 1-based
inclusive `i1:i2` and `j1:j2`, plus the data bounds. `R[region]` is
`R[region.i1:region.i2, region.j1:region.j2]`. The image array stays in
Julia.

The grid layer exists so the brush has cells to land on. The box is the
outline; the enclosed block is fill-only. See [Inspect a grid](@ref)
and [Brush a region](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-image" title="Image ROI"
        style="width:100%;height:680px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-gal-image");
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
  el.src = (pretty ? "../../embeds/" : "../embeds/") + "gallery_image.html";
})();
</script>
```

## Variations

A live notebook slices each channel and reports min, p1, p50, p99, and
max, then draws one histogram per channel. That cell runs once per
committed box, not per pointer frame. A miss is a `GridWindowEvent`
whose `i1:i2` is empty, not `[]`.

!!! note

    An image brush is the same event on `:cairo` and `:webgl`, on a 2D
    axis. `Axis3` and `PolarAxis` raise `ArgumentError`. This player shows
    the resting box on the Cairo figure. It does not scrub windows: every
    grid brush shares one snapshot key, so a static page cannot list two
    different rectangles. Quantiles need the live notebook.

