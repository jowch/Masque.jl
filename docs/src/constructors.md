# Constructors

Lookup for built-in constructors: the signature that matters, the default
payload, the `HitLayer` kind, and the Guide that teaches the job.
Signatures and payloads come from `src/interactables.jl` and
`src/introspect.jl`. This page has no player.

Element constructors also take `id`, `payloads` (except heatmap/image),
and `tooltip` (`nothing` / `masque"..."` / `false`) unless the plot-object
method omits them. `LegendInteractable` takes `tooltip` and a fixed
payload; it does not take `payloads=`. Whole-axis and drag constructors
take `id` plus their own keywords; `payloads=` / `tooltip=` is a
`MethodError`. `FunctionInteractable` takes neither an axis nor `id`.
`RegionInteractable` requires `payloads`.

## Zero-config: `masque(fig)`

`masque(fig)` is `masque(fig, auto_interactables(fig))` after layout.
[`auto_interactables`](@ref) walks every `Axis`, `Axis3`,
and `PolarAxis` plot it knows, plus every `Colorbar` and `Legend`. It
does not install `AxisInteractable`, `ThresholdInteractable`,
`ROIInteractable`, or `ViewInteractable`.

```julia
@bind pick masque(fig)
```

```julia
ints = auto_interactables(fig)
```

Unsupported plots are skipped with `@warn`, not an error. An empty figure
warns "overlaying nothing". Layer ids are the plot kind (`:scatter`,
`:bars`, `:cells`, …), suffixed `_2`, `_3` when a kind repeats. Heatmap
and image share `:cells`. BarPlot is `:bars`, not `:barplot`. LineSegments
is `:segments`.

On `Axis3`, auto allowlists Scatter, Lines, LineSegments, MeshScatter,
Wireframe, and Arrows3D. On `PolarAxis`, auto allowlists Scatter, Lines,
LineSegments, and ScatterLines. Other kinds on those axes are skipped
with `@warn`. Explicit AABB kinds can still construct and misalign; auto
is the safe path.

Stem and ScatterLines become two layers from `_construct` only (suffixes
`:stem_stems` and `:scatterlines_line`). There is no public plot-object
constructor for Stem, ScatterLines, BoxPlot, or Annotation, and no
`id_stems` / `id_line` keyword.

Zero-config uses the Scatter plot-object constructor, so the highlight
in the overlay hugs the drawn marker. `PointInteractable(ax, points)`
defaults `radius=9` and never reads a marker. Pass the `Scatter`, or
pass `radius=`. Default `:circle` → `r ≈ 0.3525 × markersize`. A
`Circle` or `Rect` sprite → `r = markersize / 2`. For more information,
see [Getting started](@ref) and [Click marks](@ref).

On huge data, auto allocates one default payload per element. Pass a lean
`payloads=` (or skip the layer) yourself. Auto-extracted layers do not
take `tooltip=` or `label=`; build an explicit interactable for those.

`LegendInteractable` from auto receives `plotmap` so entries link to
traces. `LegendInteractable(leg)` with no `plotmap` / `targets=` has
empty links, stays hittable, and does not resolve plots on its own.

## Element constructors

| Constructor | Signature | Default payload | Kind | Guide |
|---|---|---|---|---|
| [`PointInteractable`](@ref) | `(ax, points; radius=9, id=:points)` or `(ax, p::Scatter; id=:scatter)` | `(; index, x, y)` or `(; index, x, y, z)` | `:circles` | [Getting started](@ref), [Click marks](@ref) |
| [`PointInteractable`](@ref) | `(ax, p::MeshScatter; id=:meshscatter)` | `(; index, x, y, z)` | `:circles` | [Backends](@ref) |
| [`SegmentInteractable`](@ref) | `(ax, vertices; mode=:polyline, tol=6, id=:segments)` | `(; segment_index)` | `:polyline` or `:segments` | [Click marks](@ref) |
| [`RectInteractable`](@ref) | `(ax; rects, id=:rects)` or `(ax, p::BarPlot; id=:bars)` | `(; index)` explicit; BarPlot `(; low, high, value)` | `:rects` | [Click marks](@ref) |
| [`RectInteractable`](@ref) | `(ax; grid, id=:rects)` or `(ax, p::Union{Heatmap,Image}; id=:cells)` | `(; i, j, value)` client-side | `:grid` | [Inspect a grid](@ref) |
| [`PolygonInteractable`](@ref) | `(ax, rings; id=:polygons)` or `(ax, p::Poly; id=:poly)` | `(; index)` | `:polygons` | [Click marks](@ref) |
| [`TextInteractable`](@ref) | `(ax, p::Makie.Text; id=:text)` only | `(; text, index, x, y)` | `:rects` | [Click marks](@ref) |

`mode` is `:polyline` (connected path, nearest-segment hit) or `:pairs`
(disjoint pairs). Plot-object `SegmentInteractable` does not take `mode`
or `tooltip`; the plot type fixes both. `PointInteractable(ax, p::Scatter)`
does not take `tooltip=` (`MethodError`). Heatmap/image take `id` only.

`selected=` hydrates `:circles`, `:rects`, `:polygons`, `:segments`, and
`:polyline`. It cannot hydrate `:grid`. For more information, see
[Selection](@ref).

## Plot-object defaults

Each row is `*(ax, p)` unless noted. `id` is the auto layer id.

| Plot | Constructor | Default payload | Kind |
|---|---|---|---|
| `Scatter` | `PointInteractable` | `(; index, x, y[, z])` | `:circles` |
| `MeshScatter` | `PointInteractable` | `(; index, x, y, z)` | `:circles` |
| `Lines` / `Stairs` | `SegmentInteractable` | `(; segment_index)` | `:polyline` |
| `LineSegments` / `Errorbars` / `Rangebars` / `HLines` / `VLines` / `Wireframe` | `SegmentInteractable` | `(; segment_index)` | `:segments` |
| `Arrows3D` | `SegmentInteractable` | `(; index, x, y, z, u, v, w)` | `:segments` |
| `BarPlot` | `RectInteractable` | `(; low, high, value)` | `:rects` |
| `Hist` | `RectInteractable` | `(; value, low, high)` | `:rects` |
| `Waterfall` | `RectInteractable` | `(; low, high, value)` | `:rects` |
| `CrossBar` | `RectInteractable` | `(; midpoint, low, high)` | `:rects` |
| `HSpan` / `VSpan` | `RectInteractable` | `(; low, high)` | `:rects` |
| `Spy` | `RectInteractable` | `(; index)` | `:rects` |
| `Heatmap` / `Image` | `RectInteractable` | `(; i, j, value)` | `:grid` |
| `Poly` / `Band` / `Density` / `Voronoiplot` | `PolygonInteractable` | `(; index)` | `:polygons` |
| `Contourf` | `PolygonInteractable` | `(; low, high)` | `:polygons` |
| `Violin` | `PolygonInteractable` | `(; x)` | `:polygons` |
| `Text` | `TextInteractable` | `(; text, index, x, y)` | `:rects` |
| `Stem` | auto only | points + stems | `:circles` + `:segments` |
| `ScatterLines` | auto only | points + line | `:circles` + `:polyline` |
| `BoxPlot` | auto only | `(; q1, median, q3)` | `:rects` or `:polygons` |
| `Annotation` | auto only (inner `Text`) | text payload | `:rects` |

## Axis, legend, and drag

| Constructor | Signature | Default payload | Kind | Guide |
|---|---|---|---|---|
| [`AxisInteractable`](@ref) | `(ax; id=:axis)` | `(; x, y)` client-side; `index = -1` | `:axis` | [Read coordinates](@ref) |
| [`ColorbarInteractable`](@ref) | `(cb; id=:colorbar)` | `(; value)` client-side | `:axis` (bbox) | [Read coordinates](@ref) |
| [`LegendInteractable`](@ref) | `(leg; targets=nothing, id=:legend)` | `(; label, group, targets)` | `:rects` | [Legend](@ref) |
| [`ThresholdInteractable`](@ref) | `(ax; orientation=:horizontal, value, id=:threshold)` | scalar on release | `:threshold` | [Read coordinates](@ref) |
| [`ROIInteractable`](@ref) | `(ax; bounds, selects=nothing, id=:roi)` | `(; xmin, xmax, ymin, ymax)` or `Vector` with `selects` | `:roi` | [Brush a region](@ref) |
| [`ViewInteractable`](@ref) | `(ax; id=:view)` | none — commits nothing | `:view` | [Pan and orbit](@ref) |

`AxisInteractable`, `ThresholdInteractable`, and `ROIInteractable` raise
`ArgumentError` on `Axis3` or `PolarAxis`. `ViewInteractable` raises
`ArgumentError` on polar, a Colorbar, or a categorical 2D axis; Axis3
orbit is allowed. `selects` accepts a `:circles` or `:grid` layer id
only. Colorbar kind is `:axis`, not `:colorbar`. Legend kind is `:rects`.

## Custom

| Constructor | Signature | Default payload | Kind | Guide |
|---|---|---|---|---|
| [`RegionInteractable`](@ref) | `(ax; regions, payloads, id=:region)` | required `payloads` 1:1 | `:circles` / `:rects` / `:polygons` as `:id_c` / `:id_r` / `:id_p` | [Custom hits](@ref) |
| [`FunctionInteractable`](@ref) | `(f; events=(:click, :hover))` | whatever `f` puts on each `HitLayer` | whatever `f` emits | [Custom hits](@ref) |

For the exported API dump, see [API](@ref).
