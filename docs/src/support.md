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
| Select several marks (`select = :many`, see [Select several marks](@ref)) | yes | yes ⁴ | yes ⁴ |
| Drag a box to select marks (with `select = :many`) | yes ⁵ | yes ⁵ | yes |
| Link selections across plots ([`linked`](@ref)) | yes | yes | yes |
| Hover a line to read the nearest point you plotted | yes | yes | yes |
| Hover a surface to read its values | no ⁶ | yes | yes |
| Read `(x, y)` ([`AxisInteractable`](@ref)) | yes ¹ | no | yes ³ |
| Drag a threshold ([`ThresholdInteractable`](@ref)) | yes ¹ | no | no |
| Drag a band ([`SpanInteractable`](@ref)) | yes ⁷ | no | no |
| Draw a box you can move and resize ([`ROIInteractable`](@ref)) | yes ² | no | no |
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

⁴ Except a `surface!`, which takes one pick at a time.

⁵ When the axis has a [`ViewInteractable`](@ref), a plain drag pans or
turns the view, so hold Alt (Option on a Mac) to draw the box.

⁶ Draw the matrix with `heatmap!` to read its values on a 2D `Axis`.

⁷ The scale the band moves along must be `identity`, `log10`, or
`log`, and that axis must be numeric.

A "no" in the last six rows, a scale outside that list (such as
`Makie.pseudolog10` or `Makie.Symlog10`), or a categorical axis where ²
or ⁷ requires a numeric one raises an `ArgumentError` when `masque` runs,
instead of giving a wrong coordinate. The other "no" cells don't raise:
a `surface!` is skipped with a warning. Orbiting an `Axis3` has no
scale requirement.
`ViewInteractable` also raises an error when given a `Colorbar`.

Legends, colorbars, and the sliders, toggles and menus of
[Sliders, toggles and menus](@ref) belong to the figure, not to an
axis, so they work next to any `Axis`, `Axis3`, or `PolarAxis`. A
[`ColorbarInteractable`](@ref) reads values on `identity`, `log10`, and
`log` colorbars, a [`ThresholdInteractable`](@ref) drags a cutoff
along them, and a [`SpanInteractable`](@ref) drags a band along them.

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
| [`scatter!`](plots/scatter.md) | `:scatter` | `:circles` | yes | yes |
| [`meshscatter!`](plots/meshscatter.md) | `:meshscatter` | `:circles` | yes | — |
| [`lines!`](plots/lines.md) | `:lines` | `:lines` | yes | yes |
| [`linesegments!`](plots/linesegments.md) | `:segments` | `:segments` | yes | yes |
| `wireframe!` | `:wireframe` | `:segments` | yes | — |
| [`arrows3d!`](plots/arrows3d.md) (`Arrows3D`) | `:arrows3d` | `:segments` | yes | — |
| [`arrows2d!`](plots/arrows2d.md) (`Arrows2D`) | `:arrows2d` | `:segments` | — | — |
| [`heatmap!`](plots/heatmap.md) / [`image!`](plots/heatmap.md) | `:cells` | `:grid` | — | — |
| [`surface!`](plots/surface.md) | `:surface` | `:surface` | yes | yes |
| [`barplot!`](plots/barplot.md) | `:bars` | `:rects` | — | — |
| [`poly!`](plots/poly.md) | `:poly` | `:polygons` | — | — |
| [`stairs!`](plots/stairs.md) | `:stairs` | `:lines` | — | — |
| [`series!`](plots/series.md) | `:series` | `:lines` | — | yes |
| [`errorbars!`](plots/errorbars.md) | `:errorbars` | `:segments` | — | — |
| [`rangebars!`](plots/rangebars.md) | `:rangebars` | `:segments` | — | — |
| [`hlines!` / `vlines!`](plots/hlines.md) | `:hlines` / `:vlines` | `:segments` | — | — |
| [`spy!`](plots/spy.md) | `:spy` | `:rects` | — | — |
| [`hist!`](plots/hist.md) | `:hist` | `:rects` | — | — |
| [`waterfall!`](plots/waterfall.md) | `:waterfall` | `:rects` | — | — |
| [`crossbar!`](plots/crossbar.md) | `:crossbar` | `:rects` | — | — |
| [`hspan!`](plots/hspan.md) / [`vspan!`](plots/hspan.md) | `:hspan` / `:vspan` | `:rects` | — | — |
| [`band!`](plots/band.md) | `:band` | `:polygons` | — | — |
| [`density!`](plots/density.md) | `:density` | `:polygons` | — | — |
| [`contourf!`](plots/contourf.md) | `:contourf` | `:polygons` | — | — |
| [`violin!`](plots/violin.md) | `:violin` | `:polygons` | — | — |
| [`voronoiplot!`](plots/voronoiplot.md) | `:voronoiplot` | `:polygons` | — | — |
| [`hexbin!`](plots/hexbin.md) | `:hexbin` | `:polygons` | — | — |
| [`stem!`](plots/stem.md) | `stem.points` + `stem.stems` | `:circles` + `:segments` | — | — |
| [`scatterlines!`](plots/scatterlines.md) | `scatterlines.points` + `scatterlines.line` | `:circles` + `:lines` | yes | yes |
| [`boxplot!`](plots/boxplot.md) | `:boxplot` | `:rects` or `:polygons` (body only) | — | — |
| [`text!`](plots/text.md) | `:text` | `:rects` | yes | — |
| [`annotation!`](plots/annotation.md) | `:annotation` | `:rects` | — | — |
| `Colorbar` (block) | `:colorbar` | `:axis` | yes | yes |
| `Legend` (block) | `:legend` | `:rects` | yes | yes |

Each `lines!` and `stairs!` plot is one element for its whole line, and
`series!` has one element per series. Hovering a line shows the point
you plotted nearest the pointer, and a click on a line named in `bind`
picks that point.
Only the body of a `boxplot!` responds, not its whiskers or outliers,
and an `annotation!` responds on its text. In a `contourf!` plot, hovering inside a hole of a filled
level reaches nothing unless another level is drawn there. A `scatter!`
sized in data units (`markerspace = :data`) responds over each marker's
drawn shape: a square over its square, a circle over its circle. To
cover heatmap cells exactly, draw `marker = Rect` with `markersize = 1`;
the `:rect` symbol draws a smaller square. Its layer has kind `:polygons`; pass `radius` to
`interactables(plot; …)` to hit circles of that many pixels instead. On an `Axis3`, the
markers turn to face the camera, so each one responds over a circle the size of the marker.
One drawn with a `marker_offset` is skipped with a warning.

A recipe not in the table, such as `rainclouds!` or `contour!`, still
gets each visible part the table knows, under that part's layer id;
[Plots with several parts](@ref) lists the common ones. A [`datashader!`](plots/datashader.md)
of points gives `:cells`, and hovering a pixel shows how many points
fell in it. A plot whose `space` is not
`:data`, such as a `bracket!` label or a `scatter!` placed with
`space = :relative`, is skipped with a warning that names its `space`.
A `surface!` responds on an `Axis3` and a `PolarAxis`: hovering it
shows the data point nearest the pointer, on the side you can see, and
a `wireframe!` drawn over the same grid on an `Axis3` is left as
decoration so the surface answers. On a `PolarAxis`, a `surface!` is
how Makie draws a polar heatmap, and the tooltip shows the point's
angle and radius the way the axis's other tooltips do. A `surface!` on
a 2D `Axis` is skipped with a
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

## Plots with several parts

Some plots draw several kinds of mark, such as the points and stems of
a `stem!`, and each kind is its own part with its own name. You use
that name to read a click from the `@bind` value and to name the part
in `bind` or `selected`. Each part's marks come in a fixed order, and
a click reports the mark's place in that order as its `index`, so
`index = 2` on a violin is the second violin from the left.

| Plot | Part | One mark is | Order of the marks |
|---|---|---|---|
| [`stem!`](plots/stem.md) | `points` | one point | the order of your data |
| | `stems` | one stem | the order of your data |
| [`scatterlines!`](plots/scatterlines.md) | `points` | one point | the order of your data |
| | `line` | the whole line | — |
| [`rainclouds!`](plots/rainclouds.md) | `scatter` | one raindrop, for one observation | the order of your data |
| | `violin` | one violin per category | left to right along the axis |
| | `boxplot` | one box per category | left to right along the axis |
| [`contour!`](plots/contour.md) with `labels = true` | `lines` | every contour line together | — |
| | `text` | one label | the order Makie draws them, which you don't set |
| [`qqplot!`](plots/qqplot.md) / [`qqnorm!`](plots/qqplot.md) with a `qqline` | `scatter` | one point | smallest quantile first |
| | `segments` | the reference line | — |
| [`streamplot!`](plots/streamplot.md) | `scatter` | one arrowhead | the order Makie draws them, which you don't set |
| | `lines` | every streamline together | — |

Violins and boxes come out left to right along the axis, not in the
order of your data. With numbers as categories that is smallest first.
With strings, `rainclouds!` places each category where it first
appears in your data, so `["b", "a", "b"]` gives the `"b"` violin
first. With `dodge`, there is one violin and one box per category and
dodge group, and the groups of one category come before the next
category.

The parts of `stem!` and `scatterlines!` sit under the plot's id in
the `@bind` value, so a click on a stem is `sel.stem.stems`. The parts
of the other plots each take the id a plot of their own kind would
take, so a `rainclouds!` click on a violin is `sel.violin`, and its
raindrops are `sel.scatter_2` when the figure already has a
`scatter!`. To keep a plot's parts together under one name, give it an
`id`:

```julia
rc = rainclouds!(ax, groups, values)
@bind sel masque(fig, interactables(rc; id = :rain))
```

A click on a violin is then `sel.rain.violin`.

To attach your own data to a plot with several parts, give `payloads`
one list per part, keyed by the part's name in the table above:

```julia
rc = rainclouds!(ax, groups, values)
masque(fig, interactables(rc; payloads = (scatter = rows, violin = per_group)))
```

Each list has one entry per mark of its part, in the order the table
gives: `rows` has one entry per raindrop, in the order of your data,
and `per_group` one per violin, left to right. A part you leave out
keeps the payloads Masque gives it. A plain list, or a name the plot
has no part for, raises an error that lists the plot's parts. On a
`stem!`, `payloads = (points = rows,)` gives the points your rows and
leaves the stems as they are.

A `tooltip` template applies to every part of the plot. To give one
part a template of its own, such as one that names fields only that
part's payloads have, key `tooltip` by the part's name the same way:

```julia
q = qqnorm!(ax, wait; qqline = :fitrobust)
masque(fig, interactables(q;
    payloads = (scatter = [(customer = c,) for c in sortperm(wait)],),
    tooltip = (scatter = masque"Customer $(customer), waited $(y) min",),
))
```

The reference line keeps the tooltip Masque gives it, as does any part
you leave out.

Other plots that Masque builds from the marks they draw have one part,
under the id in this table:

| Plot | Layer `id` | One mark is |
|---|---|---|
| [`contour!`](plots/contour.md) / `contour3d!` without labels | `:lines` | every contour line together |
| [`tricontourf!`](plots/tricontourf.md) | `:poly` | one filled region, so a level split into pieces gives one mark per piece; it reports its `low` and `high` level |
| [`triplot!`](plots/triplot.md) | `:poly` | one triangle; it reports its three `vertices`, as indices into your points |
| [`pie!`](plots/pie.md) | `:poly` | one slice, in the order of your values; it reports its `value` and its `share` of the total |
| [`ablines!`](plots/ablines.md) | `:segments` | one line, in the order you give them |
| [`ecdfplot!`](plots/ecdfplot.md) | `:stairs` | the whole curve |
| `arc!` | `:lines` | the whole arc |
