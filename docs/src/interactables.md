# Interactables

Declare interactables explicitly (geometry in data space):

- [`PointInteractable`](@ref) — scatter-style points
- [`SegmentInteractable`](@ref) — a whole line (`lines!` / `stairs!` / `series!`), a
  per-segment polyline, or disjoint segment pairs
- [`RectInteractable`](@ref) — bars (list) and heatmap cells (compact grid)
- [`PolygonInteractable`](@ref) — arbitrary polygons
- [`AxisInteractable`](@ref) — the whole axis: click anywhere → data `(x, y)` (linear + log)
- [`ColorbarInteractable`](@ref) — a `Makie.Colorbar` block: hover/click anywhere on the bar
  inverts the cursor to the bar's data value
- [`LegendInteractable`](@ref) — a `Makie.Legend` block: hover/click an entry to highlight the
  plot(s) it labels — see [Legend](@ref)
- [`TextInteractable`](@ref) — `text!`/`annotation!` labels as click-to-pick buttons
  (bounding-box hit regions)
- [`ThresholdInteractable`](@ref) — a draggable horizontal/vertical line; drag for a live
  readout, commit the data value on mouse-up
- [`ROIInteractable`](@ref) — a draggable + resizable rectangle; drag the interior to move, a
  corner to resize both edges or an edge midpoint to resize just that one edge; commit the
  data-space bounds on mouse-up
- [`ViewInteractable`](@ref) — drag-to-pan (2D `Axis`) / drag-to-orbit (`Axis3`); commits
  nothing (a camera isn't an analysis value); Shift+drag wins over ROI/threshold
- [`RegionInteractable`](@ref) / [`FunctionInteractable`](@ref) — custom interactions, no
  JavaScript required; see [Custom interactions](@ref)

[`AxisInteractable`](@ref), [`ThresholdInteractable`](@ref), and [`ROIInteractable`](@ref)
are 2D-only: they raise an `ArgumentError` on `Axis3` or `PolarAxis`, and need a `linear` or
`log` axis scale (categorical is fine for `AxisInteractable`/`ThresholdInteractable`, not for
`ROIInteractable`). See [Troubleshooting](@ref) for the exact error text. Every other kind
works on `Axis3` and `PolarAxis` too — see [3D axes and `PolarAxis`](@ref) at the end of this
page.

[`examples/demo.jl`](https://github.com/jowch/Masque.jl/blob/main/examples/demo.jl) is a
runnable gallery of the core element/axis/view kinds above plus the selection round-trip;
see [Legend](@ref) for a runnable [`LegendInteractable`](@ref) example.

**Pan, zoom, and 3D rotation via a slider** re-render through the same `@bind` loop as
everything else: change `limits` (2D) or `azimuth`/`elevation` (`Axis3`) and rebuild the widget
— `masque` re-projects the overlay, so hit regions stay correct.

**Dragging with [`ViewInteractable`](@ref) is different: it commits nothing.** A camera is
operational state, not an analysis value the notebook reads. On both backends, in-drag frames
stream over a `with_js_link` gesture channel instead of a bond — the picture and hit regions
repaint live, with no cell re-execution. `:cairo` ships a PNG; `:webgl` ships a freshly
serialized scene onto the canvas already on the page. Shift+drag wins over a
`ROIInteractable`/`ThresholdInteractable` on the same axis on both backends.
[`examples/view_manip.jl`](https://github.com/jowch/Masque.jl/blob/main/examples/view_manip.jl)
demonstrates both.

## Constructors

Every constructor in the table below takes an `Axis` (or, for [`ColorbarInteractable`](@ref),
a `Makie.Colorbar`, or for [`LegendInteractable`](@ref), a `Makie.Legend`) and geometry in
**data space**, and all of them accept `id` — the `Symbol` the event reports as `layer`. The
element kinds — [`PointInteractable`](@ref), [`SegmentInteractable`](@ref),
[`RectInteractable`](@ref), [`PolygonInteractable`](@ref), and (documented on their own
pages) [`TextInteractable`](@ref) and [`RegionInteractable`](@ref) — also accept `payloads`
(one entry per element, auto-generated with a 1-based `index` if omitted) and `tooltip`
(`nothing` / `masque"..."` / `false`, see [Tooltips](@ref)). The whole-axis and drag kinds —
[`AxisInteractable`](@ref), [`ColorbarInteractable`](@ref), [`ThresholdInteractable`](@ref),
[`ROIInteractable`](@ref), [`ViewInteractable`](@ref) — report one client-computed value per
event rather than a discrete element, so they take only `id` plus their own keywords below;
passing `payloads=`/`tooltip=` to one of these is a `MethodError`.
[`LegendInteractable`](@ref) sits between the two: it does report one payload per (entry)
element like the element kinds, but the payload shape is fixed (`; label, group, targets`),
not user-supplied — see [Legend](@ref). [`FunctionInteractable`](@ref) is the outlier: it
takes neither an `Axis` nor `id` as constructor arguments at all — see
[Custom interactions](@ref). The table below lists the keywords *beyond*
`id`/`payloads`/`tooltip` for the constructors it covers.

| Constructor | Geometry | Extra keywords | Bond |
|---|---|---|---|
| `PointInteractable(ax, points; radius = 9, radius3d = nothing, id = :points)` | `points :: Vector{(x, y)}` (or `(x,y,z)` for a 3D axis) | `radius` — px click target; `radius3d` — per-point data-space half-extents on a 3D axis (overrides `radius`) | [`ElementEvent`](@ref); default fields `index` (1-based), `x`, `y`[, `z`] |
| `SegmentInteractable(ax, vertices; mode = :polyline, unit = :segment, tol = 6, id = :segments)` | connected/disjoint vertices | `mode` — `:polyline` (connected path) or `:pairs` (disjoint pairs); `unit` — `:segment` (one element per edge; the default) or `:line` (the whole path is one element; requires `mode = :polyline`); `tol` — hit-test slack around an edge, in logical px, scaled to DPI like `radius` (default 6) | [`ElementEvent`](@ref); default field `segment_index` (1-based) for `:segment`, `index` (1-based) for `:line` |
| `RectInteractable(ax; rects, clamp_to_viewport = false, id = :rects)` | `rects = [(xc, yc, w, h), …]` — explicit boxes (e.g. bars) | `clamp_to_viewport` — clamp a rect that spans past the axis edge instead of letting it overflow | [`ElementEvent`](@ref); default field `index` (1-based) |
| `RectInteractable(ax; grid, id = :rects)` | `grid = (xedges, yedges, values)` — a heatmap shipped as edges, not N rects | — | [`GridCellEvent`](@ref) (`i`, `j` 1-based; `A[cell]`) |
| `PolygonInteractable(ax, rings; id = :polygons)` | `rings :: Vector{Vector{(x, y)}}` — one or more filled rings | — | [`ElementEvent`](@ref); default field `index` (1-based) |
| `AxisInteractable(ax; id = :axis)` | the whole axis: a click anywhere returns the data coordinate | — | [`AxisEvent`](@ref) (`x`, `y`) |
| `ColorbarInteractable(cb; id = :colorbar)` | takes a `Makie.Colorbar` block, not an `Axis`; hit region bounded to the colorbar's pixel bbox | — | [`ColorbarEvent`](@ref) (`value`) |
| `LegendInteractable(leg; targets = nothing, id = :legend)` | takes a `Makie.Legend` block, not an `Axis`; one hit region per entry, bounded to that entry's row | `targets` — a `Dict{label => id(s)}` or one entry per legend entry; default auto-resolves from the plots each entry's elements were built from | [`LegendEvent`](@ref) (`label`, `group`, `targets`) — see [Legend](@ref) |
| `ThresholdInteractable(ax; orientation = :horizontal, value, id = :threshold)` | a draggable line (`:horizontal` = constant-y, dragged vertically; `:vertical` = constant-x); live readout while dragging, commit on mouse-up | `orientation`, `value` (initial position; a number or a [`ThresholdEvent`](@ref)) | [`ThresholdEvent`](@ref) (`value`), on release |
| `ROIInteractable(ax; bounds = (xmin, xmax, ymin, ymax), selects = nothing, id = :roi)` | a draggable + resizable box; move (interior) / resize (a corner resizes two edges, an edge midpoint resizes just that one); commit on mouse-up | `selects` — another layer's `id`; if set, the box reports that layer's selection instead of its own bounds (`circles`/`grid` layers only — see [Multi-element selectors](@ref)). `bounds=` accepts a 4-tuple or a [`BoundsEvent`](@ref) | [`BoundsEvent`](@ref) on release; with `selects`, a `Vector{ElementEvent}` (points) or one [`GridWindowEvent`](@ref) (grid) |
| `ViewInteractable(ax; id = :view)` | drag-to-pan (2D) or drag-to-orbit (Axis3); commits nothing; Shift+drag forces view over ROI/threshold | — | none — a camera isn't an analysis value (§12.3); both backends stream a live gesture-channel preview instead |

## From a plot object

Pass the plot object a `plot!` call returns and the geometry is pulled from it — no need to
repeat coordinates you already gave Makie. These produce the **same** interactable the
explicit constructor would, so everything above (payloads, `selected`, tooltips) still
applies. The `ax` argument is passed because a plot has no back-reference to its own axis.

```julia
begin
    p = scatter!(ax, xs, ys; markersize = 14)
    pt = PointInteractable(ax, p)   # radius derived from the marker's drawn extent
end
```

```julia
@bind sel masque(fig, pt)
```

Masque introspects far more plot kinds than the handful shown as explicit constructors above.
Every one below produces one of the same four interactables — same payloads/`selected`/
tooltip contract, plot-specific default payload and `id`:

| Produces | From these plots |
|---|---|
| [`PointInteractable`](@ref) | `Scatter` (`radius` from the marker's drawn extent — ≈0.35×`markersize` for the default `:circle`, `markersize` for a `Circle`/`Rect` geometry marker, `markersize/2` fallback otherwise); `MeshScatter` (data-space `radius3d` on a 3D axis) |
| [`SegmentInteractable`](@ref) | `Lines`, `Stairs` (one `:lines` element, the whole path); `Series` (one `:lines` layer, one element per series); `LineSegments`, `Errorbars`, `Rangebars` (`:pairs`); `Wireframe` (rendered edges); `Arrows3D` (shaft start→end); `HLines`/`VLines` (the rendered span) |
| [`RectInteractable`](@ref) | `Heatmap`/`Image` (compact grid); `BarPlot` (dodge/stack/auto-width honored); `Hist`, `Waterfall`, `CrossBar`, `Spy`, `HSpan`, `VSpan` |
| [`PolygonInteractable`](@ref) | `Poly` (one ring or many); `Band`, `Density` (filled curve); `Contourf` (filled levels); `Violin`; `Voronoiplot` (cell polygons) |
| [`TextInteractable`](@ref) | `Text` directly; `Annotation` via its inner `Text` (its only constructor takes a `Makie.Text`, so `annotation!` labels are only reachable through this path or `masque(fig)`, never a hand-written `TextInteractable`) |
| Point **+** Segment (two layers) | `Stem` (`id` = points, `id_stems` = the stems); `ScatterLines` (`id` = points, `id_line` = the line) |
| Rect **or** Polygon (box body only) | `BoxPlot` — a rect unless the box is notched, then a polygon; whiskers/outliers are decorative, not hit-tested |

`id` on all of these, and `payloads` on most, take the same keywords as the explicit
constructors; defaults are the plot's own name in lowercase (`:scatter`, `:lines`, `:hist`,
`:crossbar`, …) — **except** `Heatmap`/`Image` (`:cells`), `BarPlot` (`:bars`), and
`LineSegments` (`:segments`). `masque(fig)`/`auto_interactables` use these same ids, so an
`ev.layer` check against `:heatmap` or `:barplot` will never match — use `:cells`/`:bars`,
and for `selected=`, `:bars`. The `Heatmap`/`Image` method is also the one exception that
takes no `payloads` keyword at all, since grid cells resolve `{i, j, value}` client-side,
same as the explicit `grid = (...)` form — and, being a `:grid`-kind layer, its `:cells`
elements can't be pre-highlighted via `selected=` at all (see [Selection](@ref)). Any plot
type not listed here — or here and in the [Constructors](@ref) table above — needs a custom
interaction; see [Custom interactions](@ref).

## Zero-config: `masque(fig)`

Skip the constructors entirely — `masque(fig)` walks every `Axis`, `Axis3`, `PolarAxis`,
`Colorbar`, and `Legend` block, introspects each supported plot, and overlays the lot:

```julia
begin
    fig = Figure()
    ax = Axis(fig[1, 1])
    scatter!(ax, xs, ys)
    heatmap!(ax, X, Y, Z)
end
```

```julia
@bind ev masque(fig)   # both plots interactive; ev.layer tells you which was clicked
```

Layer ids are the plot kind (`:scatter`, `:hist`, `:band`, …, from the table above — note the
`heatmap!` above gets `:cells`, not `:heatmap`; see the exceptions listed there) plus
`:colorbar` for any `Colorbar` block and `:legend` for any `Legend` block, suffixed `_2`,
`_3`, … when a kind repeats within one figure. Unsupported plot types are skipped with a
`@warn`, not an error.

[`auto_interactables`](@ref) returns the same `Vector{AbstractInteractable}` `masque(fig)`
builds, so you can grab it, tweak ids/payloads or append custom interactables, then pass it
back:

```julia
ints = let
    ints = auto_interactables(fig)
    push!(ints, RegionInteractable(ax; regions = ..., payloads = ...))
    ints
end
```

```julia
@bind ev masque(fig, ints)
```

## 3D axes and `PolarAxis`

`Axis3` gets the point/segment kinds above with 3D-valid payloads: `Scatter` carries
`{index, x, y, z}`, a `Lines` is one whole-line element whose default payload is `{index}`
(the path is still projected from the 3D vertices), `MeshScatter` gets depth-correct per-marker hit radii from its data-space
`markersize`, `Wireframe`'s rendered edges are hoverable, and `Arrows3D` shafts hit as
start→end segments — all projected once, in Julia, at build time, so it works the same way
static on `:cairo` and live on `:webgl` (see [Backends](@ref)). `PolarAxis` gets the same
discrete point/segment overlays on both backends; continuous θ/r readout is not shipped yet.

`AxisInteractable`, `ThresholdInteractable`, `ROIInteractable`, and orbit-mode
`ViewInteractable` don't work on either — see [Troubleshooting](@ref) for why and what to use
instead. `LScene` isn't supported on either backend at all; see [Troubleshooting](@ref).
