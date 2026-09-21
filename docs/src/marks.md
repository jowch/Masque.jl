# Click marks

This page is four bars, three polygons, and four polar points. Hold the
pointer over a mark to inspect it. Click a mark to write that pick into
Julia through `@bind`.

This page is a new notebook. It does not reuse `fig` or `pick` from the
cities scatter. Develop the checkout and load a backend as on
[Install](@ref). Skip the load cell if this notebook already ran it. Do not
paste `using` twice:

```julia
begin
    using Pkg
    Pkg.develop(path = "path/to/Masque.jl")
    Pkg.add("CairoMakie")
    using Masque, CairoMakie
end
```

In a Pluto notebook, paste each snippet into its own cell. Pluto runs one
top-level expression per cell. Wrap multiple statements in `begin ... end`.
Showing `fig` alone does not mount the overlay; `masque` returns the HTML
that does. If a later demo on this page also binds `pick`, replace the
previous bind cell. Pluto rejects two cells that both `@bind` the same
name.

Each embed on this docs site lists idle plus every mark. The
**Simulating `@bind`** chip marks that those clicks are precomputed
snapshots, not a live Julia process.

For the eight-city scatter, see [Getting started](@ref). For constructor
signatures and default payloads, see [Constructors](@ref).

## Click a bar

Draw four bars and skip the constructor. The default payload is
`(; low, high, value)` from the laid-out bar, not `(; index)`. The layer
id is `:bars`. The hit kind is `:rects`, so `selected=` can hydrate those
indices. Heatmap cells are a `:grid` layer — a different job. For more
information, see [Inspect a grid](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-marks-bars" title="Four-bar plot with listed @bind snapshots"
        style="width:100%;height:480px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-marks-bars");
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
  el.src = (pretty ? "../embeds/" : "embeds/") + "marks_bars.html";
})();
</script>
```

**1.** Draw four bars:

```julia
begin
    fig = Figure(size = (560, 360))
    ax = Axis(
        fig[1, 1];
        xlabel = "Quarter",
        ylabel = "Value",
        xticks = (1:4, ["Q1", "Q2", "Q3", "Q4"]),
    )
    barplot!(ax, 1:4, [2.0, 3.0, 1.5, 2.5])
end
```

**2.** Bind a click:

```julia
@bind pick masque(fig)
```

**3.** Read the pick:

```julia
pick === nothing ? "click a bar" :
    "value $(pick.payload.value) (low $(pick.payload.low), high $(pick.payload.high))"
```

`pick.payload.index` raises an error on this zero-config bar plot. There
is no `index` field. Pass the plot object when you want an explicit
interactable: `p = barplot!(ax, 1:4, ys); RectInteractable(ax, p)`. That
method is `RectInteractable(ax, p::BarPlot; id = :bars)`. `direction`
(`:y` by default) chooses which axis is `low` / `high`.

`barplot!` on a `PolarAxis` is skipped by `masque(fig)` with `@warn`. An
explicit AABB would misalign. Do not use a 12-bin histogram as this demo.
Keyboard arrows reach bars (`:rects` is focusable).

Hist, waterfall, crossbar, hspan, and vspan are also `:rects` list
layers. Each has its own default payload. For those payloads, see
[Constructors](@ref).

## Skip the constructor

`masque(fig)` is `masque(fig, auto_interactables(fig))` after layout.
Unsupported plots are skipped with `@warn`, not an error. An empty figure
warns "overlaying nothing". Layer ids are the plot kind (`:scatter`,
`:bars`, `:cells`), not `:heatmap` or `:barplot`. Repeats become
`:scatter_2`.

`auto_interactables` walks every `Axis` / `Axis3` / `PolarAxis` plot it
knows, plus every `Colorbar` and `Legend`. It does not install
`AxisInteractable`, `ThresholdInteractable`, `ROIInteractable`, or
`ViewInteractable`. On huge data it allocates one default payload per
element; pass a lean `payloads=` (or skip the layer) yourself.

Zero-config uses the Scatter constructor, so the highlight in the overlay
already hugs the drawn mark. Bare points without `radius=` do not. Two
hug paths are legal:

- Pass the scatter plot object:
  `p = scatter!(ax, xs, ys; markersize); PointInteractable(ax, p)`.
  Radius comes from the drawn marker. Default `:circle` →
  `r ≈ 0.3525 × markersize`. A `Circle` or `Rect` sprite →
  `r = markersize / 2`. Anything else → `markersize / 2`. This requires
  `markerspace = :pixel` (the default).
- Use the points constructor with
  `radius = 0.3525 * markersize` for default `:circle` when you need
  `tooltip=`, `colors=`, or custom `payloads`.

Do not pass `radius = markersize / 2` for default `:circle` (still a
halo). Do not pass `radius = markersize` for a `Circle` sprite (that
value is the diameter; the shipped `r` is half). Do not expect
`tooltip=` or `label=` on auto-extracted layers; build an explicit
interactable for those.

Stem and ScatterLines become two layers when `masque(fig)` walks them.
There is no `id_stems` or `id_line` keyword. There is no public
plot-object constructor for Stem, ScatterLines, BoxPlot, or Annotation.
For `MeshScatter` and `Arrows3D`, see [Backends](@ref).

## Click polygons

This demo is another figure. Replace the previous `fig` cell and the
`@bind pick` cell. Pluto rejects two cells that both `@bind` the same
name.

Three filled rings on one `poly!`. `masque(fig)` gives layer `:poly`,
kind `:polygons`, default payload `(; index)`. `selected=` can hydrate
those indices. Pass `PolygonInteractable(ax, p)` when you already have
the plot object, or `PolygonInteractable(ax, rings)` for explicit
geometry.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-marks-poly" title="Three polygons with listed @bind snapshots"
        style="width:100%;height:480px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-marks-poly");
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
  el.src = (pretty ? "../embeds/" : "embeds/") + "marks_poly.html";
})();
</script>
```

**1.** Draw three polygons:

```julia
begin
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1]; aspect = DataAspect())
    poly!(
        ax,
        [
            Point2f[(0.0, 0.0), (1.0, 0.0), (0.5, 0.85)],
            Point2f[(1.6, 0.0), (2.6, 0.0), (2.6, 1.0), (1.6, 1.0)],
            Point2f[(0.1, 1.2), (1.1, 1.2), (0.9, 2.0), (0.3, 2.0)],
        ];
        color = [:steelblue, :tomato, :seagreen],
    )
end
```

**2.** Bind a click:

```julia
@bind pick masque(fig)
```

**3.** Read the pick:

```julia
pick === nothing ? "click a polygon" : "index $(pick.index)"
```

`poly!` on a `PolarAxis` is skipped by auto with `@warn`. Band, density,
contourf, violin, and voronoiplot are also `:polygons`; contourf defaults
to `(; low, high)` and violin to `(; x)`.

`text!` labels are bounding-box hits: `TextInteractable(ax, p::Makie.Text)`
only, kind `:rects`, default payload `(; text, index, x, y)`.
`annotation!` is auto-only through its inner `Text`.

### Click a polyline

This demo is another figure. Replace the previous `fig` cell and the
`@bind pick` cell.

A short polyline is the same click job with a different kind. Four
vertices give three segments, layer `:lines`, kind `:polyline`, default
payload `(; segment_index)`.

**1.** Draw a four-vertex polyline:

```julia
begin
    fig = Figure()
    ax = Axis(fig[1, 1])
    lines!(ax, [0, 1, 2, 3], [0, 1, 0, 1])
end
```

**2.** Bind a click:

```julia
@bind pick masque(fig)
```

Line segments, errorbars, rangebars, hlines, and vlines use kind
`:segments` instead. Keep N small enough to list every segment. Do not
bind-swap a dense `lines!` click by click.

## Click points on a polar axis

This demo is another figure. Replace the previous `fig` cell and the
`@bind pick` cell.

Scatter four `Point2f` values on a `PolarAxis`. `@bind pick masque(fig)`
walks the scatter the same way as on a Cartesian axis. CairoMakie and
WGLMakie both work; polar is not WebGL-only. The default payload is
`(; index, x, y)` with `x` = θ and `y` = r. The highlight in the overlay
hugs the marker because zero-config uses the Scatter constructor.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-marks-polar" title="Four polar scatter points with listed @bind snapshots"
        style="width:100%;height:480px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-marks-polar");
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
  el.src = (pretty ? "../embeds/" : "embeds/") + "marks_polar.html";
})();
</script>
```

**1.** Scatter four points on a `PolarAxis`:

```julia
begin
    fig = Figure(size = (480, 400))
    ax = PolarAxis(fig[1, 1])
    pts = Point2f[(0.0, 1.0), (π / 2, 2.0), (π, 1.5), (3π / 2, 2.5)]
    scatter!(ax, pts; markersize = 18)
end
```

**2.** Bind a click:

```julia
@bind pick masque(fig)
```

**3.** Read the pick:

```julia
pick === nothing ? "click a point" :
    "index $(pick.index) (θ $(pick.payload.x), r $(pick.payload.y))"
```

Auto on `PolarAxis` allowlists Scatter, Lines, LineSegments, and
ScatterLines. Continuous θ/r readout is not shipped.
`AxisInteractable`, `ThresholdInteractable`, `ROIInteractable`, and
`ViewInteractable` on polar raise `ArgumentError`. Use element hits.

Do not put `heatmap!`, `barplot!`, or `poly!` through auto on polar
(skipped with `@warn`). An explicit AABB construct still misaligns. Do
not add `ViewInteractable` to spin the polar plot. A notebook that
loads only WGLMakie is a backend check, not a polar requirement.
