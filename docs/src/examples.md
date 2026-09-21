# Examples

Clone the repository, start Pluto, and open a notebook from Pluto's
landing page. Each notebook `Pkg.develop`s the checkout and adds the
Makie backend it needs, so it runs from a fresh clone once Pluto is
installed. CI runs the same notebooks headlessly (`examples/ci_run.jl`).

**1.** Clone the repository:

```bash
git clone https://github.com/jowch/Masque.jl
```

**2.** Start Pluto:

```bash
julia -e 'using Pluto; Pluto.run()'
```

**3.** On Pluto's landing page, open the notebook path you want, for
   example `examples/demo.jl`.

These notebooks are larger than the cities scatter on
[Getting started](@ref). A second axis still uses one `masque` call.
For more information, see [Linked views](@ref).

Do not paste a notebook's `Pkg.activate(; temp = true)` cell into a
docs embed or into a notebook that keeps Pluto's package management on.

## Static HTML export

Each notebook has a static `generate_html` export on this site. Open it
in the browser with no Julia installed.

What survives without a kernel, on both `:cairo` and `:webgl`: hold the
pointer over a mark for a tooltip and highlight in the overlay;
click-echo wash; a WebGL canvas redraw from the serialized scene.

What dies: `@bind` downstream cells, `with_js_link` view frames, and
`selects`-ROI Julia stats. The export still fetches Pluto's frontend
from a CDN, so it needs a network. Inspection-without-kernel is true on
both backends.

A cell that prints "you picked …" does not change on a static export.
That needs a live Pluto session. For more information, see
[Backends](@ref).

The following iframes are those full exports (hybrid inspection pages),
not cell-series players. Do not copy `PLUTO_PLAYER_TOML_CONTENTS` into a
real notebook.

## CairoMakie kitchen-sink

[`examples/demo.jl`](https://github.com/jowch/Masque.jl/blob/main/examples/demo.jl)
is a feature tour on `:cairo`: points, segments, rects (list and grid),
polygons, axis readout, colorbar, text, `masque"..."` tooltips, and the
selection round-trip, plus `masque(fig)` over bars, areas, and polygons.

It is **not** every built-in kind. It does not include
`LegendInteractable`, `ThresholdInteractable`, `ROIInteractable`,
`ViewInteractable`, `RegionInteractable`, or `FunctionInteractable`.
For those, see the other notebooks on this page, [Custom hits](@ref),
and [Constructors](@ref).

[Open the static export](notebooks/demo.html)

```@raw html
<iframe id="masque-ex-demo" title="Static export of examples/demo.jl"
        style="width:100%;height:720px;border:1px solid #ccc;background:#fff;"
        loading="lazy"></iframe>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-ex-demo");
  if (!el) return;
  el.src = (pretty ? "../notebooks/" : "notebooks/") + "demo.html";
})();
</script>
```

## WGLMakie kitchen-sink

[`examples/webgl_demo.jl`](https://github.com/jowch/Masque.jl/blob/main/examples/webgl_demo.jl)
is a feature tour on `:webgl`: 2D scatter, `Axis3`, `masque"..."`
tooltips, heatmap plus colorbar, polygons, text, region, threshold,
axis readout, and ROI. Status is experimental.

It is **not** every built-in kind. It does not include
`SegmentInteractable`, `LegendInteractable`, `ViewInteractable`, or
`FunctionInteractable`. For those, see the other notebooks on this page
and [Constructors](@ref). For more information, see [Backends](@ref).

[Open the static export](notebooks/webgl_demo.html)

```@raw html
<iframe id="masque-ex-webgl" title="Static export of examples/webgl_demo.jl"
        style="width:100%;height:720px;border:1px solid #ccc;background:#fff;"
        loading="lazy"></iframe>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-ex-webgl");
  if (!el) return;
  el.src = (pretty ? "../notebooks/" : "notebooks/") + "webgl_demo.html";
})();
</script>
```

## View with sliders

[`examples/view_manip.jl`](https://github.com/jowch/Masque.jl/blob/main/examples/view_manip.jl)
pans, zooms, and orbits by rebuilding the figure from `@bind` sliders
(`limits`, `azimuth` / `elevation` on `Axis3`). Selection can survive
that rebuild if you re-pass `selected=`.

[`ViewInteractable`](@ref) **drag** is a different path: it commits
nothing. On `:cairo`, in-drag frames stream over `with_js_link`. On
`:webgl`, drag shows a numeric readout only. For more information, see
[Backends](@ref).

[Open the static export](notebooks/view_manip.html)

## View drag on WebGL

[`examples/view_manip_webgl.jl`](https://github.com/jowch/Masque.jl/blob/main/examples/view_manip_webgl.jl)
is the drag-to-pan / drag-to-orbit half of `view_manip.jl`, live-checked
on `:webgl` (numeric readout, no live PNG frames).

[Open the static export](notebooks/view_manip_webgl.html)

## Polar scatter

[`examples/polaraxis_webgl.jl`](https://github.com/jowch/Masque.jl/blob/main/examples/polaraxis_webgl.jl)
hits discrete points on a `PolarAxis`. Polar is not WebGL-only; CairoMakie
overlays the same kinds. Continuous θ/r readout is not shipped.
`heatmap!` and `barplot!` on polar are skipped by `masque(fig)` with
`@warn`.

[Open the static export](notebooks/polaraxis_webgl.html)

## Gallery

[`gallery/gallery.jl`](https://github.com/jowch/Masque.jl/blob/main/gallery/gallery.jl)
is closer to an application than a feature tour: a scatter with
[`ROIInteractable`](@ref) `selects` (the bond is a
`Vector{InteractionEvent}`, one per enclosed point) and an image ROI
with per-channel stats.

[Open the static export](notebooks/gallery.html)

```@raw html
<iframe id="masque-ex-gallery" title="Static export of gallery/gallery.jl"
        style="width:100%;height:720px;border:1px solid #ccc;background:#fff;"
        loading="lazy"></iframe>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-ex-gallery");
  if (!el) return;
  el.src = (pretty ? "../notebooks/" : "notebooks/") + "gallery.html";
})();
</script>
```
