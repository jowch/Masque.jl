# Masque.jl

Masque adds an interactive layer over Makie figures inside a Pluto
notebook. Add rich tooltips, hover interactions, selections, and more to
your figures.

![A CairoMakie scatter in Pluto: holding the pointer over a point shows a tooltip, clicking it selects the point and updates the bound value in the following cell](assets/demo.gif)

## Quick start

In a Pluto notebook:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-home-quickstart" title="Three-point scatter with listed @bind snapshots"
        style="width:100%;height:480px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var el = document.getElementById("masque-home-quickstart");
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
  el.src = "embeds/home_quickstart.html";
})();
</script>
```

Hovering shows a tooltip; clicking sets `sel` and re-runs downstream
cells. On this docs site, listed clicks are precomputed snapshots — the
**Simulating `@bind`** chip marks that this is not a live Julia process.

Pluto runs exactly one top-level expression per cell, so any snippet on
this site with more than one statement is wrapped in `begin ... end`
(which counts as one expression) or split across cells the way this
notebook is.

Under the hood, `masque(...)` sends the browser a manifest: the rendered
image plus hit regions grouped into layers, one per interactable, keyed
by its `id`. The value a `@bind`-ed variable holds — `sel` in that
notebook — is called the bond value.

## Where to go next

- [Getting started](@ref) — a walkthrough: explicit vs. zero-config,
  choosing a backend, what a bond value looks like
- [Constructors](@ref) — every built-in kind, its constructor, and its
  default payload
- [Selection](@ref) — reacting to clicks, linking plots, persisting a
  highlight
- [Legend](@ref) — hover/click a `Makie.Legend` entry to highlight the
  trace(s) it labels
- [Tooltips](@ref) — `masque"..."` templates and styling
- [Custom hits](@ref) — `RegionInteractable` / `FunctionInteractable`
- [Backends](@ref) — `:cairo` vs `:webgl`, and when to reach for which
- [Troubleshooting](@ref) — common errors and what causes them
- [Examples](@ref) — every runnable notebook in the repo
- [API](@ref) — full docstrings
