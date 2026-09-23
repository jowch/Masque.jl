# Drag to pan

`ViewInteractable` on a 2D axis pans while you drag. The bond does not
update when the camera moves. A click on a marker still reports that
point. The camera is not an analysis value.

In-drag frames need a live kernel. They travel on `with_js_link`, not
on `@bind`. See [Pan and orbit](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-pan" title="Drag to pan"
        style="width:100%;height:520px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-gal-pan");
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
  el.src = (pretty ? "../../embeds/" : "../embeds/") + "gallery_pan.html";
})();
</script>
```

## Variations

Shift+drag pans when an ROI or a threshold is on the same axis.
`PolarAxis`, a `Colorbar`, a categorical axis, and a scale other than
`identity`, `log10`, or `log` raise `ArgumentError` at `masque` time.
A second figure whose limits are computed from this bond does not
follow the drag: the bond never carries `:view`.

!!! note

    The gesture commits nothing on both backends. On a live kernel,
    `:cairo` ships a PNG each frame and `:webgl` ships a serialized scene
    onto the canvas already on the page. This player is the resting Cairo
    figure. Drag on the static page does not stream frames. Reach for
    `:webgl` when those frames have to stay on the GPU.

