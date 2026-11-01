# Supported plots and axes

Masque works on `Axis`, `Axis3`, and `PolarAxis`. The first table
shows which interactions work on each axis type, and the second lists
the plot types `masque(fig)` makes interactive.

## Interactions by axis

Hovering, clicking and selecting marks work on all three axis types,
but `Axis3` and `PolarAxis` support only some plot types
([Plots `masque(fig)` makes interactive](@ref) says which). Reading
coordinates, dragging a threshold or an [`ROIInteractable`](@ref) box,
sampling a series, and panning turn a pointer position into a data
value, so they need a 2D `Axis`. A `PolarAxis` can read the angle and
radius under the pointer.

| Interaction | `Axis` | `Axis3` | `PolarAxis` |
|---|---|---|---|
| Hover and click marks | every recipe | some recipes | some recipes |
| Select several marks (`select = :many`, see [Select several marks](@ref)) | yes | yes | yes |
| Drag a box to select marks | yes | yes ⁴ | yes |
| Link selections across plots ([`linked`](@ref)) | yes | yes | yes |
| Hover a line to read the nearest point you plotted | yes | no | yes |
| Hover a surface to read its height | no ⁵ | yes | no |
| Read `(x, y)` ([`AxisInteractable`](@ref)) | yes ¹ | no | yes ³ |
| Drag a threshold ([`ThresholdInteractable`](@ref)) | yes ¹ | no | no |
| Brush a box ([`ROIInteractable`](@ref)) | yes ² | no | no |
| Slice across series ([`SliceInteractable`](@ref)) | yes ² | no | no |
| Pan or orbit ([`ViewInteractable`](@ref)) | pan ² | orbit | no |

¹ The axis scale must be `identity`, `log10`, or `log` (for a
threshold, only the scale it moves along). A categorical axis works
too: the tooltip shows the category, and the event holds its position
and its label (see [Read coordinates](@ref)).

² The x and y scales must be `identity`, `log10`, or `log`, and both
axes must be numeric, so a categorical axis is refused.

³ The readout is the angle in radians and the radius (see
[Read coordinates](@ref)).

⁴ When the `Axis3` has a [`ViewInteractable`](@ref), a plain drag
turns the view, so hold Alt (Option on a Mac) to draw the box.

⁵ Draw the matrix with `heatmap!` to read its values on a 2D `Axis`.

A "no", a scale outside that list (such as `Makie.pseudolog10` or
`Makie.Symlog10`), or a categorical axis where ² requires a numeric one
raises an `ArgumentError` when `masque` runs, instead of giving a wrong
coordinate. Orbiting an `Axis3` has no scale requirement.
`ViewInteractable` also raises an error when given a `Colorbar`.

Legends, colorbars, and the sliders, toggles and menus of
[Sliders, toggles and menus](@ref) belong to the figure, not to an
axis, so they work next to any `Axis`, `Axis3`, or `PolarAxis`. A
[`ColorbarInteractable`](@ref) reads values on `identity`, `log10`, and
`log` colorbars.

`LScene` is not supported: on both backends, `masque` raises an error
for a figure that contains one, so nothing in that figure responds, not
even its legend and colorbar. For interactive 3D, use an `Axis3`.
[Troubleshooting](@ref) has each error message and its fix.

[Keyboard and screen readers](@ref) lists which marks the keyboard
reaches.

## Plots `masque(fig)` makes interactive

`masque(fig)` makes these plots interactive and skips any other plot
with a warning that names it. Every recipe here except `surface!` works
on a 2D `Axis`, and the last two columns say which also work on `Axis3`
and `PolarAxis`. Constructor signatures and default fields are in
[Constructors](@ref) and [Fields each plot reports](@ref).

| Recipe | Layer `id` | Kind | Axis3 | PolarAxis |
|---|---|---|---|---|
| `scatter!` | `:scatter` | `:circles` | yes | yes |
| `meshscatter!` | `:meshscatter` | `:circles` | yes | — |
| `lines!` | `:lines` | `:lines` | yes | yes |
| `linesegments!` | `:segments` | `:segments` | yes | yes |
| `wireframe!` | `:wireframe` | `:segments` | yes | — |
| `arrows3d!` (`Arrows3D`) | `:arrows3d` | `:segments` | yes | — |
| `arrows2d!` (`Arrows2D`) | `:arrows2d` | `:segments` | — | — |
| `heatmap!` / `image!` | `:cells` | `:grid` | — | — |
| `surface!` | `:surface` | `:surface` | only | — |
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
| `hexbin!` | `:hexbin` | `:polygons` | — | — |
| `stem!` | `stem.points` + `stem.stems` | `:circles` + `:segments` | — | — |
| `scatterlines!` | `scatterlines.points` + `scatterlines.line` | `:circles` + `:lines` | yes | yes |
| `boxplot!` | `:boxplot` | `:rects` or `:polygons` (body only) | — | — |
| `text!` | `:text` | `:rects` | yes | — |
| `annotation!` | `:annotation` | `:rects` | — | — |
| `Colorbar` (block) | `:colorbar` | `:axis` | yes | yes |
| `Legend` (block) | `:legend` | `:rects` | yes | yes |

Each `lines!` and `stairs!` plot is one element for its whole line, and
`series!` has one element per series. On a 2D `Axis` or a
`PolarAxis`, hovering a line shows the point you plotted nearest the
pointer, and a click on a line named in `bind` picks that point. Only the body of a `boxplot!`
responds, not its whiskers or outliers, and an `annotation!` responds
on its text. In a `contourf!` plot, hovering inside a hole of a filled
level reaches nothing unless another level is drawn there. A `scatter!`
sized in data units (`markerspace = :data`) responds over each marker's
drawn shape: a square over its square, a circle over its circle. To
cover heatmap cells exactly, draw `marker = Rect` with `markersize = 1`;
the `:rect` symbol draws a smaller square. Its layer has kind `:polygons`; pass `radius` to
`interactables(plot; …)` to hit circles of that many pixels instead.

A recipe not in the table, such as `rainclouds!`, still gets each
visible part the table knows, under that part's layer id: `rainclouds!`
gives `:violin`, `:scatter`, and `:boxplot`, and `tricontourf!` gives
`:poly`. A `datashader!` of points gives `:cells`, and hovering a pixel
shows how many points fell in it. A plot whose `space` is not
`:data`, such as a `bracket!` label or a `scatter!` placed with
`space = :relative`, is skipped with a warning that names its `space`.
A `surface!` responds on an `Axis3` only: hovering it shows the
data point under the pointer on the side you can see, and a
`wireframe!` drawn over the same grid is left as decoration so the
surface answers. A `surface!` on a 2D `Axis` is skipped with a
warning; to inspect a grid there, draw it with `heatmap!`. Where marks
of one plot overlap, the one drawn on top answers. On a 2D `Axis` that
is the one listed last. On an `Axis3`, the `meshscatter!` sphere
nearer the camera answers. For `scatter!` markers and `text!` labels
there it is the nearest one with `backend = :webgl`, and the one
listed last with CairoMakie, which draws them in the order you give
them. If Masque can't make one plot
interactive, it skips that plot with a warning and the rest of the
figure still responds. To make a recipe of your own
respond as one mark, see [Your own plot types](@ref), and to add hit
shapes where nothing is drawn, see [Custom shapes](@ref).

Bars or cells turned with `rotate!` are skipped with a warning. To make
rotated bars respond, draw them with `poly!`.
