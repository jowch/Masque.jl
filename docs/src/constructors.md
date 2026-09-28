# Constructors

The tables below list every built-in interactable with its signature,
what a click or release gives `@bind`, and the guide that shows it in
use. For what each event holds, see [What the `@bind` value holds](@ref).

Most constructors take the axis first and `id` as a keyword: the
`Symbol` an event reports as `pick.layer`. Constructors for marks also
take `payloads` (a vector or a `DataFrame`, one entry per mark) and
`tooltip` (a `masque"..."` template, or `false`). Without `payloads`,
each mark reports its `index` and coordinates.

## `masque(fig)` without interactables

`masque(fig)` is the same as `masque(fig, auto_interactables(fig))`.
[`auto_interactables`](@ref) makes an interactable for every plot it
knows on each axis, plus every `Colorbar` and `Legend`, and skips any
other plot with a warning. [Recipes masque(fig) extracts](@ref) lists
the plots it knows.

To change what it made, edit the vector and pass it to `masque`:

```julia
ints = let
    ints = auto_interactables(fig)
    push!(ints, AxisInteractable(ax))
    ints
end
```

```julia
@bind pick masque(fig, ints)
```

Each layer's id is its plot type in lowercase, such as `:scatter` or
`:lines`, with `_2`, `_3` added when a type repeats. Three are
shortened: `heatmap!` and `image!` are `:cells`, `barplot!` is `:bars`,
and `linesegments!` is `:segments`. `pick.layer` is that id.

`masque(fig)` doesn't add axis readouts, thresholds, boxes, panning, or
slices, so to use one, add it to the vector as above. To give a layer
a tooltip template or a `label`, build that interactable yourself from
the plot, for example
`PointInteractable(ax, s; tooltip = masque"...")`.

## Marks

| Constructor | Signature | `@bind` value | Guide |
|---|---|---|---|
| [`PointInteractable`](@ref) | `(ax, points; radius, radius3d, id=:points)` or `(ax, p::Scatter)` | [`ElementEvent`](@ref): `index`, `x`, `y`[, `z`] | [Getting started](@ref), [Click marks](@ref) |
| [`SegmentInteractable`](@ref) | `(ax, vertices; mode=:polyline, unit=:segment, tol=6, id=:segments)` | [`ElementEvent`](@ref): `segment_index`, or `index` with `unit = :line` | [Click marks](@ref) |
| [`RectInteractable`](@ref) | `(ax; rects, clamp_to_viewport=false, id=:rects)` or `(ax, p::BarPlot)` | [`ElementEvent`](@ref): `index`; bars give `low`, `high`, `value` | [Click marks](@ref) |
| [`RectInteractable`](@ref) | `(ax; grid, id=:rects)` or `(ax, p::Union{Heatmap,Image})` | [`GridCellEvent`](@ref): `i`, `j`, `value` | [Inspect a grid](@ref) |
| [`PolygonInteractable`](@ref) | `(ax, rings; holes=nothing, id=:polygons)` or `(ax, p::Poly)` | [`ElementEvent`](@ref): `index` | [Click marks](@ref) |
| [`TextInteractable`](@ref) | `(ax, p::Text; id=:text)` | [`ElementEvent`](@ref): `text`, `index`, `x`, `y` | [Click marks](@ref) |

For a scatter, pass the plot, so the highlight matches the drawn
marker. If you pass positions instead and Masque can't find a scatter
with those positions, pass `radius` in pixels. On an `Axis3`,
`radius3d` gives each point's size in data units.

For segments, `mode = :pairs` treats the vertices as separate pairs
instead of one path, and `unit = :line` makes the whole path one mark.
`tol` is how far from the line, in pixels, a hover still counts.

`holes` gives each polygon its hole rings, so hovering inside a hole
does not reach that polygon. `clamp_to_viewport = true` trims a
rectangle that reaches past the axis edge.

## Plot-object defaults

When you pass a plot object, the constructor reads its geometry from
the plot. The table lists the fields each plot type reports when you
don't pass `payloads`, and the id `masque(fig)` gives it.

| Plot | Constructor | Default fields | id |
|---|---|---|---|
| `Scatter` | `PointInteractable` | `index`, `x`, `y`[, `z`] | `:scatter` |
| `MeshScatter` | `PointInteractable` | `index`, `x`, `y`, `z` | `:meshscatter` |
| `Lines` / `Stairs` | `SegmentInteractable` | `index` (the whole line is one mark) | `:lines` / `:stairs` |
| `Series` | `SegmentInteractable` | `index`; `label` when the series has one | `:series` |
| `LineSegments` / `Errorbars` / `Rangebars` / `HLines` / `VLines` / `Wireframe` | `SegmentInteractable` | `segment_index` | `:segments`, `:errorbars`, … |
| `Arrows3D` | `SegmentInteractable` | `index`, `x`, `y`, `z`, `u`, `v`, `w` | `:arrows3d` |
| `BarPlot` | `RectInteractable` | `low`, `high`, `value` | `:bars` |
| `Hist` | `RectInteractable` | `value`, `low`, `high` | `:hist` |
| `Waterfall` | `RectInteractable` | `low`, `high`, `value` | `:waterfall` |
| `CrossBar` | `RectInteractable` | `midpoint`, `low`, `high` | `:crossbar` |
| `HSpan` / `VSpan` | `RectInteractable` | `low`, `high` | `:hspan` / `:vspan` |
| `Spy` | `RectInteractable` | `index` | `:spy` |
| `Heatmap` / `Image` | `RectInteractable` | `i`, `j`, `value` (takes no `payloads`) | `:cells` |
| `Poly` / `Band` / `Density` / `Voronoiplot` | `PolygonInteractable` | `index` | `:poly`, `:band`, … |
| `Contourf` | `PolygonInteractable` | `low`, `high` | `:contourf` |
| `Violin` | `PolygonInteractable` | `x` | `:violin` |
| `Text` | `TextInteractable` | `text`, `index`, `x`, `y` | `:text` |
| `Stem` | `masque(fig)` only | points, and stems as a second layer | `:stem`, `:stem_stems` |
| `ScatterLines` | `masque(fig)` only | points, and the line as a second layer | `:scatterlines`, `:scatterlines_line` |
| `BoxPlot` | `masque(fig)` only | `q1`, `median`, `q3` (the box only) | `:boxplot` |
| `Annotation` | `masque(fig)` only | the text's fields | `:annotation` |

## Axis, legend, and drag

| Constructor | Signature | `@bind` value | Guide |
|---|---|---|---|
| [`AxisInteractable`](@ref) | `(ax; id=:axis)` | [`AxisEvent`](@ref): `x`, `y` | [Read coordinates](@ref) |
| [`ColorbarInteractable`](@ref) | `(cb; id=:colorbar)` | [`ColorbarEvent`](@ref): `value` | [Read coordinates](@ref) |
| [`ThresholdInteractable`](@ref) | `(ax; orientation=:horizontal, value, id=:threshold)` | [`ThresholdEvent`](@ref): `value`, on release | [Read coordinates](@ref) |
| [`LegendInteractable`](@ref) | `(leg; targets=nothing, tooltip=nothing, id=:legend)` | [`LegendEvent`](@ref): `label`, `group`, `targets` | [Legend](@ref) |
| [`ROIInteractable`](@ref) | `(ax; bounds, selects=nothing, id=:roi)` | [`BoundsEvent`](@ref); with `selects`, the marks or cells inside | [Brush a region](@ref) |
| [`ViewInteractable`](@ref) | `(ax; id=:view)` | none | [Pan and orbit](@ref) |
| [`SliceInteractable`](@ref) | `(ax, plot)` or `(ax; series, orientation=:vertical, crosshair=true, covers, tooltip)` | none; hover only | [Sample a series](@ref) |

A threshold's `value` and a box's `bounds` also accept the event they
produce, so one widget can set where another starts. A legend made by
`masque(fig)` links each entry to its plots; `LegendInteractable(leg)`
on its own needs `targets` for that.

Axis readouts, thresholds, boxes, and slices need a 2D `Axis`, while
panning also works on an `Axis3`, where it orbits the camera. See
[Supported plots and axes](@ref) for which work where.

## Custom

| Constructor | Signature | `@bind` value | Guide |
|---|---|---|---|
| [`RegionInteractable`](@ref) | `(ax; regions, payloads, id=:region)` | [`ElementEvent`](@ref) | [Custom hits](@ref) |
| [`FunctionInteractable`](@ref) | `(f; events=(:click, :hover))` | [`ElementEvent`](@ref), by default | [Custom hits](@ref) |

To return an event type of your own, subtype
[`AbstractInteractable`](@ref). See [A custom interactable](@ref).

Full docstrings for every exported name are on the [API](@ref) page.
