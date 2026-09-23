# Drag to orbit

`ViewInteractable` on an `Axis3` orbits the camera while you drag.
`azimuth` and `elevation` change in the live session. The bond stays
empty of any view payload, same as a 2D pan.

A static `Axis3` is a valid figure on CairoMakie. You do not need
WGLMakie to draw the three markers. See [Pan and orbit](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-orbit" title="Drag to orbit"
        style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-gal-orbit");
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
  el.src = (pretty ? "../../embeds/" : "../embeds/") + "gallery_orbit.html";
})();
</script>
```

## Variations

A slider that sets `azimuth` and `elevation` and rebuilds the figure is
the other way to orbit. That path re-runs the cell. This drag does not.
Persisting a pose across a remount means storing the two angles
yourself and rebuilding. `selected=` does not store a camera.

!!! note

    Orbit commits nothing on both backends. In-drag frames need a live
    kernel: a PNG from `:cairo`, a serialized scene from `:webgl`. This
    player is the resting Cairo figure, so a drag here does not move the
    markers. Reach for `:webgl` when you want the orbit on the GPU canvas.
    `PolarAxis` and a `Colorbar` are not orbit targets.

