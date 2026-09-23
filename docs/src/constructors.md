# Constructors

Read [Getting started](@ref) before this page. Lookup for built-in
constructors: the signature, the `@bind` type, the `HitLayer` kind, and
the Guide that teaches the job. Signatures come from
`src/interactables.jl` and `src/introspect.jl`. This page has no player.

Every constructor takes an `Axis` (or a `Makie.Colorbar` /
`Makie.Legend`) and geometry in data space, plus `id` — the `Symbol`
the event reports as `layer`. Element constructors also take `payloads`
(a vector or a `DataFrame`, except heatmap/image) and `tooltip`
(`nothing` / `masque"..."` / `false`) unless the plot-object method
omits them. Omit `payloads` and the default is a 1-based `index` plus
the coordinates that constructor ships. `LegendInteractable` takes
`tooltip` and a fixed payload; it does not take `payloads=`. Whole-axis
and drag constructors take `id` plus their own keywords; `payloads=` /
`tooltip=` is a `MethodError`. `FunctionInteractable` takes neither an
axis nor `id`. `RegionInteractable` requires `payloads`.

## Bond

The `@bind` value is `nothing` until the first commit of that
interaction, unless `selected=` restored one. `bondtype` is a property
of the interactable (and of `selects` on an ROI). Indices are 1-based.
Named fields on the event are how you read the pick. The wire stays
0-based.

| Interaction | Value | Reads as | Guide |
|---|---|---|---|
| Click a point, bar, polygon, segment, or text | [`ElementEvent`](@ref) | `pick.city`, `pick.index`; `xs[pick]`, `df[pick, :]` | [Getting started](@ref), [Click marks](@ref) |
| Legend entry | [`LegendEvent`](@ref) | `entry.label`; not a table row | [Legend](@ref) |
| `selects` over points | `Vector{ElementEvent}` | `e.city`; empty box `[]` | [Brush a region](@ref) |
| Heatmap / image cell | [`GridCellEvent`](@ref) | `pick.i`, `pick.j`; `A[pick]` | [Inspect a grid](@ref) |
| Heatmap / image brush | [`GridWindowEvent`](@ref) | `i1:i2`, `j1:j2`; `A[win]` | [Inspect a grid](@ref) |
| Axis click | [`AxisEvent`](@ref) | `pick.x`, `pick.y` | [Read coordinates](@ref) |
| Colorbar click | [`ColorbarEvent`](@ref) | `pick.value` | [Read coordinates](@ref) |
| Threshold release | [`ThresholdEvent`](@ref) | `pick.value` | [Read coordinates](@ref) |
| Bounds-only ROI | [`BoundsEvent`](@ref) | `pick.xmin` … `pick.ymax` | [Brush a region](@ref) |
| View pan / orbit | none | the bond does not change | [Pan and orbit](@ref) |

A widget that mixes two of these has a bond whose type is the last
commit. [`ViewInteractable`](@ref) is not in that list: a camera is
operational state. For `selected=`, see [Selection](@ref).

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

Grab that vector, tweak ids or `payloads`, append a custom interactable,
and pass it back:

```julia
ints = let
    ints = auto_interactables(fig)
    push!(ints, RegionInteractable(ax; regions = ..., payloads = ...))
    ints
end
```

```julia
@bind pick masque(fig, ints)
```

Unsupported plots are skipped with `@warn`, not an error. An empty figure
warns "overlaying nothing". Layer ids are the plot kind (`:scatter`,
`:bars`, `:cells`, …), suffixed `_2`, `_3` when a kind repeats. Heatmap
and image share `:cells`. BarPlot is `:bars`, not `:barplot`. LineSegments
is `:segments`. `pick.layer` is that id.

On `Axis3` and `PolarAxis`, auto skips kinds that would misalign. The
allowlist is [Recipes masque(fig) extracts](@ref). Explicit AABB
constructors can still build on those axes and sit in the wrong place;
auto is the safe path.

Stem and ScatterLines become two layers from `_construct` only (suffixes
`:stem_stems` and `:scatterlines_line`). There is no public plot-object
constructor for Stem, ScatterLines, BoxPlot, or Annotation, and no
`id_stems` / `id_line` keyword.

Zero-config uses the Scatter plot-object constructor, so the highlight
in the overlay hugs the drawn marker. `PointInteractable(ax, points)`
defaults `radius=9` and never reads a marker. Pass the `Scatter`, or
pass `radius=`. Default `:circle` → `r ≈ 0.3525 × markersize`. A
`Circle` or `Rect` sprite → `r = markersize / 2`. The quickstart overlay
on [Getting started](@ref) passes `radius=`.

On huge data, auto allocates one default payload per element. Pass a lean
`payloads=` (or skip the layer) yourself. Auto-extracted layers do not
take `tooltip=` or `label=`; build an explicit interactable for those.
`max_width` defaults to 700 (Pluto's column). Do not `deepcopy(fig)`
(Makie `Figure`s cannot). Do not add a second `@bind pick` cell.

`PointInteractable(ax, p::Makie.Scatter; tooltip = masque"…")` is a
`MethodError`. Plot-object constructors that take `payloads` still do
not take `tooltip=` except `TextInteractable`. `tooltip = true` raises
`ArgumentError`. For more information, see [Tooltips](@ref).

`LegendInteractable` from auto receives `plotmap` so entries link to
traces. `LegendInteractable(leg)` with no `plotmap` / `targets=` has
empty links, stays hittable, and does not resolve plots on its own.

## From a plot object

Pass the plot object a `plot!` call returns. The geometry is pulled from
it. The result is the same interactable the explicit constructor would
build, so `payloads`, `selected=`, and tooltips still apply. `ax` is
required: a plot has no back-reference to its axis.

```julia
begin
    p = scatter!(ax, xs, ys; markersize = 14)
    pt = PointInteractable(ax, p)   # radius from the marker's drawn extent
end
```

```julia
@bind pick masque(fig, pt)
```

`id` and `payloads` take the same keywords as the explicit constructors.
Defaults are the plot's name in lowercase (`:scatter`, `:lines`,
`:hist`, …), except Heatmap/Image (`:cells`), BarPlot (`:bars`), and
LineSegments (`:segments`). `masque(fig)` uses those same ids.
`pick.layer === :heatmap` never matches. The Heatmap/Image method takes
no `payloads` keyword: cells resolve `{i, j, value}` client-side, same
as `grid = (...)`. That layer is `:grid`, so `selected=` cannot hydrate
it.

## Recipes masque(fig) extracts

Sourced from `_plotbase` / `_construct` and the `Axis3` / `PolarAxis`
gates in [`auto_interactables`](@ref). Unknown top-level plots are
skipped with `@warn`, not an error. Nested children of an unknown parent
are not walked. Constructor signatures and default fields stay in
[Element constructors](@ref) and [Plot-object defaults](@ref).

`Axis` is a 2D `Makie.Axis`. `Colorbar` and `Legend` are figure-content
blocks, not scene plots.

| Recipe | Layer `id` | Kind | Axis | Axis3 | PolarAxis |
|---|---|---|---|---|---|
| `scatter!` | `:scatter` | `:circles` | yes | yes | yes |
| `meshscatter!` | `:meshscatter` | `:circles` | yes | yes | — |
| `lines!` | `:lines` | `:lines` | yes | yes | yes |
| `linesegments!` | `:segments` | `:segments` | yes | yes | yes |
| `wireframe!` | `:wireframe` | `:segments` | yes | yes | — |
| `arrows3d!` (`Arrows3D`) | `:arrows3d` | `:segments` | yes | yes | — |
| `heatmap!` / `image!` | `:cells` | `:grid` | yes | — | — |
| `barplot!` | `:bars` | `:rects` | yes | — | — |
| `poly!` | `:poly` | `:polygons` | yes | — | — |
| `stairs!` | `:stairs` | `:lines` | yes | — | — |
| `series!` | `:series` | `:lines` | yes | — | yes |
| `errorbars!` | `:errorbars` | `:segments` | yes | — | — |
| `rangebars!` | `:rangebars` | `:segments` | yes | — | — |
| `hlines!` / `vlines!` | `:hlines` / `:vlines` | `:segments` | yes | — | — |
| `spy!` | `:spy` | `:rects` | yes | — | — |
| `hist!` | `:hist` | `:rects` | yes | — | — |
| `waterfall!` | `:waterfall` | `:rects` | yes | — | — |
| `crossbar!` | `:crossbar` | `:rects` | yes | — | — |
| `hspan!` / `vspan!` | `:hspan` / `:vspan` | `:rects` | yes | — | — |
| `band!` | `:band` | `:polygons` | yes | — | — |
| `density!` | `:density` | `:polygons` | yes | — | — |
| `contourf!` | `:contourf` | `:polygons` | yes | — | — |
| `violin!` | `:violin` | `:polygons` | yes | — | — |
| `voronoiplot!` | `:voronoiplot` | `:polygons` | yes | — | — |
| `stem!` | `:stem` + `:stem_stems` | `:circles` + `:segments` | yes | — | — |
| `scatterlines!` | `:scatterlines` + `:scatterlines_line` | `:circles` + `:lines` | yes | — | yes |
| `boxplot!` | `:boxplot` | `:rects` or `:polygons` (body only) | yes | — | — |
| `text!` | `:text` | `:rects` | yes | — | — |
| `annotation!` | `:annotation` | `:rects` | yes | — | — |
| `Colorbar` (block) | `:colorbar` | `:axis` | figure content | | |
| `Legend` (block) | `:legend` | `:rects` | figure content | | |

`stem!` and `scatterlines!` become two layers. `boxplot!` hits the box
body; whiskers and outliers are not hit-tested. `annotation!` is the
inner `Text`. `text!` whose `space` is not `:data` is skipped with a
specific warning. `lines!` and `stairs!` are one whole-line element.
`series!` is one `:lines` layer with one element per series.

A recipe that is not in the table is skipped with `@warn`. Nested
children of an unknown parent are not walked. `LScene` has no overlay;
see [Troubleshooting](@ref). For a type you implement yourself, see
[Custom hits](@ref).

## Element constructors

| Constructor | Signature | Bond | Kind | Guide |
|---|---|---|---|---|
| [`PointInteractable`](@ref) | `(ax, points; radius=9, radius3d=nothing, id=:points)` or `(ax, p::Scatter; id=:scatter)` | [`ElementEvent`](@ref): 1-based `index`, `x`, `y`[, `z`] | `:circles` | [Getting started](@ref), [Click marks](@ref) |
| [`PointInteractable`](@ref) | `(ax, p::MeshScatter; id=:meshscatter)` | [`ElementEvent`](@ref): 1-based `index`, `x`, `y`, `z` | `:circles` | [Backends](@ref) |
| [`SegmentInteractable`](@ref) | `(ax, vertices; mode=:polyline, unit=:segment, tol=6, id=:segments)` | [`ElementEvent`](@ref): 1-based `segment_index` (`:segment`) or `index` (`:line`) | `:polyline`, `:lines`, or `:segments` | [Click marks](@ref) |
| [`RectInteractable`](@ref) | `(ax; rects, clamp_to_viewport=false, id=:rects)` or `(ax, p::BarPlot; id=:bars)` | [`ElementEvent`](@ref): explicit `index`; BarPlot `low`, `high`, `value` | `:rects` | [Click marks](@ref) |
| [`RectInteractable`](@ref) | `(ax; grid, id=:rects)` or `(ax, p::Union{Heatmap,Image}; id=:cells)` | [`GridCellEvent`](@ref): 1-based `i`, `j`; `A[cell]`; `value` when shipped | `:grid` | [Inspect a grid](@ref) |
| [`PolygonInteractable`](@ref) | `(ax, rings; id=:polygons)` or `(ax, p::Poly; id=:poly)` | [`ElementEvent`](@ref): 1-based `index` | `:polygons` | [Click marks](@ref) |
| [`TextInteractable`](@ref) | `(ax, p::Makie.Text; id=:text)` only | [`ElementEvent`](@ref): `text`, 1-based `index`, `x`, `y` | `:rects` | [Click marks](@ref) |

`mode` is `:polyline` (connected path) or `:pairs` (disjoint pairs).
`unit` is `:segment` (one element per edge or pair; the default) or
`:line` (the whole path is one element; requires `mode = :polyline`).
`lines!` / `stairs!` / a `scatterlines!` line already pass
`unit = :line`. `tol` is hit-test slack in logical px, scaled to DPI
like `radius` (default 6). `radius3d` is per-point data-space
half-extents on a 3D axis and overrides `radius`. `clamp_to_viewport`
clamps a list rect that spans past the axis edge.

Plot-object `SegmentInteractable` does not take `mode`, `unit`, or
`tooltip`; the plot type fixes all three.
`PointInteractable(ax, p::Scatter)` does not take `tooltip=`
(`MethodError`). Heatmap/image take `id` only.

`selected=` hydrates `:circles`, `:rects`, `:polygons`, `:segments`,
`:polyline`, and `:lines`. It cannot hydrate `:grid`. For more
information, see [Selection](@ref).

## Plot-object defaults

Each row is `*(ax, p)` unless noted. `id` is the auto layer id. Bond is
[`ElementEvent`](@ref) except Heatmap/Image ([`GridCellEvent`](@ref)).

| Plot | Constructor | Default fields | Kind |
|---|---|---|---|
| `Scatter` | `PointInteractable` | 1-based `index`, `x`, `y`[, `z`] | `:circles` |
| `MeshScatter` | `PointInteractable` | 1-based `index`, `x`, `y`, `z`; `radius3d` from data-space `markersize` | `:circles` |
| `Lines` / `Stairs` | `SegmentInteractable` | 1-based `index` | `:lines` |
| `Series` | `SegmentInteractable` | 1-based `index`; `label` when Makie set one | `:lines` |
| `LineSegments` / `Errorbars` / `Rangebars` / `HLines` / `VLines` / `Wireframe` | `SegmentInteractable` | 1-based `segment_index` | `:segments` |
| `Arrows3D` | `SegmentInteractable` | 1-based `index`, `x`, `y`, `z`, `u`, `v`, `w` | `:segments` |
| `BarPlot` | `RectInteractable` | `low`, `high`, `value` (dodge/stack/auto-width honored) | `:rects` |
| `Hist` | `RectInteractable` | `value`, `low`, `high` | `:rects` |
| `Waterfall` | `RectInteractable` | `low`, `high`, `value` | `:rects` |
| `CrossBar` | `RectInteractable` | `midpoint`, `low`, `high` | `:rects` |
| `HSpan` / `VSpan` | `RectInteractable` | `low`, `high`; `clamp_to_viewport = true` | `:rects` |
| `Spy` | `RectInteractable` | 1-based `index` | `:rects` |
| `Heatmap` / `Image` | `RectInteractable` | [`GridCellEvent`](@ref): 1-based `i`, `j` | `:grid` |
| `Poly` / `Band` / `Density` / `Voronoiplot` | `PolygonInteractable` | 1-based `index` | `:polygons` |
| `Contourf` | `PolygonInteractable` | `low`, `high` | `:polygons` |
| `Violin` | `PolygonInteractable` | `x` | `:polygons` |
| `Text` | `TextInteractable` | `text`, 1-based `index`, `x`, `y` | `:rects` |
| `Stem` | auto only | points + stems | `:circles` + `:segments` |
| `ScatterLines` | auto only | points + line | `:circles` + `:lines` |
| `BoxPlot` | auto only | `q1`, `median`, `q3`; whiskers and outliers are not hit-tested | `:rects` or `:polygons` |
| `Annotation` | auto only (inner `Text`) | text fields | `:rects` |

`annotation!` labels are reachable only through that inner `Text` or
`masque(fig)`, never a hand-written `TextInteractable`. For Axis3 /
PolarAxis yes-or-no, and for types that are skipped, see
[Recipes masque(fig) extracts](@ref).

## Axis, legend, and drag

| Constructor | Signature | Bond | Kind | Guide |
|---|---|---|---|---|
| [`AxisInteractable`](@ref) | `(ax; id=:axis)` | [`AxisEvent`](@ref): `x`, `y` | `:axis` | [Read coordinates](@ref) |
| [`ColorbarInteractable`](@ref) | `(cb; id=:colorbar)` | [`ColorbarEvent`](@ref): `value` | `:axis` (bbox) | [Read coordinates](@ref) |
| [`LegendInteractable`](@ref) | `(leg; targets=nothing, id=:legend)` | [`LegendEvent`](@ref): `label`, `group`, `targets` | `:rects` | [Legend](@ref) |
| [`ThresholdInteractable`](@ref) | `(ax; orientation=:horizontal, value, id=:threshold)` | [`ThresholdEvent`](@ref): `value` on release | `:threshold` | [Read coordinates](@ref) |
| [`ROIInteractable`](@ref) | `(ax; bounds, selects=nothing, id=:roi)` | [`BoundsEvent`](@ref); with `selects`, `Vector{ElementEvent}` or [`GridWindowEvent`](@ref) | `:roi` | [Brush a region](@ref) |
| [`ViewInteractable`](@ref) | `(ax; id=:view)` | none — commits nothing | `:view` | [Pan and orbit](@ref) |

`value=` on a threshold accepts a number or a [`ThresholdEvent`](@ref).
`value=` on a colorbar accepts a number or a [`ColorbarEvent`](@ref).
`bounds=` accepts a 4-tuple or a [`BoundsEvent`](@ref).

[`AxisInteractable`](@ref), [`ThresholdInteractable`](@ref), and
[`ROIInteractable`](@ref) are 2D-only: they raise `ArgumentError` on
`Axis3` or `PolarAxis`. They need a linear or log scale. Categorical is
fine for axis and threshold, not for ROI. `ViewInteractable` raises
`ArgumentError` on polar, a Colorbar, or a categorical 2D axis; Axis3
orbit is allowed. Shift+drag wins over ROI or threshold on the same
axis. `selects` accepts a `:circles` or `:grid` layer id only. Colorbar
kind is `:axis`, not `:colorbar`. Legend kind is `:rects`.

Changing `limits` (2D) or `azimuth`/`elevation` (`Axis3`) and rebuilding
the widget re-projects the overlay. Dragging with
[`ViewInteractable`](@ref) is different: it commits nothing. On both
backends, in-drag frames stream over `with_js_link`. `:cairo` ships a
PNG; `:webgl` ships a serialized scene onto the canvas already on the
page. See [Pan and orbit](@ref) and
[`examples/view_manip.jl`](https://github.com/jowch/Masque.jl/blob/main/examples/view_manip.jl).

## Custom

| Constructor | Signature | Bond | Kind | Guide |
|---|---|---|---|---|
| [`RegionInteractable`](@ref) | `(ax; regions, payloads, id=:region)` | [`ElementEvent`](@ref) per split layer | `:circles` / `:rects` / `:polygons` as `:id_c` / `:id_r` / `:id_p` | [Custom hits](@ref) |
| [`FunctionInteractable`](@ref) | `(f; events=(:click, :hover))` | the bond type of each layer's kind; default [`ElementEvent`](@ref) | whatever `f` emits | [Custom hits](@ref) |

A type of your own implements [`hitlayers`](@ref), plus [`bondtype`](@ref)
and [`transform_bond`](@ref) when the commit is not [`ElementEvent`](@ref).
See [A custom interactable](@ref).

## 3D axes and `PolarAxis`

`Axis3` gets the point and segment kinds with 3D fields: Scatter
carries `index`, `x`, `y`, `z`. A `lines!` is one whole-line element
whose default payload is `{index}` (the path is still projected from
the 3D vertices). MeshScatter gets depth-correct
per-marker hit radii from its data-space `markersize` (`radius3d`).
Wireframe edges and Arrows3D shafts hit as segments. Geometry is
projected once, in Julia, at build time, so it is the same on `:cairo`
and `:webgl`. Auto-extract allowlists are
[Recipes masque(fig) extracts](@ref). See [Backends](@ref).

`PolarAxis` gets the same discrete point and segment overlays on both
backends. Continuous θ/r readout is not shipped.
`AxisInteractable`, `ThresholdInteractable`, `ROIInteractable`, and
orbit-mode `ViewInteractable` do not work on polar. On `Axis3`, those
2D-only constructors raise `ArgumentError`; orbit-mode
`ViewInteractable` is allowed. `LScene` is not supported on either
backend. See [Troubleshooting](@ref).

For the exported API dump, see [API](@ref).
