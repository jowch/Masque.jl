# Getting started

Masque overlays a Makie figure in Pluto. Draw the figure, mark what is
interactable, and `@bind` the overlay. A cell that reads the bond re-runs
when you click. Hover stays on the figure.

## Install

In a Pluto notebook, paste each snippet from these docs into its own
cell. Pluto runs one top-level expression per cell. Wrap multiple
statements in `begin ... end`, which counts as one expression.

Paste this cell into the notebook. Pluto's package manager stays on:

```julia
begin
    using Pkg
    Pkg.add(url = "https://github.com/jowch/Masque.jl")
    Pkg.add("CairoMakie")
    using Masque, CairoMakie
end
```

To install from a Julia session instead, keep the notebook file closed
and write the packages into that file.
`Pluto.activate_notebook_environment` updates the environment embedded
in the notebook, so package management stays on when you open it again.
`Pkg.activate(; temp = true)` turns package management off.

```julia
import Pluto, Pkg
Pluto.activate_notebook_environment("path/to/notebook.jl") do
    Pkg.add(url = "https://github.com/jowch/Masque.jl")
    Pkg.add("CairoMakie")
end
```

!!! info

    Masque supports CairoMakie and WGLMakie. `using Masque` with no Makie
    backend raises `ArgumentError` the first time `masque` runs. If both
    CairoMakie and WGLMakie are loaded, `masque` defaults to CairoMakie.
    For more information, see [Backends](@ref).

## Quick start

This notebook is a three-point scatter: a custom tooltip, `@bind`, and a
cell that reads the click. Markdown cells are the notes. Code cells are
unfolded. On this site the **Simulating `@bind`** chip is a listed
snapshot. In your notebook, the readout cell re-runs.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gs-quickstart" title="Three-point scatter with a tooltip, @bind, and a readout"
        style="width:100%;height:960px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-gs-quickstart");
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
  el.src = (pretty ? "../embeds/" : "embeds/") + "home_quickstart.html";
})();
</script>
```

Paste each cell into your notebook, including the markdown cells. Hold
the pointer over a point to read its name, then click one.

## Where to go next

- [Click marks](@ref) — bars, polygons, and polar points
- [Tooltips](@ref) — templates, placement, and a dark figure
- [Selection](@ref) — replace a selection, or start with a mark already
  selected
- [Brush a region](@ref) — drag a box over points
- [Pan and orbit](@ref) — move a 2D axis, or orbit an `Axis3`
- [Examples](@ref) — the runnable notebooks in this repository
- [Constructors](@ref) — every built-in kind and its default payload
- [Backends](@ref) — CairoMakie and WGLMakie
