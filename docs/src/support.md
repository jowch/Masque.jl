# Supported plots and axes

Masque works on `Axis`, `Axis3`, and `PolarAxis`. The first table
shows which interactions work on each axis type, and the second lists
the plot types `masque(fig)` makes interactive.

## Interactions by axis

Hovering and clicking marks works on all three axis types, but `Axis3`
and `PolarAxis` support only some plot types
([Recipes masque(fig) extracts](@ref) says which). Reading coordinates,
dragging a threshold or a box, sampling a series, and panning turn a
pointer position into a data value, so they need a 2D `Axis`.

| Interaction | `Axis` | `Axis3` | `PolarAxis` |
|---|---|---|---|
| Hover and click marks | every recipe | some recipes | some recipes |
| Read `(x, y)` ([`AxisInteractable`](@ref)) | yes ¹ | no | no |
| Drag a threshold ([`ThresholdInteractable`](@ref)) | yes ¹ | no | no |
| Brush a box ([`ROIInteractable`](@ref)) | yes ² | no | no |
| Sample a series ([`SliceInteractable`](@ref)) | yes ² | no | no |
| Pan or orbit ([`ViewInteractable`](@ref)) | pan ² | orbit | no |

¹ The axis scale must be `identity`, `log10`, or `log` (for a
threshold, only the scale it moves along). A categorical axis works
too: the tooltip shows the category, and the event holds its position
and its label (see [Read coordinates](@ref)).

² The x and y scales must be `identity`, `log10`, or `log`, and both
axes must be numeric, so a categorical axis is refused.

A "no", a scale outside that list (such as `Makie.pseudolog10` or
`Makie.Symlog10`), or a categorical axis where ² requires a numeric one
raises an `ArgumentError` when `masque` runs, instead of giving a wrong
coordinate. Orbiting an `Axis3` has no scale requirement.
`ViewInteractable` also raises an error when given a `Colorbar`.

Legends and colorbars belong to the figure, not to an axis, so they work
next to any `Axis`, `Axis3`, or `PolarAxis`. A
[`ColorbarInteractable`](@ref) reads values on `identity`, `log10`, and
`log` colorbars.

`LScene` is not supported: on both backends, `masque` raises an error
for a figure that contains one, so nothing in that figure responds, not
even its legend and colorbar. For interactive 3D, use an `Axis3`.
[Troubleshooting](@ref) has each error message and its fix.

[Keyboard and screen readers](@ref) lists which marks the keyboard
reaches.

## Recipes masque(fig) extracts

`masque(fig)` makes these plots interactive and skips any other plot
with a warning that names it. Every recipe here works on a 2D `Axis`,
and the last two columns say which also work on `Axis3` and
`PolarAxis`. Constructor signatures and default fields are in
[Constructors](@ref) and [Plot-object defaults](@ref).

| Recipe | Layer `id` | Kind | Axis3 | PolarAxis |
|---|---|---|---|---|
| `scatter!` | `:scatter` | `:circles` | yes | yes |
| `meshscatter!` | `:meshscatter` | `:circles` | yes | — |
| `lines!` | `:lines` | `:lines` | yes | yes |
| `linesegments!` | `:segments` | `:segments` | yes | yes |
| `wireframe!` | `:wireframe` | `:segments` | yes | — |
| `arrows3d!` (`Arrows3D`) | `:arrows3d` | `:segments` | yes | — |
| `heatmap!` / `image!` | `:cells` | `:grid` | — | — |
| `barplot!` | `:bars` | `:rects` | — | — |
| `poly!` | `:poly` | `:polygons` | — | — |
| `stairs!` | `:stairs` | `:lines` | — | — |
| `series!` | `:series` | `:lines` | — | yes |
| `errorbars!` | `:errorbars` | `:segments` | — | — |
| `rangebars!` | `:rangebars` | `:segments` | — | — |
| `hlines!` / `vlines!` | `:hlines` / `:vlines` | `:segments` | — | — |
| `spy!` | `:spy` | `:rects` | — | — |
| `hist!` | `:hist` | `:rects` | — | — |
| `waterfall!` | `:waterfall` | `:rects` | — | — |
| `crossbar!` | `:crossbar` | `:rects` | — | — |
| `hspan!` / `vspan!` | `:hspan` / `:vspan` | `:rects` | — | — |
| `band!` | `:band` | `:polygons` | — | — |
| `density!` | `:density` | `:polygons` | — | — |
| `contourf!` | `:contourf` | `:polygons` | — | — |
| `violin!` | `:violin` | `:polygons` | — | — |
| `voronoiplot!` | `:voronoiplot` | `:polygons` | — | — |
| `stem!` | `:stem` + `:stem_stems` | `:circles` + `:segments` | — | — |
| `scatterlines!` | `:scatterlines` + `:scatterlines_line` | `:circles` + `:lines` | — | yes |
| `boxplot!` | `:boxplot` | `:rects` or `:polygons` (body only) | — | — |
| `text!` | `:text` | `:rects` | — | — |
| `annotation!` | `:annotation` | `:rects` | — | — |
| `Colorbar` (block) | `:colorbar` | `:axis` | yes | yes |
| `Legend` (block) | `:legend` | `:rects` | yes | yes |

Each `lines!` and `stairs!` plot is one element for its whole line, and
`series!` has one element per series. Only the body of a `boxplot!`
responds, not its whiskers or outliers, and an `annotation!` responds
on its text. In a `contourf!` plot, hovering inside a hole of a filled
level reaches nothing unless another level is drawn there.

A recipe not in the table, such as `rainclouds!`, still gets each
visible part the table knows, under that part's layer id: `rainclouds!`
gives `:violin`, `:scatter`, and `:boxplot`. A plot whose `space` is not
`:data`, such as a `bracket!` label or a `scatter!` placed with
`space = :relative`, is skipped with a warning that names its `space`.
`surface!` and `hexbin!` are not made interactive. To make another plot
type interactive yourself, see [Custom hits](@ref).

Bars or cells turned with `rotate!` are skipped with a warning. To make
rotated bars respond, draw them with `poly!`.
