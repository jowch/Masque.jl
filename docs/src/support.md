# Supported plots and axes

This page is the one place that lists what Masque can overlay and where
each interaction works. The guides describe what an interaction does and
link here for the limits.

## Interactions by axis

Hovering and clicking marks works on all three axis types, but `Axis3`
and `PolarAxis` each build only some plot types (the recipe table below
says exactly which). The interactions that turn a pointer position back
into a data value — reading coordinates, dragging a threshold or a box,
panning — need a flat 2D axis whose scale the browser can invert.

| Interaction | `Axis` | `Axis3` | `PolarAxis` |
|---|---|---|---|
| Hover and click marks | every recipe | some recipes ³ | some recipes ³ |
| Read `(x, y)` ([`AxisInteractable`](@ref)) | yes ¹ | no | no |
| Drag a threshold ([`ThresholdInteractable`](@ref)) | yes ¹ | no | no |
| Brush a box ([`ROIInteractable`](@ref)) | yes ² | no | no |
| Sample a series ([`SliceInteractable`](@ref)) | yes ² | no | no |
| Pan or orbit ([`ViewInteractable`](@ref)) | pan ² | orbit | no |

¹ Scale `identity`, `log10`, or `log`. On a categorical axis the hover
card shows the category under the pointer, but a click or a release on
the categorical dimension currently fails with an error instead of
returning it, so commit readouts on numeric axes.

² Scale `identity`, `log10`, or `log`, and numeric (not categorical)
limits.

³ `Axis3` builds `scatter!`, `meshscatter!`, `lines!`, `linesegments!`,
`wireframe!`, and `arrows3d!`. `PolarAxis` builds `scatter!`, `lines!`,
`linesegments!`, `scatterlines!`, and `series!`. Every other plot on those
axes is skipped.

"Skipped" means `masque(fig)` leaves that plot out with a warning naming
it; "no" means passing the interactable raises an `ArgumentError` when
`masque` runs, rather than reporting a wrong coordinate. A
[`ColorbarInteractable`](@ref) reads values on `identity`, `log10`, and
`log` colorbars. Other Makie scales, such as `Makie.pseudolog10` and
`Makie.Symlog10`, raise `ArgumentError` for every interaction marked ¹ or
². Legend entries and colorbars are figure-level blocks rather than
axis plots, so they work whatever axes the figure holds. `LScene` is
not supported: CairoMakie refuses the figure, and WGLMakie draws it
with no overlay. [Troubleshooting](@ref) has each error message
and its fix.

Keyboard focus reaches points, bars, polygons, lines, segments, text,
and legend entries, but not heatmap cells, axis or colorbar readouts,
boxes, thresholds, or the view; see [Keyboard and screen readers](@ref).

## Recipes masque(fig) extracts

[`auto_interactables`](@ref) walks every axis and applies this table. A
recipe missing from the table
still contributes each visible child the table already knows, under that
child's layer id. The walk stops at the child, so a parent that later
gets its own row is not registered twice. A recipe with nothing to
contribute is skipped with `@warn`, and the warning names the recipe.
Constructor signatures and default fields stay in
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

`contourf!` is filled levels. A pointer in a hole misses that polygon.
It hits another polygon only when one is actually drawn in the hole.
An empty hole, including a peak above the top level, hits nothing.
`hexbin!` stays unconstructed: its scatter is data-space. `bracket!`'s
label warns `masque: skipping non-data-space text`. A non-`Text` child
whose `space` is not `:data` is skipped with no warning of its own.
Hidden children are not layers. `LScene` has no overlay; see
[Troubleshooting](@ref). For a type you implement yourself, see
[Custom hits](@ref).
