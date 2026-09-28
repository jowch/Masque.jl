# Constructors

Every built-in constructor, with its signature, the value `@bind` gives
you, its `HitLayer` kind, and the guide that shows it in use. If you are
new to Masque, start with [Getting started](@ref).

Every constructor takes an `Axis` (or a `Makie.Colorbar` or
`Makie.Legend`) and geometry in data coordinates, plus `id`: the
`Symbol` the event reports as `layer`. Element constructors also take
`payloads` (a vector or a `DataFrame`; heatmap and image take no
`payloads`) and `tooltip` (`nothing`, a `masque"..."` template, or
`false`), unless the plot-object method leaves them out. Without
`payloads`, each mark gets an `index`, its position in the data you
plotted, plus the coordinates that constructor reports.
`LegendInteractable` takes `tooltip` and a fixed payload, but not
`payloads=`. Whole-axis and drag constructors take `id` plus their own
keywords; passing them `payloads=` or `tooltip=` raises a `MethodError`.
`FunctionInteractable` takes neither an axis nor `id`.
`RegionInteractable` requires `payloads`.

## The `@bind` value

A widget's `@bind` value starts as `nothing`. It changes on the first
click, or on the first release of a drag, unless `selected=` restores a
selection. [`bondtype`](@ref) returns the value type of an interactable
(and of `selects` on an ROI). Read the event's named fields to see what
was clicked. Indices count from 1, in the order you plotted the marks.

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
| ROI without `selects` | [`BoundsEvent`](@ref) | `pick.xmin` … `pick.ymax` | [Brush a region](@ref) |
| View pan / orbit | none | the value does not change | [Pan and orbit](@ref) |

A widget that mixes two of these holds whichever event came last. A
`selects` ROI is the exception: the box sets the value, so the layer it
`selects` shows tooltips, but clicking its marks does not change the
value. Clicks on other layers still give single events. See
[Concepts](@ref). Panning or orbiting with [`ViewInteractable`](@ref)
never changes the value. For `selected=`, see [Selection](@ref).

## `masque(fig)` without interactables

`masque(fig)` is the same as `masque(fig, auto_interactables(fig))`.
[`auto_interactables`](@ref) makes an interactable for every plot it
knows on each `Axis`, `Axis3`, and `PolarAxis`, plus every `Colorbar`
and `Legend`. It does not add `AxisInteractable`,
`ThresholdInteractable`, `ROIInteractable`, `ViewInteractable`, or
`SliceInteractable`.

```julia
@bind pick masque(fig)
```

```julia
ints = auto_interactables(fig)
```

To change what it made, take that vector, edit ids or `payloads`, add an
interactable of your own, and pass the vector to `masque`:

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

A plot type Masque does not know is skipped with a `@warn` rather than
an error. A figure with no known plots warns "overlaying nothing".
Layer ids are the plot kind (`:scatter`, `:bars`, `:cells`, …), with
`_2`, `_3` added when a kind repeats. Heatmap and image share `:cells`.
BarPlot is `:bars`, not `:barplot`. LineSegments is `:segments`.
`pick.layer` is that id.

On `Axis3` and `PolarAxis`, `masque(fig)` skips plot types whose hit
areas would not line up with the drawing.
[Recipes masque(fig) extracts](@ref) lists the ones it keeps. A
rectangle constructor you write yourself still builds on those axes,
but its hit areas can sit in the wrong place, so use `masque(fig)`
there.

Stem and ScatterLines each become two layers, and only through
`masque(fig)`: the points keep the base id, and the stems or the line
get `:stem_stems` or `:scatterlines_line`. There is no public
plot-object constructor for Stem, ScatterLines, BoxPlot, or Annotation,
and no `id_stems` or `id_line` keyword.

`masque(fig)` passes each Scatter plot to its constructor, so the
highlight fits the drawn marker. `PointInteractable(ax, points)` without
`radius` uses that same radius when exactly one `Scatter` on `ax` has
those positions in the same order. Otherwise it assumes Makie's default
`:circle` at the theme `markersize`. Pass `radius=` when that lookup
would be ambiguous, or when there is no scatter to match. The default
`:circle` gives `r ≈ 0.3525 × markersize`. A `Circle` or `Rect` marker
gives `r = markersize / 2`, and so does a marker with no readable size
(a character, an image). The quick start on [Getting started](@ref)
passes the scatter, so the radius comes from the marker.

On large data, `masque(fig)` makes one default payload per element.
Pass smaller `payloads=` yourself, or leave the layer out. Layers from
`masque(fig)` do not take `tooltip=` or `label=`; build the interactable
yourself for those. `max_width` defaults to 700, the width of Pluto's
column. Do not `deepcopy(fig)`: Makie `Figure`s cannot be copied. Do
not add a second `@bind pick` cell.

`PointInteractable(ax, p::Makie.Scatter; tooltip = masque"…")` raises a
`MethodError`. Apart from `TextInteractable`, the plot-object
constructors that take `payloads` do not take `tooltip=`.
`tooltip = true` raises an `ArgumentError`. For more information, see
[Tooltips](@ref).

A legend from `masque(fig)` links each entry to its plots.
`LegendInteractable(leg)` without `targets=` has no links: its entries
still respond to hover and clicks, but it does not find the plots on
its own.

## From a plot object

Pass the plot object that a `plot!` call returns, and the constructor
reads the geometry from it. You get the same interactable the explicit
constructor would build, so `payloads`, `selected=`, and tooltips still
apply. Pass `ax` too: a plot does not know which axis it is on.

```julia
begin
    p = scatter!(ax, xs, ys; markersize = 14)
    pt = PointInteractable(ax, p)   # radius from the marker's drawn size
end
```

```julia
@bind pick masque(fig, pt)
```

`id` and `payloads` take the same keywords as the explicit constructors.
The default id is the plot's name in lowercase (`:scatter`, `:lines`,
`:hist`, …), except Heatmap/Image (`:cells`), BarPlot (`:bars`), and
LineSegments (`:segments`). `masque(fig)` uses the same ids, so
`pick.layer === :heatmap` never matches. The Heatmap/Image method takes
no `payloads` keyword: each cell reports `i`, `j`, and `value`, as with
`grid = (...)`. That layer has kind `:grid`, so `selected=` cannot start
it with a cell selected.

## Element constructors

| Constructor | Signature | `@bind` value | Kind | Guide |
|---|---|---|---|---|
| [`PointInteractable`](@ref) | `(ax, points; radius=nothing, radius3d=nothing, id=:points)` or `(ax, p::Scatter; id=:scatter)` | [`ElementEvent`](@ref): 1-based `index`, `x`, `y`[, `z`] | `:circles` | [Getting started](@ref), [Click marks](@ref) |
| [`PointInteractable`](@ref) | `(ax, p::MeshScatter; id=:meshscatter)` | [`ElementEvent`](@ref): 1-based `index`, `x`, `y`, `z` | `:circles` | [Backends](@ref) |
| [`SegmentInteractable`](@ref) | `(ax, vertices; mode=:polyline, unit=:segment, tol=6, id=:segments)` | [`ElementEvent`](@ref): 1-based `segment_index` (`:segment`) or `index` (`:line`) | `:polyline`, `:lines`, or `:segments` | [Click marks](@ref) |
| [`RectInteractable`](@ref) | `(ax; rects, clamp_to_viewport=false, id=:rects)` or `(ax, p::BarPlot; id=:bars)` | [`ElementEvent`](@ref): explicit `index`; BarPlot `low`, `high`, `value` | `:rects` | [Click marks](@ref) |
| [`RectInteractable`](@ref) | `(ax; grid, id=:rects)` or `(ax, p::Union{Heatmap,Image}; id=:cells)` | [`GridCellEvent`](@ref): 1-based `i`, `j`; `A[cell]`; `value` when the grid includes it | `:grid` | [Inspect a grid](@ref) |
| [`PolygonInteractable`](@ref) | `(ax, rings; holes=nothing, id=:polygons)` or `(ax, p::Poly; id=:poly)` | [`ElementEvent`](@ref): 1-based `index` | `:polygons` | [Click marks](@ref) |
| [`TextInteractable`](@ref) | `(ax, p::Makie.Text; id=:text)` only | [`ElementEvent`](@ref): `text`, 1-based `index`, `x`, `y` | `:rects` | [Click marks](@ref) |

`mode` is `:polyline` (a connected path) or `:pairs` (separate pairs).
`unit` is `:segment` (one element per edge or pair; the default) or
`:line` (the whole path is one element; requires `mode = :polyline`).
`lines!`, `stairs!`, and a `scatterlines!` line already use
`unit = :line`. `tol` is how far from the line, in figure pixels, a
hover or click still counts (default 6); like `radius`, it scales with
the figure's resolution. On a 3D axis, `radius3d` gives each point's
half-size in data units and overrides `radius`. `clamp_to_viewport`
trims a rectangle that reaches past the axis edge. `holes` is one group
of hole rings per element, the same point type as `rings`. Without it,
every element is solid. A point inside a hole does not count as that
element.

Plot-object `SegmentInteractable` does not take `mode`, `unit`, or
`tooltip`; the plot type sets all three.
`PointInteractable(ax, p::Scatter)` does not take `tooltip=`
(`MethodError`). Heatmap/image take `id` only.

`selected=` can start a widget with marks selected on `:circles`,
`:rects`, `:polygons`, `:segments`, `:polyline`, and `:lines` layers,
but not on `:grid`. For more information, see [Selection](@ref).

## Plot-object defaults

Each row is `*(ax, p)` unless noted. `id` is the layer id `masque(fig)`
gives it. The value is an [`ElementEvent`](@ref), except for
Heatmap/Image ([`GridCellEvent`](@ref)).

| Plot | Constructor | Default fields | Kind |
|---|---|---|---|
| `Scatter` | `PointInteractable` | 1-based `index`, `x`, `y`[, `z`] | `:circles` |
| `MeshScatter` | `PointInteractable` | 1-based `index`, `x`, `y`, `z`; `radius3d` from data-space `markersize` | `:circles` |
| `Lines` / `Stairs` | `SegmentInteractable` | 1-based `index` | `:lines` |
| `Series` | `SegmentInteractable` | 1-based `index`; `label` when Makie set one | `:lines` |
| `LineSegments` / `Errorbars` / `Rangebars` / `HLines` / `VLines` / `Wireframe` | `SegmentInteractable` | 1-based `segment_index` | `:segments` |
| `Arrows3D` | `SegmentInteractable` | 1-based `index`, `x`, `y`, `z`, `u`, `v`, `w` | `:segments` |
| `BarPlot` | `RectInteractable` | `low`, `high`, `value` (follows `dodge`, `stack`, and automatic widths) | `:rects` |
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
| `Stem` | `masque(fig)` only | points + stems | `:circles` + `:segments` |
| `ScatterLines` | `masque(fig)` only | points + line | `:circles` + `:lines` |
| `BoxPlot` | `masque(fig)` only | `q1`, `median`, `q3`; whiskers and outliers do not respond | `:rects` or `:polygons` |
| `Annotation` | `masque(fig)` only (inner `Text`) | text fields | `:rects` |

`annotation!` labels respond only through that inner `Text` or
`masque(fig)`, never a hand-written `TextInteractable`. For which plots
work on `Axis3` and `PolarAxis`, and which are skipped, see
[Recipes masque(fig) extracts](@ref).

## Axis, legend, and drag

| Constructor | Signature | `@bind` value | Kind | Guide |
|---|---|---|---|---|
| [`AxisInteractable`](@ref) | `(ax; id=:axis)` | [`AxisEvent`](@ref): `x`, `y` | `:axis` | [Read coordinates](@ref) |
| [`ColorbarInteractable`](@ref) | `(cb; id=:colorbar)` | [`ColorbarEvent`](@ref): `value` | `:axis` (bbox) | [Read coordinates](@ref) |
| [`LegendInteractable`](@ref) | `(leg; targets=nothing, id=:legend)` | [`LegendEvent`](@ref): `label`, `group`, `targets` | `:rects` | [Legend](@ref) |
| [`ThresholdInteractable`](@ref) | `(ax; orientation=:horizontal, value, id=:threshold)` | [`ThresholdEvent`](@ref): `value` on release | `:threshold` | [Read coordinates](@ref) |
| [`ROIInteractable`](@ref) | `(ax; bounds, selects=nothing, id=:roi)` | [`BoundsEvent`](@ref); with `selects`, `Vector{ElementEvent}` or [`GridWindowEvent`](@ref) | `:roi` | [Brush a region](@ref) |
| [`ViewInteractable`](@ref) | `(ax; id=:view)` | none; the value does not change | `:view` | [Pan and orbit](@ref) |
| [`SliceInteractable`](@ref) | `(ax, plot)` or `(ax; series, orientation=:vertical, crosshair=true, id=:slice, covers=(), tooltip=nothing)` | none; hover only | `:slice` | [Sample a series](@ref) |

`value=` on a threshold accepts a number or a [`ThresholdEvent`](@ref).
A colorbar click is a [`ColorbarEvent`](@ref) with `pick.value`.
`ColorbarInteractable` takes the colorbar and `id` only.
`bounds=` accepts a 4-tuple or a [`BoundsEvent`](@ref).

[`AxisInteractable`](@ref), [`ThresholdInteractable`](@ref),
[`ROIInteractable`](@ref), and [`SliceInteractable`](@ref) are 2D-only:
they raise `ArgumentError` on `Axis3` or `PolarAxis`. They need a linear
or log scale. A categorical axis works for axis and threshold, but not
for ROI or a slice. `ViewInteractable` raises `ArgumentError` on polar,
a Colorbar, or a categorical 2D axis; Axis3 orbit is allowed. When an
ROI or a threshold shares the axis with a `ViewInteractable`, a plain
drag moves the ROI or threshold and Shift+drag pans. `selects` accepts
a `:circles` or `:grid` layer id only. Colorbar kind is `:axis`, not
`:colorbar`. Legend kind is `:rects`.

After you change `limits` (2D) or `azimuth`/`elevation` (`Axis3`) and
rebuild the widget, the hit areas follow the new view. Dragging with
[`ViewInteractable`](@ref) moves the view without changing the `@bind`
value. On a 2D axis, the scroll wheel zooms about the pointer, and the
axis frame stays put while the data slides inside it. Dragging needs a
running notebook on both backends: Julia redraws the view while you
drag, as images with `:cairo` or on the live canvas with `:webgl`. See
[Pan and orbit](@ref), [Limits](@ref), and [Drag to pan](@ref).

## Sample a series

Pass the line plot you already made:

```julia
s = lines!(ax, xs, ys)
probe = SliceInteractable(ax, s)
```

Hovering shows the line's value at the pointer. The `@bind` value does
not change. `masque(fig)` never adds a slice, so pass one yourself.

By default, a vertical line follows the pointer and reads each series'
`y` at the pointer's data `x`, with a filled dot on each series in that
series' color. The line is a light grey (`#b0b0b0` on a light figure,
`#929292` on a dark one), fainter than a selected mark's outline, at
80% opacity, with a 1.5px edge in the figure's background color.
`orientation = :horizontal` reads `x` at the pointer's data `y` and
draws a horizontal line. `crosshair = false` keeps the dots and the
tooltip and draws no line. Use one slice per axis.

The tooltip shows the sample while the pointer is over a layer the
slice covers, or over empty space inside the axis within at least one
series. A marker the slice does not cover, and a colorbar, keep their
own tooltips, and hovering a marker hides the line.

`SliceInteractable(ax, plot)` and `SliceInteractable(ax, plots)` accept
`Lines`, `Stairs`, `Series`, `Band`, and `Density`. The slice reads the
points those plots draw. `Stairs` keeps its steps, so the sample is
constant between risers and, on a riser itself, is the y where that
riser starts. `Density` and `Band` contribute the band's upper curve as
drawn: a `Band` with `direction = :y` is flipped to match, and a
`Density` with `direction = :y` is sampled horizontally.
`orientation = nothing` on the plot constructor follows that: `:y` is
horizontal, and everything else is vertical.

`covers = nothing` on the plot constructor names each plot's layer id
from `masque(fig)`, numbered inside that call's vector (`:lines`, then
`:lines_2` when the vector repeats a kind; also `:stairs`, `:series`,
`:band`, `:density`). It does not count other plots already on the
axis, so slicing only the second `lines!` covers `:lines`. Pass
`covers` to name the `:polygons` or `:lines` layers in the same
`masque` call whose highlight this slice replaces.

Without a plot object, pass the vertices. Each series is `(; x, y)`
plus optional `id`, `label`, and `color`. For a vertical slice, `x` must
be strictly increasing; for a horizontal slice, `y` must be.

```julia
probe = SliceInteractable(ax; series = [(; id = :wide, x = xs, y = ys)])
```

`tooltip = nothing` shows a table of the sampled values, a `masque"…"`
template formats those same fields, and `false` turns the tooltip off.

`Axis3`, `PolarAxis`, a categorical axis, and a scale other than
`identity`, `log10`, or `log` raise `ArgumentError`. See
[Troubleshooting](@ref).

## Custom

| Constructor | Signature | `@bind` value | Kind | Guide |
|---|---|---|---|---|
| [`RegionInteractable`](@ref) | `(ax; regions, payloads, id=:region)` | [`ElementEvent`](@ref) per split layer | `:circles` / `:rects` / `:polygons` as `:id_c` / `:id_r` / `:id_p` | [Custom hits](@ref) |
| [`FunctionInteractable`](@ref) | `(f; events=(:click, :hover))` | the value type of each layer's kind; default [`ElementEvent`](@ref) | whatever `f` returns | [Custom hits](@ref) |

A type of your own implements [`hitlayers`](@ref), plus
[`bondtype`](@ref) and [`transform_bond`](@ref) when its value is not an
[`ElementEvent`](@ref). See [A custom interactable](@ref).

## 3D axes and `PolarAxis`

On an `Axis3`, points and segments work, with 3D fields: a Scatter
reports `index`, `x`, `y`, `z`. A `lines!` is one whole-line element
whose default payload is `{index}`. MeshScatter gets a hit radius per
marker that accounts for depth, from its data-space `markersize`
(`radius3d`). Wireframe edges and Arrows3D shafts respond as segments.
Hits are the same on `:cairo` and `:webgl`. For which plots
`masque(fig)` picks up, see [Recipes masque(fig) extracts](@ref) and
[Backends](@ref).

On a `PolarAxis`, points and segments work on both backends. Clicking
empty space gives no θ/r reading. `AxisInteractable`,
`ThresholdInteractable`, `ROIInteractable`, `SliceInteractable`, and
orbit-mode `ViewInteractable` do not work on polar. On `Axis3`, those
2D-only constructors raise `ArgumentError`; orbit-mode
`ViewInteractable` is allowed. `LScene` is not supported on either
backend. See [Troubleshooting](@ref).

Full docstrings for every exported name are on the [API](@ref) page.
