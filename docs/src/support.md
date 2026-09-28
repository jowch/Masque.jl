# Supported plots and axes

Masque works on `Axis`, `Axis3`, and `PolarAxis`. The first table
shows which interactions work on each axis type. The second lists the
plot types `masque(fig)` makes interactive.

## Interactions by axis

Hovering and clicking marks works on all three axis types, but `Axis3`
and `PolarAxis` support only some plot types
([Recipes masque(fig) extracts](@ref) says which). Reading coordinates,
dragging a threshold or a box, and panning turn a pointer position into
a data value. They need a 2D `Axis` with a scale the browser can
invert.

| Interaction | `Axis` | `Axis3` | `PolarAxis` |
|---|---|---|---|
| Hover and click marks | every recipe | some recipes ³ | some recipes ³ |
| Read `(x, y)` ([`AxisInteractable`](@ref)) | yes ¹ | no | no |
| Drag a threshold ([`ThresholdInteractable`](@ref)) | yes ¹ | no | no |
| Brush a box ([`ROIInteractable`](@ref)) | yes ² | no | no |
| Sample a series ([`SliceInteractable`](@ref)) | yes ² | no | no |
| Pan or orbit ([`ViewInteractable`](@ref)) | pan ² | orbit | no |

¹ Scale `identity`, `log10`, or `log`. A categorical axis works too: the
tooltip shows the category, and the event holds its position and its
label (see [Read coordinates](@ref)).

² Scale `identity`, `log10`, or `log`, and numeric (not categorical)
limits.

³ `Axis3` supports `scatter!`, `meshscatter!`, `lines!`, `linesegments!`,
`wireframe!`, and `arrows3d!`. `PolarAxis` supports `scatter!`, `lines!`,
`linesegments!`, `scatterlines!`, and `series!`. `masque(fig)` skips
every other plot on those axes, with a warning that names the plot.

A "no" in the table means that passing the interactable raises an
`ArgumentError` when `masque` runs. You get the error instead of a wrong
coordinate. A [`ColorbarInteractable`](@ref) reads values on
`identity`, `log10`, and `log` colorbars. Other Makie scales, such as
`Makie.pseudolog10` and `Makie.Symlog10`, raise `ArgumentError` for
every interaction marked ¹ or ².

Legends and colorbars belong to the figure, not to an axis, so they work
next to any `Axis`, `Axis3`, or `PolarAxis`. `LScene` is not supported:
`masque` refuses a figure that contains one, on both backends, and the
figure's legend and colorbar with it. [Troubleshooting](@ref) has each
error message and its fix.

Keyboard focus reaches points, bars, polygons, lines, segments, text,
and legend entries. It does not reach heatmap cells, axis or colorbar
readouts, boxes, thresholds, or the view. See
[Keyboard and screen readers](@ref).

## Recipes masque(fig) extracts

`masque(fig)` makes the plots in this table interactive, through
[`auto_interactables`](@ref). A recipe that is not in the table still
gets each visible child plot the table knows, under that child's layer
id. Masque stops at the first plot it knows, so each mark becomes one
layer: `rainclouds!` gives `:violin`, `:scatter`, and `:boxplot`, and
not also the violin's `:poly`. A recipe with no known child is skipped
with a warning that names it. Constructor signatures and default fields
are in [Element constructors](@ref) and [Plot-object defaults](@ref).

In the table, `Axis` means a 2D `Makie.Axis`. `Colorbar` and `Legend`
are blocks of the figure, not plots inside an axis.

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

`stem!` and `scatterlines!` become two layers. Only the body of a
`boxplot!` responds to the pointer. Its whiskers and outliers do not.
An `annotation!` responds on its text. A `text!` whose `space` is not
`:data` is skipped with its own warning. Each `lines!` and `stairs!`
plot is one element for its whole line. `series!` is one `:lines` layer
with one element per series.

A `contourf!` plot responds on its filled levels. A pointer in a hole
of a level's polygon misses that polygon. It hits another polygon only
where one is drawn in the hole. An empty hole, including a peak above
the top level, hits nothing.

`hexbin!` is not made interactive, because its hexagons are sized in
data units. The label of a `bracket!` warns
`masque: skipping non-data-space text`. A child plot other than text
whose `space` is not `:data` is skipped without a warning of its own.
Hidden child plots are not layers. A figure with an `LScene` is
refused; see [Troubleshooting](@ref). To make a plot type interactive
yourself, see [Custom hits](@ref).
