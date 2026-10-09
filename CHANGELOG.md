# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- A `surface!` on an `Axis3` responds to hover and click. Hovering shows the data point
  under the pointer, its `i`, `j`, `x`, `y`, and `z`, and `value` when `color` is a separate
  matrix, always from the side of the surface you can see. A click binds a `GridCellEvent`,
  so `z[pick]` reads the point. A very fine grid is thinned to about one point every four
  screen pixels, and a `wireframe!` over the same grid is left as decoration. While you
  orbit, the surface's highlight hides and comes back on release. `SurfaceInteractable`
  builds one by hand (#259).
- `text!` on an `Axis3` responds to hover and click, so a label can be picked like the point
  it names. Where labels overlap, the one drawn on top answers: the nearest with
  `backend = :webgl`, and the one listed last with CairoMakie, which draws labels in order. A
  label outside the axis limits isn't drawn and doesn't respond. Its default payload adds the
  anchor's `z` (#292).
- `masque(fig; tooltipstyle = (; bg = :black, color = :white, radius = 6))` sets the tooltip
  card's look in one keyword, like `overlaystyle` does for the overlay. Its keys are `bg`,
  `color`, `accent`, `font`, `font_size`, `radius`, and `caret`; an unknown key, or a value
  of the wrong kind, raises an `ArgumentError` (#305).
- An ROI's `selects` takes the plot it brushes, as in `ROIInteractable(ax; bounds, selects = sc)`,
  so you no longer need to know which scatter became `:scatter_2`. A plot that
  draws both lines and points, such as `scatterlines`, gives the box its points. A layer id
  still works (#302).
- A `ViewInteractable` on an `Axis3` zooms as well as orbits: scroll, or press `+` / `-`,
  to zoom around the middle of the axis box, and Shift+drag, or Shift with an arrow key, to
  pan. As in Makie, the box keeps its size and the limits change, so marks outside the new
  limits are hidden and stop responding to hover and clicks. A line that crosses the edge
  of the box still responds along the part that is drawn (#321).

### Changed
- **Breaking:** `payloads` add to a mark's own data instead of replacing it. A scatter
  point given `(; name = "a")` now has `name`, `x`, and `y` in its tooltip and `@bind`
  value, so labelling points no longer means copying the coordinates into each payload. The
  same goes for every mark with its own data, such as a bar's `low`, `high`, and `value`,
  and for `DataFrame` rows and `Dict`s. A field the payload names itself wins, and `index`
  is not added, since `pick.index` already holds it. A payload that isn't key-value, such
  as a bare string, still replaces the default (#308).

  Two things change in existing notebooks. A default tooltip that showed only your fields
  now also shows the mark's, such as `x` and `y`; to show only yours, pass a `tooltip`
  template that names them. And a payload that passes its own `x` (or `y`) for something
  other than the plotted coordinate, such as a category name, now sits next to the mark's
  other coordinate, and on a line it takes the place of the `x` the hover reads out from
  the nearest point. Rename that field if you want both.
- **Breaking:** a `ThresholdInteractable`, an `ROIInteractable`, or a `ColorbarInteractable`
  you pass to `masque` owns the `@bind` value. Every other layer in that widget keeps its
  hover and tooltip but no longer takes clicks, so `masque(fig, cutoff)` keeps hover on the
  points and the value only ever holds the threshold. Before, a click on a point replaced
  the threshold's value, which is why the docs passed `auto = false`. Code that relied on
  clicking marks in the same widget as one of these controls needs a second `masque` call
  for the marks. The colorbars `masque(fig)` adds by itself still leave the other layers
  clickable. This changes widgets with a selecting box too: the box's target already took
  no clicks, but the other layers kept theirs, and an `AxisInteractable` click replaced the
  selection with an `AxisEvent`. Those layers now only show tooltips (#309).
- **Breaking:** in a widget with one of these controls, `selected=` on another layer only
  highlights its marks. Before, `masque(fig, cutoff; selected = Dict(:scatter => [1]))`
  started the value as that point's `ElementEvent`; now it starts at the threshold (#309).
- **Breaking:** the value starts at the control's starting position instead of `nothing`: a
  threshold at a `ThresholdEvent` at `value`, and a box without `selects` at a `BoundsEvent`
  at `bounds`. `level.value` works from the first run, and code that falls back with
  `isnothing(level) ? 0.5 : level.value` still gets the same number. Code that tests
  `isnothing(level)` to mean "not dragged yet" no longer sees `nothing`. A colorbar still
  starts at `nothing`, since it has no value before the first click (#309).
- **Breaking:** two of these controls in one widget raise an error naming both, since each
  would overwrite the other's value. That includes several boxes that select from the same
  layer, which the Brush a region page used to allow; the last box released replaced the
  others' selection anyway. Pass each to its own `masque` call (#309).
- **Breaking:** a `wireframe!` layer has one element per drawn edge. Makie outlines every
  face, so an edge shared by two faces used to ship twice, and its second copy could never
  be hovered or clicked. Edges keep Makie's drawing order, with a shared edge kept where it
  first appears, so every edge after the first shared one moves to a lower index. Edge `k`
  is `SegmentInteractable(ax, w).vertices[2k-1:2k]`, and half that vector's length is the
  edge count. A `payloads` vector of the old length, or a `selected` index past the new
  count, raises an `ArgumentError`. An in-range `selected` index, or a saved `pick.index`,
  silently points at a different edge, so check those by hand (#316).
- **Breaking:** a box with `selects` starts at what its `bounds` contain, highlighted, instead
  of `nothing`: a `Vector{ElementEvent}` of the points inside, or a `GridWindowEvent` for the
  cells under it. Code that checks `isnothing(picks) || isempty(picks)` still
  runs, but on the first run it now shows the points inside `bounds` instead of its empty case.
  Code that tests `isnothing(picks)` to mean "not released yet" no longer sees `nothing`.
  `selected=` on the target still sets the starting value instead, and `selected=` on another
  layer now only highlights there, where it used to replace the box's value (#330).

### Deprecated
- The keywords `tooltip_bg`, `tooltip_color`, `tooltip_accent`, `tooltip_font`,
  `tooltip_font_size`, `tooltip_radius`, and `tooltip_caret` still work, with a warning naming
  the `tooltipstyle` form, and are removed in 0.4. Their values are now checked like
  `tooltipstyle`'s, so one such as `tooltip_font_size = "12"` raises an `ArgumentError`, and
  passing a key both ways is an error. `tooltip_sigdigits` stays (#305).

### Removed
- **Breaking:** the forms deprecated in 0.2 are gone. Calling one now raises a
  `MethodError` ("no method matching …"), or an `UndefVarError` for `auto_interactables`
  (#299):

  | Removed | Use instead |
  |---|---|
  | `CairoBackend(; max_width)` | `masque(fig; backend = :cairo, max_width)` |
  | `WebGLBackend(; px_per_unit, max_width)` | `masque(fig; backend = :webgl, px_per_unit, max_width)` |
  | `auto_interactables(fig)` and its export | `interactables(fig)` |
  | `RectInteractable(ax, p)` for a heatmap or image | `GridInteractable(ax, p)` |
  | `RectInteractable(ax; grid = …)` | `GridInteractable(ax, xedges, yedges, values)` |
  | `RectInteractable(ax; rects = …)` | `RectInteractable(ax, rects)` |
  | `RegionInteractable(ax; regions = …)` | `RegionInteractable(ax, regions)` |

### Fixed
- A `meshscatter!` sphere on `Axis3` responds to hover and clicks out to its drawn edge, and
  its highlight sits on its outline. Before, its hit circle could fall well inside the
  sphere, so pointing near the edge missed it (#317).

## [0.2.2] - 2026-10-09

### Added
- A CairoMakie widget shown outside Pluto, in Documenter or in an HTML page written with
  `show(io, MIME"text/html"(), w)`, keeps its tooltips and highlights, with nothing to turn
  on. Clicks highlight a mark but set no `@bind` value, and dragging the view needs Pluto. A
  display that blocks scripts still shows the plain figure (#298).

  The page loads the overlay script once from jsDelivr, pinned to the installed Masque
  release and checked against its hash, so each widget adds little beyond its image. Read
  offline, the page shows the plain figures. A Masque checked out with `Pkg.develop` writes
  the script into each widget instead, about 80 KB apiece. An install from a branch or URL
  shows the plain figures; use `Pkg.develop` to try unreleased changes outside Pluto (#298).
- `SliceInteractable([a, b])` builds a slice from plots without naming the axis; `masque`
  puts it on the axis that draws them, and plots on different axes raise an error naming
  both. `SliceInteractable(ax, [a, b])` still works (#306).
- A heatmap or image takes `payloads`, one per cell: a function `(i, j) -> payload` or a
  matrix the same size as the plotted one, passed to `interactables(p; payloads)` or
  `GridInteractable`. The tooltip lists the payload's fields and the cell's value, a
  template can use those fields next to `i`, `j`, and `value`, and a click's
  `GridCellEvent` carries the payload, so `pick.row` reads it. Before, a grid took no
  payloads, and labelling cells meant one `RectInteractable` per cell (#290).
- A plot's layer is named after the plot's own `label`, the text its legend entry shows, so
  `scatter!(ax, xs, ys; label = "wild type")` announces "wild type, element 3 of 10: …" to
  screen readers. Passing `label` to `interactables(plot; …)` or a constructor still names the
  layer, and `label = nothing` leaves the name out. A plot with no `label`, or one written in
  LaTeX or rich text (whose markup a screen reader would read out), announces what it did
  before (#304).

### Fixed
- A slice built from a `lines!` plot (or `stairs`, `series`, `band`, `density`) whose data
  has a NaN in one coordinate, such as a missing `y` value, now samples around the gap the
  way the line is drawn. Before, it raised "series 1 has a non-finite coordinate" (#319).
- `masque` warns once per call about the plots it skips, listing each kind, with a count when
  one repeats. Before, it warned once per skipped plot, so two `Axis3` panels with `text!`
  gave two identical warnings per call (#289).
- Two interactables of the same kind in one `masque` call no longer clash over their
  default id. Two `ViewInteractable(ax)` on two axes become `:view` and `:view_2`, the way
  two scatters become `:scatter` and `:scatter_2`; the same holds for `AxisInteractable`,
  `ColorbarInteractable`, `LegendInteractable`, `ThresholdInteractable`, `ROIInteractable`,
  and every other constructor's default. Before, `masque` raised "two interactables use the
  layer id". Ids you choose are unchanged, and two that match still raise. With two
  `AxisInteractable`s, each panel now reads its own coordinates; before, the first one
  answered over both panels (#287).
- A `scatter!` sized in data units (`markerspace = :data`) no longer stops `masque(fig)`
  from showing the figure. Each marker responds over its drawn shape (a square marker over
  its square, a circle over its circle). Passing `radius` to `interactables(plot; …)` still gives circles of that
  many pixels. More generally, a plot `masque(fig)` can't make interactive is now skipped
  with a warning instead of failing the whole widget (#291).
- Showing a `masque` widget outside Pluto no longer throws an `AssertionError`. A
  `backend = :webgl` widget, which has no image to fall back on, shows a box of the figure's
  size saying it is drawn only in Pluto. Widgets in Pluto are unchanged (#288).
- Two tooltip examples, in the `interactables` docstring and on the constructors page, wrote a
  template field as `{x}`, which a tooltip shows as literal text. They now write `$(x)`.
  Thanks to Jah-yee (#303).

## [0.2.1] - 2026-10-04

### Added
- `scatterlines!` on an `Axis3` responds to hover and click, with the same `:scatterlines`
  (markers) and `:scatterlines_line` (line) layers it gives on a 2D `Axis`. Before, `masque`
  skipped it with a warning (#273).
- `arrows2d!` (and `arrows!` on a 2D `Axis`) responds to hover and click: each arrow is one
  element of an `:arrows2d` layer, hit along the drawn arrow from tail to tip, with payload
  `(; index, x, y, u, v)`. Before, `masque` made no layer for it (#274).
- Hovering a line from `lines!`, `stairs!`, `series!`, or `scatterlines!` shows `x` and `y`
  of the plotted point nearest the pointer along the line, and a tooltip template can name
  `x`, `y`, and `i`, that point's index. Clicks and the `@bind` value still pick the whole
  line. Lines on an `Axis3` are unchanged (#262).

### Fixed
- The 0.2 deprecations now show their warning in Pluto and the REPL. Before, Julia showed
  them only when it ran with `--depwarn=yes`, so a notebook still using `CairoBackend(…)`,
  `auto_interactables`, or a keyword form of `RectInteractable` or `RegionInteractable` got
  no warning before 0.3 removes them (#269).
- After a page reload, the highlighted selection matches the value Pluto restored to the
  `@bind` variable. Before, it showed the `selected=` element while the variable held your
  last click, so the next click could clear the selection instead of making it (#272).
- A slice built from plots replaces the hover of exactly those plots. Before, it guessed
  their layer ids by counting the plots passed to it, so slicing only the second of two
  `lines!` plots took over the first one's hover and left the sliced one's in place. It also
  no longer needs `covers = []` when `auto = false` leaves those plots out of the widget,
  where `masque` used to raise an error. A layer you name in `covers` yourself must still be
  in the call (#271).
- Hovering a `datashader!` pixel shows how many points fell in it. Before, with the default
  `operation`, it showed the histogram-equalized colour value, a number near 1 such as
  `0.99998` (#276).
- An `interactables` method for your own plot type no longer needs an `id` keyword:
  `Masque.interactables(ax, p::MyPlot)` works, and `masque` names the layers it returns after
  the plot. Before, `masque` said it had no default for the plot type. A caller's keyword the
  method does not take, as in `interactables(p; tooltip = …)`, now fails with an error that
  names the plot type and says to add `; kwargs...`, not a bare `MethodError`
  (#270).

## [0.2.0] - 2026-10-03

Some calls written for 0.1 behave differently: each is marked **Breaking** below, and the
categorical and date payloads under Fixed are a change too. The forms listed under Deprecated
still work and are removed in 0.3.

### Changed
- Clicking the selected mark or legend entry again clears the selection, and the `@bind`
  value goes back to `nothing`. Before, a selection could only be replaced by another click.
- **Breaking:** `masque(fig, xs...)` adds to the interactions `masque(fig)` builds instead of
  replacing them, so `masque(fig, ViewInteractable(ax))` keeps every hover and click and adds
  panning. An interactable whose `id` matches a default layer's replaces that layer. To keep
  the old behavior, where only the interactables you pass respond, add `auto = false`:
  `masque(fig, ints; auto = false)`. Two layers with the same id now raise an error.
- **Breaking:** heatmap and image grids are now a `GridInteractable` instead of a
  `RectInteractable`, and `masque(fig)` builds one for each `heatmap!` and `image!`. Build one
  with `GridInteractable(ax, xedges, yedges, values)` or `GridInteractable(ax, p)` for a heatmap
  or image plot. `RectInteractable` is now the list of rectangles only. Code that checks
  `isa RectInteractable` for a heatmap layer needs `GridInteractable`.
- **Breaking:** choose the backend by name, `masque(fig; backend = :cairo)` or
  `backend = :webgl`, and set `max_width` and `px_per_unit` as `masque` keywords, which both
  backends now accept: `px_per_unit = 3` also sharpens a CairoMakie PNG. The
  `CairoBackend(; max_width)` and `WebGLBackend(; px_per_unit, max_width)` objects still work,
  are deprecated, and are removed in 0.3; when a call passes both a backend object
  and `masque`'s `max_width`, the keyword now wins. A third-party `AbstractBackend`'s `_ppu`,
  `context`, and `make_widget` methods take `max_width` as a new last argument.
- `RectInteractable` and `RegionInteractable` take their shapes as the second argument, like
  the other element constructors: `RectInteractable(ax, rects)` and
  `RegionInteractable(ax, regions; payloads)`. `payloads` is now optional for
  `RegionInteractable` and defaults to each region's `index`.
- Where two plots overlap, the one drawn on top now gets the pointer: on each axis, the plot
  created last. A graph's nodes respond over its edges, and points respond over the line or
  shape drawn before them. `interactables(fig)` lists each axis's plots in that order, the
  plot created last first; layer ids are unchanged.
- A legend with no `targets` links to the layers of the `masque` call it is in, including
  layers built with `interactables(plot)` and calls with `auto = false`.

### Added
- `masque(fig; overlaystyle = (; …))` sets the look of highlights, the selection, the
  crosshair, and ROI boxes for one widget: their color, outline widths, fill opacities, and
  the ROI grips. Keys you leave out keep the built-in look. Most keys are also `--masque-*` CSS
  custom properties, which a page can set without Julia. See the Overlay styling section of
  the API page.
- Threshold lines, ROI boxes, and pan and orbit views each get a Tab stop after the plot.
  Arrow keys move the line or the box, or pan or rotate the view; Alt with an arrow resizes an
  ROI box, and `+` / `-` zoom a pan view. The `@bind` value updates once, when the key is
  released.
- `interactables(plot; tooltip, payloads, label, id)` changes one plot's layer without
  rebuilding the rest: `masque(fig, interactables(s; tooltip = masque"…"))`. It keeps the
  layer's id, so `selected=` and legend links still work. `stem!`, `scatterlines!`,
  `boxplot!`, and `annotation!` can be customized this way too.
- `interactables(fig)` and `interactables(ax)` return the interactables `masque(fig)` builds,
  for the whole figure or one axis.
- A recipe can define `Masque.interactables(ax, p::MyPlot; id, kwargs...)`, and `masque(fig)`
  uses it for every plot of that type.
- `AxisInteractable` works on a `PolarAxis`: hovering shows the angle and radius under the
  pointer, and a click returns them as `x` and `y` in the order the axis plots them (angle in
  radians first, unless `theta_as_x = false`). It works in a static export too. Thresholds,
  ROI boxes, slices, and pan views still raise an error on a `PolarAxis`.
- `hexbin!` plots respond: each hexagon is one mark, and hovering shows its center and its
  count (the summed weight when `weights` is given). `PolygonInteractable(ax, p)` builds the
  layer, `:hexbin`, for one hexbin plot.

### Deprecated
- `auto_interactables(fig)`: use `interactables(fig)`. It will be removed in 0.3.
- `RectInteractable(ax; grid = (xedges, yedges, values))` and `RectInteractable(ax, p)` for a
  heatmap or image: use `GridInteractable`. They return a `GridInteractable` until they are
  removed in 0.3.
- `RectInteractable(ax; rects = …)` and `RegionInteractable(ax; regions = …)`: pass the shapes
  positionally, `RectInteractable(ax, rects)` and `RegionInteractable(ax, regions)`. The keyword
  forms will be removed in 0.3.

### Fixed
- The tooltip that follows the pointer (an axis or colorbar readout, a threshold, an ROI, a
  view, a slice) now points at the pointer. Before, its arrow sat about 24 pixels to the side.
- `masque(fig)` no longer fails when a scatter has one marker size per point
  (`scatter!(…; markersize = [10, 20, 30])`, or a GraphMakie `graphplot` with `node_size` or
  `ilabels`). Each point now gets a highlight and click target the size of its own marker.
  `PointInteractable`'s `radius` also takes one value per point.
- `masque(fig)` no longer fails when `poly!` draws shapes instead of point rings: a `Rect2f`,
  a `Circle`, a `Polygon`, a `MultiPolygon`, or a vector of them, and so `tricontourf!` works
  too. Each entry of the vector is one hover and click target, the same element its `color`
  colors, and a polygon's holes are not part of it. A single `MultiPolygon` is one target per
  polygon, since Makie colors each one separately.
- A `band!` drawn with `direction = :y` now responds where it is drawn. Before, its hover and
  click target was the band mirrored across the diagonal.
- `masque(fig)` no longer fails when an `arrows3d!` gives one direction for every arrow
  (`arrows3d!(ax, points, Vec3f(1, 0, 1))`).
- A plot moved by `translate!`, `scale!`, or `rotate!` now responds where it is drawn, and so
  does a scatter drawn with `marker_offset` (pixel or data markerspace) and a `text!` with
  `markerspace = :data`, on linear and scaled axes alike. A `meshscatter!` enlarged by
  `scale!` gets a target of the enlarged size. Before, these targets stayed at the unmoved
  positions and sizes. Tooltips still show the plot's own data values. A rotated plot whose
  targets are rectangles (bars, a heatmap) is skipped with a warning, since its rectangles are
  no longer axis-aligned.
- A plot drawn with `space = :relative`, `:pixel`, or `:clip` is now skipped with a warning, as
  such text already was. Before, its targets were placed as if its positions were data.
- Thick strokes respond over their whole width. A line's hover and click target now covers
  its `linewidth` (it was a fixed 6 px either side), a scatter marker's covers its
  `strokewidth`, bars and polygons respond over their drawn outline, and `errorbars!` and
  `rangebars!` respond on their whiskers.
- On a categorical or date axis, default tooltips and events show the value you plotted:
  `x = "b"` for `Makie.Categorical(["a", "b", "c"])`, `x = "2024-01-02"` for dates. Before,
  they showed Makie's internal number (`2.0`, or milliseconds since the epoch). On those axes
  `x`, `y`, and `z` are now strings, so arithmetic such as `pick.x + 1` no longer works there;
  pass `payloads` to keep numbers of your own.

## [0.1.1] - 2026-10-01

### Changed
- Tooltip numbers show up to four significant figures, so `0.30000000000000004` reads `0.3`.
  This covers the default tooltip, a heatmap cell's value, and a template field with no
  format spec. Whole numbers show in full, and a number too large for four figures (10 000 or
  more) rounds to a whole number (`123456.789` reads `123457`). Axis and colorbar readouts,
  slice samples, and drag labels keep their trailing zeros (`2.500`), so the label does not
  change width as the pointer moves. The `@bind` value is not rounded.

### Added
- `masque(...; tooltip_sigdigits = 4)` sets those significant figures, from 1 to 17.

## [0.1.0] - 2026-09-28

First registered release. It adds hover tooltips and click selection to Makie figures in a
Pluto notebook, and sends the clicked element to the rest of the notebook through `@bind`.
Code written for an earlier development version, installed from the repository, needs 1
added to the `index` in `colors = (; palette, index)`, which is now 1-based like every other
Masque index.

### Added
- `masque(fig)` makes a figure interactive in a Pluto cell, and `@bind pick masque(fig)` binds
  what the reader clicks. It picks up scatters, lines, bars, heatmaps and images, polygons,
  text, legends, and colorbars from the figure. `masque(fig, interactables)` uses the list you
  pass instead.
- Interactables for each kind of mark and gesture: `PointInteractable`,
  `SegmentInteractable`, `RectInteractable` (bars and heatmap or image grids),
  `PolygonInteractable`, `TextInteractable`, `LegendInteractable`, `AxisInteractable` and
  `ColorbarInteractable` (coordinate readouts), `SliceInteractable` (sample series at the
  cursor), `ThresholdInteractable` (a draggable line), `ROIInteractable` (a brush box that can
  select the marks inside it), and `ViewInteractable` (pan and wheel zoom on a 2D axis, orbit
  on an `Axis3`). `RegionInteractable` and `FunctionInteractable` add your own hit regions
  without writing JavaScript.
- Typed `@bind` values. A click on a mark or a legend entry gives an `ElementEvent` or a
  `LegendEvent`, with a 1-based `index` and the Julia object you passed as `payload`, so
  `ev.payload.field` reads it back. A heatmap or image cell gives a `GridCellEvent`, and a
  brushed block of cells a `GridWindowEvent`, both with 1-based cell indices. `AxisEvent`, `ColorbarEvent`,
  `ThresholdEvent`, and `BoundsEvent` carry the coordinates or value you picked.
- Tooltips that show an element's payload, or your own text from a `masque"..."` template.
  They take their light or dark theme from the figure's background.
- `selected=` sets the starting selection, so a second widget can show the element clicked in
  the first.
- Two backends, CairoMakie (a static image) and WGLMakie (a live canvas, for animation, large
  data, and live 3D), with the same overlay and `@bind` values on both. Each is a package
  extension. If both are loaded, `masque` uses CairoMakie unless you pass
  `backend = Base.get_extension(Masque, :MasqueWGLMakieExt).WebGLBackend()`.
- `Axis`, `Axis3`, and `PolarAxis`, with some plot types skipped on the last two. A figure
  that holds an `LScene` is refused.
- Keyboard navigation between elements, and screen-reader announcements for each one.
- Tooltips and highlights keep working in a static HTML export of the notebook.
- User documentation at <https://jowch.github.io/Masque.jl>.

Requires Julia 1.10 or later, Makie 0.24, and CairoMakie 0.15 or WGLMakie 0.13.

[Unreleased]: https://github.com/jowch/Masque.jl/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/jowch/Masque.jl/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/jowch/Masque.jl/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/jowch/Masque.jl/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/jowch/Masque.jl/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jowch/Masque.jl/releases/tag/v0.1.0
