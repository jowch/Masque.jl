# Text labels

`masque(fig)` turns data-space `text!` and `annotation!` into clickable
boxes. The box comes from Makie's own string bounds. A rotated label is
still one box, axis-aligned and a little loose. Click a label in a live
notebook and the bond is an `ElementEvent` with `text`, `index`, `x`,
and `y`.

The scatter on the same axes is also detected. A marker click has no
`text` field. The readout guards on that.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-text" title="Text labels"
        style="width:100%;height:1320px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-gal-text");
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
  el.src = (pretty ? "../../embeds/" : "../embeds/") + "gallery_text.html";
})();
</script>
```

## Variations

`offset` and `fontsize` follow the label. `annotation!` is the same
button as `text!`. A label in screen space, rather than data space, is
not a hit target.

!!! note

    Label hits are the same on `:cairo` and `:webgl`. This player is the
    Cairo figure. The listed snapshots replay a label click and a marker
    click. `masque(fig)` also publishes the scatter, so in a live notebook
    branch on `hasproperty(pick, :text)` before reading the string.

