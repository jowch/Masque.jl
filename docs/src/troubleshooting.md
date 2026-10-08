# Troubleshooting

Each entry starts with what you tried or the start of the error you
saw, then gives the cause and the fix. For constructor signatures, see
[Constructors](@ref).

## Most common

- No Makie backend loaded: see
  [Tried `masque` with no Makie backend](@ref).
- Pluto reports cyclic references for `selected=pick`: see
  [Tried feeding this widget's bond into the same call's `selected=`](@ref).
- Hover does not update `pick`: see
  [Tried reading pick on hover](@ref).

## Errors from `masque()` / interactable constructors

### Tried `masque` with no Makie backend

**Error prefix:** `masque(fig) needs a rendering backend loaded`

**Cause:** neither `CairoMakie` nor `WGLMakie` is loaded in the session.

**Fix:** add `using CairoMakie` (static PNG, the default) or
`using WGLMakie` (live GPU canvas; experimental) before calling
`masque`. Loading both is fine: `masque` without `backend=` then uses
CairoMakie. For more information, see [Backends](@ref).

### Tried a `backend=` that is not loaded

**Error prefix:** `` masque: `backend = :webgl` needs `using WGLMakie` first `` /
`masque: unknown backend`

**Cause:** `backend=` names a backend whose package is not loaded, or a
name other than `:cairo` and `:webgl`.

**Fix:** add `using WGLMakie` (for `:webgl`) or `using CairoMakie` (for
`:cairo`), or leave `backend=` out to use whichever is loaded. See
[Choose a backend](@ref).

### Tried `tooltip = true`

**Error prefix:** `tooltip = true is not meaningful`

**Cause:** an interactable was built with `tooltip = true`.

**Fix:** `tooltip` takes one of three forms, and `true` is not one of
them: leave `tooltip` out for the default table of names and values,
pass `masque"..."` for a template, or pass `tooltip = false` to hide the
tooltip. For more information, see [Tooltips](@ref).

### Tried `payloads` of the wrong length

**Error prefix:** `payloads has N entries, expected M`

**Cause:** `payloads` does not have one entry per mark. Every
interactable that takes `payloads`, including `PointInteractable` and
`RegionInteractable`, raises this `ArgumentError`. For a DataFrame the
message says `rows` instead of `entries`.

**Fix:** give one entry per mark, or omit `payloads` on constructors
that have a default.

### Tried two interactables with the same id

**Error prefix:** `masque: two interactables use the layer id`

**Cause:** two interactables in one `masque` call have the same `id`,
often because two constructors of the same kind both use their default
id, such as two `PointInteractable(ax, pts)` with `id = :points`.

**Fix:** pass a distinct `id` to one of them. An interactable whose id
matches a layer that `masque(fig)` builds on its own replaces that
layer instead of raising this error; see
[Adding to what `masque(fig)` builds](@ref).

### Passed a keyword your plot type's `interactables` method does not take

**Error prefix:** `masque: the interactables method for`

**Cause:** a call such as `interactables(d; tooltip = …)` passes its
keywords to the method you defined for your plot type, and a method
written as `Masque.interactables(ax, p::MyPlot)` takes none of them.

**Fix:** add `; kwargs...` to the method's signature and pass
`kwargs...` on to the constructors; see [Writing the method](@ref).

### Tried `mode` or `orientation` other than the two valid symbols

**Error prefix:** `mode must be :polyline or :pairs` /
`orientation must be :horizontal or :vertical`

**Cause:** `SegmentInteractable(...; mode = ...)` or
`ThresholdInteractable(...; orientation = ...)` got an unknown symbol.

**Fix:** for `mode`, use `:polyline` (one connected path) or `:pairs`
(separate segments). For `orientation`, use `:horizontal` (a line at
constant y, dragged up and down) or `:vertical`.

### Tried `unit = :line` with `mode = :pairs`

**Error prefix:** `unit=:line applies only to mode=:polyline`

**Cause:** `SegmentInteractable(...; unit = :line)` was combined with
`mode = :pairs` (or any mode other than `:polyline`).

**Fix:** drop `unit` (the default `:segment` makes each edge or pair
one element), or keep `mode = :polyline`. `lines!`, `stairs!`, and
`series!` already pass `unit = :line`.

### Tried ROI `bounds` that are not a 4-tuple in order

**Error prefix:** `ROIInteractable: bounds must be (xmin, xmax, ymin, ymax)` /
`need xmin < xmax and ymin < ymax`

**Cause:** `bounds` is not a 4-tuple, or the min/max order is backwards.

**Fix:** pass `bounds = (xmin, xmax, ymin, ymax)` with `xmin < xmax`
and `ymin < ymax`.

### Tried an unknown Region kind, or `selected=` on the base Region id

**Error prefix:** `RegionInteractable: unknown region kind` /
`RegionInteractable: payloads has N entries, expected M`

**Cause:** a region tuple's first element is not `:circle`, `:rect`, or
`:polygon`, or `regions` and `payloads` differ in length.
`selected = Dict(:cells => [1])` with `id = :cells` also fails, because
the region layers are named `:cells_c`, `:cells_r`, and `:cells_p`.

**Fix:** check the region tuples against [Custom hits](@ref). Use the
suffixed ids as the keys of `selected=`.

### Tried a scale Masque cannot invert in the browser

**Error prefix:** `is not invertible client-side` /
`needs client-side invertible`

**Cause:** an interactable that reads a position, drags, or pans was
given an axis or colorbar whose scale is not `identity`, `log10`, or
`log`, such as `Makie.pseudolog10`, `Makie.Symlog10`, or a custom
`ReversibleScale`. `SliceInteractable` says "needs client-side
invertible x and y scales".

**Fix:** switch the axis to a supported scale, or use an interactable
for marks (`PointInteractable`, `SegmentInteractable`, …) instead. The
full list of what each interaction needs is in
[Supported plots and axes](@ref).

### Tried `AxisInteractable`, `ThresholdInteractable`, `ROIInteractable`, or `SliceInteractable` on Axis3

**Error prefix:** `continuous pixel→data readout is undefined on an Axis3` /
`undefined on an Axis3`

**Cause:** those four interactables turn a pointer position into a 2D
data value. On an `Axis3`, a point on the screen is a ray through the
3D data, not a single data point.

**Fix:** on 3D axes, use interactables for points, lines, and
segments. To orbit an `Axis3`, pass `ViewInteractable(ax)`, which is
accepted there.

### Tried a threshold, box, slice, or pan on PolarAxis

**Error prefix:** `not supported on PolarAxis` /
`PolarAxis view gestures are not supported`

**Cause:** a threshold, a box, and a slice each follow a straight line
or a rectangle on the screen, and on a `PolarAxis` those are not a
constant angle, a constant radius, or a sector. Panning a polar axis
changes its angle and radius limits, which Masque does not do.

**Fix:** to read the angle and radius under the pointer, pass an
[`AxisInteractable`](@ref). To pick out points, use points, lines, or
segments, which respond to hover and click. See
[Supported plots and axes](@ref).

### [Tried `heatmap!` or `barplot!` on PolarAxis](@id polar-skipped-plots)

**Cause:** `masque(fig)` skips those plots on a `PolarAxis` with a
warning, because their rectangles would not line up with the polar
plot. A rectangle interactable you pass yourself, such as
`RectInteractable` or `GridInteractable`, is still built, but its hover areas sit in the
wrong place.

**Fix:** on a `PolarAxis`, only scatter, line, segment,
`scatterlines!`, and `series!` plots work. Use a Cartesian `Axis` for
the rest. See [Supported plots and axes](@ref).

### Tried ROI or View pan on a categorical 2D axis

**Error prefix:** `bounds need continuous axes` /
`pan needs continuous numeric axes` /
`sampling needs continuous axes`

**Cause:** a box, a slice, and panning need numeric axis limits, and a
categorical axis has none. Of the interactions that read a position,
only reading coordinates and dragging a threshold work on a categorical
axis.

**Fix:** use `AxisInteractable`, which reads the category, or plot
against a numeric axis. See [Supported plots and axes](@ref).

### Tried an `LScene` figure

**Error prefix:** ```Masque supports `Makie.Axis`, `Makie.Axis3`, and `Makie.PolarAxis`; found unsupported```

**Cause:** the figure contains an `LScene` block. `LScene` is not
supported on any backend, so `masque` refuses the figure rather than
leave that block with nothing to hover, even when the figure also holds
a normal `Axis`.

**Fix:** put interactive 3D in an `Axis3`, which both backends
support. To show an `LScene` without interaction, display the figure
itself instead of `masque(fig)`.

### Tried `selected=` on a layer that cannot start selected

**Error prefix:** `does not support pre-highlight` /
`out of range`

**Cause:** either the layer's kind cannot start with a selection from
`selected=`, or an index is out of range. Layers of kind `:circles`,
`:rects`, `:polygons`, `:segments`, `:polyline`, and `:lines` can start
selected, while `:grid`, `:axis`, `:threshold`, `:roi`, and `:view`
cannot.

**Fix:** check the layer's kind against [Selection](@ref), and keep
each index between 1 and the number of marks in that layer. For a
`RegionInteractable`, use the suffixed ids as keys, not the base
`id`.

### An error mentioning "Makie internals changed?"

**Cause:** Masque reads fields of Makie's plot objects, and a new
Makie, CairoMakie, or WGLMakie version can move or rename one of them,
so the problem is in Masque and not in your code.

**Fix:** file an issue with your Makie, CairoMakie, and WGLMakie
versions. To keep working until it is fixed, pin those packages to a
version that worked.

## Not errors, but surprising

### Upgrading code written for Masque 0.1

Masque 0.2 renamed or reshaped a few calls. The old forms still work in
0.2 and are removed in 0.3. Each one shows a warning in the cell's log
that names its replacement:

| 0.1 | 0.2 |
|---|---|
| `auto_interactables(fig)` | `interactables(fig)` |
| `RectInteractable(ax; grid = (xedges, yedges, values))` | `GridInteractable(ax, xedges, yedges, values)` |
| `RectInteractable(ax, hm)` for a heatmap or image | `GridInteractable(ax, hm)` |
| `RectInteractable(ax; rects = rects)` | `RectInteractable(ax, rects)` |
| `RegionInteractable(ax; regions = regions, payloads)` | `RegionInteractable(ax, regions; payloads)` |
| `masque(fig; backend = CairoBackend(; max_width))` | `masque(fig; backend = :cairo, max_width)` |
| `masque(fig; backend = WebGLBackend(; px_per_unit, max_width))` | `masque(fig; backend = :webgl, px_per_unit, max_width)` |

Four changes have no old form to fall back on:

- `masque(fig, xs...)` now keeps the plots' own hover and click and
  adds `xs` to them. Add `auto = false` to overlay only what you pass,
  as in 0.1.
- On a categorical or date axis, a mark's default `x` and `y` are now
  the label or date as text, not a number.
- A heatmap or image layer is a `GridInteractable`, so code that checks
  `isa RectInteractable` for one needs the new type.
- If you wrote your own backend, its `_ppu`, `context`, and
  `make_widget` methods take `max_width` as a new last argument.

The [changelog](https://github.com/jowch/Masque.jl/blob/main/CHANGELOG.md)
has the details.

### Tried `CairoMakie.activate!(type = "svg")` and the widget is a PNG

**Cause:** `type = "svg"` chooses how a bare `Figure` displays, but
`masque` always shows a PNG on CairoMakie, or a canvas on WGLMakie,
with tooltips and highlights drawn on top. `save("figure.svg", fig)`
still writes SVG, because the file extension decides the format.

**Fix:** keep `CairoMakie.activate!(type = "svg")` for the cells that
return a `Figure`, and write the SVG file with
`save("figure.svg", fig)`. In the cell that should show the interactive
figure, return `masque(fig)`. For more information, see
[Makie's settings don't change the widget](@ref makie-settings).

### Tried showing a widget outside Pluto and hover does nothing

**Cause:** tooltips, highlights, and clicks need Pluto. In Documenter,
VS Code, or any other HTML display, a CairoMakie widget shows the plain
figure. A WGLMakie widget has no image to show there, so it shows an
empty box saying it is drawn only in Pluto.

**Fix:** open the notebook in Pluto for the interactive figure. To put
the figure in a document, return `fig` itself, or write it with
`save("figure.png", fig)`.

### Tried feeding this widget's bond into the same call's `selected=`

**Pluto says:** cyclic references.

**Cause:** you passed this widget's own `@bind` value to its
`selected=`.

**Fix:** remove it, because a click already keeps its highlight. To
carry a selection through a rebuild, see
[Keep a selection when the figure rebuilds](@ref).

### Tried reading pick on hover

**Cause:** hovering shows the tooltip and highlight in the browser
without changing the `@bind` value.

**Fix:** read `pick` after a click (or Enter on a focused mark). For
what each gesture changes, and why, see [How interactions work](@ref).

### Right-click opens the context menu

Right-clicking the figure opens the browser's context menu for the
CairoMakie image or the WebGL canvas, and Control-click does the same
on macOS. That press does not start a drag or change the `@bind`
value. For what each gesture changes, see
[How interactions work](@ref).

### Tried a click and nothing happened

Check, in order:

1. Does any cell use the variable? With `@bind pick masque(...)` and no
   cell that uses `pick`, a click changes nothing you can see.
2. Did you click empty space? A click that misses every mark does
   nothing, and it does not clear the selection.
3. Is the mark you clicked interactive? `masque(fig)` skips an
   unsupported plot type with a warning in the notebook log, not an
   error, so its marks do not respond, as with a
   [heatmap or bar plot on a `PolarAxis`](@ref polar-skipped-plots).
   [Recipes masque(fig) extracts](@ref) lists the supported plots.

### Tried a tooltip and saw `[object Object]`

**Cause:** the default tooltip table, or a `$(field)` template, is
showing a payload value that is itself a nested `Dict` or array. The
browser turns that value into the text `[object Object]`.

**Fix:** flatten the field to a scalar (string or number) in Julia
before it goes into `payloads`, or reference a pre-formatted string
field with `masque"$(that_field)"`.

### Tried reading `pick` after a pan or orbit

**Cause:** dragging with `ViewInteractable` changes the view, not the
`@bind` value.

**Fix:** do not use the `@bind` value to track the view. The axis
itself keeps the limits or angles you dragged to, as
[Pan and orbit](@ref) describes.

### Browser console errors

Open the console in the browser's developer tools. A serialization error
there with WGLMakie usually means the installed `WGLMakie` is a release
newer than Masque was tested with. See [Backends](@ref). Report any other
console error as a bug, even when the widget otherwise works.

### Tried WGLMakie and the spinner never stops

**Cause:** the cell displayed a WGLMakie `Figure` rather than a
`masque` widget. WGLMakie's own display draws only after the browser
connects to the Bonito server that WGLMakie starts in the notebook
process, on `localhost:9384` by default. When Pluto runs on another
machine, in a container, or behind a tunnel that forwards only Pluto's
port, the browser cannot reach that address, so the spinner never
stops. A `masque` widget does not use that connection.

**Fix:** return `masque(f)` from the cell that creates the figure, so
that cell shows the interactive figure whether or not you bind it. If
you do bind it, end that cell with `;` so Pluto does not show the
widget twice. For the cell layout, see
[Return the widget from the figure's cell](@ref).
To keep WGLMakie's own display working remotely, forward port 9384 as
well, or point Bonito at an address the browser can reach with
`Bonito.configure_server!`.

### Tried WGLMakie and the canvas is blank

**Cause:** usually the installed `WGLMakie` is a release newer than
Masque was tested with, or the figure has no plot that `masque(fig)`
supports. `masque(fig)` on an empty `Axis3` shows the canvas with
nothing interactive, which is expected.

**Fix:** check that the figure has a plot in it before `masque(fig)`.
If it does, pin `WGLMakie` to an earlier release and file an issue with
the version that failed. For how the canvas updates while you orbit,
see [Backends](@ref).

### A WebGL plot says its GPU context was released

**Cause:** the browser caps how many WebGL contexts a page can keep
(16 on desktop Chrome and Safari, 8 on Android Chrome), so Masque keeps
at most 8. A plot that scrolls out of view releases its context before
the next plot takes one, but when more than 8 plots are on screen at
once, they cannot all be live, and the extra plots show this note.
Hover and `@bind` still work.

**Fix:** scroll so fewer WGLMakie plots are on screen at once, or use
CairoMakie for a plot that is a static picture.
