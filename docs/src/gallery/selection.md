# Selection round-trip

Click a point on the left. That index is passed as `selected=` on a
second `masque` call, which highlights the same mark. The two widgets
do not share an overlay. The highlight on the right is in the manifest
for that figure.

`selected=` takes 1-based indices. The player lists the click as a
0-based `{layer, index}`, which is the shape the overlay posts. Julia
sees `pick.index` starting at 1.

Do not pass this widget's own bond into the same `masque` call. Pluto
reports a cycle and does not run the cell. For `selected=` on one
figure, see [Selection](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-selection" title="Selection round-trip"
        style="width:100%;height:780px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-gal-selection");
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
  el.src = (pretty ? "../../embeds/" : "../embeds/") + "gallery_selection.html";
})();
</script>
```

## Variations

The player keeps the last click. To accumulate indices across clicks,
store them in a `Ref` in a cell that does not read this `@bind`, then
pass the growing set as `selected=` on the second widget. A slider that
rebuilds the figure drops the highlight unless you pass that set again.
See [Limits slider](@ref).

!!! note

    `selected=` highlights the same way on `:cairo` and `:webgl`.
    This player is the Cairo figure. A live notebook re-runs the second
    widget when the bond changes; the snapshots here are those re-runs,
    baked in. There is no same-index link between two scatters beyond the
    indices you pass yourself.

