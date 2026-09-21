# Masque.jl

Masque overlays a Makie figure in a [Pluto](https://plutojl.org) notebook
with a client-side interactive layer. The figure is the bind source: holding
the pointer over a mark shows a tooltip, and a click selects that mark and
reaches Julia through `@bind`.

CairoMakie renders a static image; Masque hit-tests on top. WGLMakie
(experimental) renders a live GPU canvas instead. The `masque` / `@bind` API
is the same on both. Load one backend before you call `masque`. If both are
loaded, an unqualified `masque` uses CairoMakie.

## When to use it

The following table compares Masque to using a Makie backend with no overlay.

| Feature | CairoMakie alone | WGLMakie alone | Masque |
|---|---|---|---|
| Output | Static, publication-quality | Live, GPU-rendered | Static image plus overlay (`:cairo`), or live canvas (`:webgl`) |
| Interactivity | None | Rich (pan, zoom, rotate) | Tooltips, click to select, drag to pan, threshold, or ROI |
| Needs a live Julia process | No | Yes | `@bind` recomputes and CairoMakie pan frames, yes; tooltips and the click highlight, no |
| Survives offline / static HTML export | Yes | No | Yes on both backends for inspection; `@bind` recomputes need a kernel |

Use Masque when you want a publication-quality figure that also answers
"what's this point?" when you hold the pointer over a mark, and "which one
did I click?" in Julia. Use WGLMakie without Masque when you need free-form
camera control, live data updates, or gestures Masque does not send back to
Julia.

The overlay HTML is Pluto notebook MIME. VS Code's plot pane, the Julia
REPL, and a Documenter `@example` block do not run `@bind`. GLMakie is
not a Masque backend; load CairoMakie or WGLMakie.

## Install

Masque is not in the General registry. `] add Masque` fails.

In a Pluto notebook, paste each snippet from these docs into its own cell.
Pluto runs one top-level expression per cell. Wrap multiple statements in
`begin ... end`, which counts as one expression.

**1.** In a terminal, clone the repository:

```bash
git clone https://github.com/jowch/Masque.jl
```

**2.** In a Pluto cell, develop the checkout and load a backend. Replace
   `path/to/Masque.jl` with your clone:

```julia
begin
    using Pkg
    Pkg.develop(path = "path/to/Masque.jl")
    Pkg.add("CairoMakie")
    using Masque, CairoMakie
end
```

**3.** If you do not want a sibling clone, add the GitHub URL instead of
   `Pkg.develop`:

```julia
begin
    using Pkg
    Pkg.add(url = "https://github.com/jowch/Masque.jl")
    Pkg.add("CairoMakie")
    using Masque, CairoMakie
end
```

Paste **2.** or **3.**, not both. Skip the load cell if this notebook
already ran it. Do not paste `using` twice.

`using Masque` with no Makie backend raises `ArgumentError` the first time
`masque` runs. Loading both CairoMakie and WGLMakie is fine; then `masque`
defaults to CairoMakie. The `backend=` keyword takes an extension instance,
not a `:cairo` or `:webgl` symbol. `masque` does not mutate the `Figure`.

The example notebooks in this repository each `Pkg.develop` the checkout
themselves. They use a temporary environment, which turns Pluto's notebook
package management off. Do not copy a `Pkg.activate(; temp = true)` cell
into your own notebook unless you want Pluto's package management off. For
more information, see [Examples](@ref) and [Backends](@ref).

For your first overlay, see [Getting started](@ref). Holding the pointer
over a mark does not write `@bind`; a click does. That page shows both on
one plot.

```@raw html
<div class="masque-diagram">
  <img class="masque-diagram-light" src="assets/diagrams/information-flow.svg"
       alt="At masque time, one Figure plus interactables becomes a backend image and hit geometry for every axis, then one manifest, then HTML with one image and one overlay. Several axes still make one overlay. The overlay is a stateless view. Analysis state is the bind bond in Julia.">
  <img class="masque-diagram-dark" src="assets/diagrams/information-flow-dark.svg"
       alt="At masque time, one Figure plus interactables becomes a backend image and hit geometry for every axis, then one manifest, then HTML with one image and one overlay. Several axes still make one overlay. The overlay is a stateless view. Analysis state is the bind bond in Julia.">
</div>
<script>
(function () {
  var wrap = document.currentScript.previousElementSibling;
  if (!wrap || !wrap.classList.contains("masque-diagram")) return;
  var link = document.querySelector('link[href*="masque-embed.css"]');
  var base = "assets/";
  if (link) {
    base = (link.getAttribute("href") || "assets/masque-embed.css")
      .replace(/masque-embed\.css(?:\?.*)?$/, "");
  }
  var imgs = wrap.querySelectorAll("img");
  for (var i = 0; i < imgs.length; i++) {
    var src = imgs[i].getAttribute("src") || "";
    imgs[i].src = base + src.replace(/^.*?assets\//, "");
  }
})();
</script>
```

One `masque` call produces one image and one overlay from a Makie
`Figure` and its interactables.

The overlay is a view. The `@bind` bond is Julia state when a cell reads
it. For every channel and host, see [Hover, click, and bind](@ref).

## Where to go next

Overlay the eight-city scatter next: see [Getting started](@ref). That
page starts at the cities figure. Skip the install cell on this page if
that notebook already ran it.

For overlay, `@bind`, and docs-player snapshots, see
[Hover, click, and bind](@ref).
