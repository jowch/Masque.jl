# Limits slider

The axis is built with `limits = (0, 6, 0, 40)`. Every marker inside
that window is still a hit target. In a live notebook a PlutoUI slider
is `@bind` to the upper x limit, the figure is rebuilt, and `masque`
projects the overlay onto the new limits.

This player is one setting of that window. Hover or click a marker.
Dragging the axis is [Drag to pan](@ref), which does not rebuild the
cell.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-limits" title="Limits slider"
        style="width:100%;height:520px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-gal-limits");
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
  el.src = (pretty ? "../../embeds/" : "../embeds/") + "gallery_limits.html";
})();
</script>
```

## Variations

The same rebuild sets `azimuth` and `elevation` on an `Axis3`. Selection
survives either rebuild when you pass `selected=` into the new
`masque` call. A `Ref` that does not read the slider holds the indices
between rebuilds. Do not pass `selected=` to store a camera pose.

!!! note

    Re-projecting after a limits change is the same on `:cairo` and
    `:webgl`. Each rebuild is a new PNG on Cairo and a new scene on WebGL,
    so a slider is the expensive way to move a camera. This page cannot run
    the PlutoUI slider: the player has no kernel. Use the slider in a
    notebook. For in-drag frames without a rebuild, see [Drag to pan](@ref)
    and [Drag to orbit](@ref).

