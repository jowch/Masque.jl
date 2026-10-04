# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `scatterlines!` on an `Axis3` responds to hover and click, with the same `:scatterlines`
  (markers) and `:scatterlines_line` (line) layers it gives on a 2D `Axis`. Before, `masque`
  skipped it with a warning.

### Fixed
- The 0.2 deprecations now show their warning in Pluto and the REPL. Before, Julia showed
  them only when it ran with `--depwarn=yes`, so a notebook still using `CairoBackend(…)`,
  `auto_interactables`, or a keyword form of `RectInteractable` or `RegionInteractable` got
  no warning before 0.3 removes them.
- After a page reload, the highlighted selection matches the value Pluto restored to the
  `@bind` variable. Before, it showed the `selected=` element while the variable held your
  last click, so the next click could clear the selection instead of making it (#272).
- A slice built from plots replaces the hover of exactly those plots. Before, it guessed
  their layer ids by counting the plots passed to it, so slicing only the second of two
  `lines!` plots took over the first one's hover and left the sliced one's in place. It also
  no longer needs `covers = []` when `auto = false` leaves those plots out of the widget,
  where `masque` used to raise an error. A layer you name in `covers` yourself must still be
  in the call.
- An `interactables` method for your own plot type no longer needs an `id` keyword:
  `Masque.interactables(ax, p::MyPlot)` works, and `masque` names the layers it returns after
  the plot. Before, `masque` said it had no default for the plot type. A caller's keyword the
  method does not take, as in `interactables(p; tooltip = …)`, now fails with an error that
  names the plot type and says to add `; kwargs...`, not a bare `MethodError`.

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

[Unreleased]: https://github.com/jowch/Masque.jl/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/jowch/Masque.jl/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/jowch/Masque.jl/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jowch/Masque.jl/releases/tag/v0.1.0
