# Tooltip templates

Hover a marker. The tooltip is a `masque"..."` template: `$(city)` is a
field on that point's payload, and `$(pop:,)` is a
[d3-format](https://d3js.org/d3-format) spec, so `37000000` reads as
`37,000,000`. A value that contains HTML is escaped. Markup you write in
the template is not.

Click writes `@bind`. The readout below the figure names the city. Hover
does not change the bond.

For the template rules, see [Tooltips](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-tooltips" title="Tooltip templates"
        style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-gal-tooltips");
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
  el.src = (pretty ? "../../embeds/" : "../embeds/") + "gallery_tooltips.html";
})();
</script>
```

## Variations

Leave `tooltip` unset and the overlay draws a name/value table from the
payload. `tooltip_bg`, `tooltip_color`, `tooltip_caret`, and
`tooltip_radius` on `masque` theme that card for the whole figure:

```julia
masque(
    fig, ints;
    tooltip_bg = :midnightblue,
    tooltip_color = :white,
    tooltip_caret = false,
    tooltip_radius = 8,
)
```

!!! note

    The overlay is the same code on `:cairo` and `:webgl`. This player is
    the Cairo figure: hover is drawn on the page, and the listed clicks are
    snapshots of the readout. Load `WGLMakie` alone when you want the figure
    on a live canvas. Hover, highlight, and the click readout match on both
    backends.

