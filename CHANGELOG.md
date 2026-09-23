# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- The cursor follows what the pointer is over. An axis or colorbar readout, a grid cell, and
  empty axis interior stay on the `crosshair` cursor and draw no hairline. A hairline is drawn
  only by a `SliceInteractable` with `crosshair = true`, and only the one arm named by
  `orientation` (`:vertical` or `:horizontal`). It is a quieter grey than the selection edge
  (`#b0b0b0` on a light figure, `#929292` on a dark one), at 80% opacity, with a 1.5px fringe
  in the figure's own background. A discrete mark (points, bars, polygons, segments, lines) and
  a legend entry stay `pointer`, and the hair turns off over them. Threshold, ROI, and view
  keep their drag cursors. A layer named in a slice's `covers` stays `crosshair` and skips
  that layer's highlight; the tooltip is the slice's sample.
- `PointInteractable(ax, points)` takes its highlight radius from the one `Scatter` on that
  axis with the same positions — the marker's drawn extent, same as
  `PointInteractable(ax, scatter)` — instead of a fixed `radius` of 9 that haloed the
  marker. No matching scatter, or more than one, uses Makie's default `:circle` at the
  theme `markersize` (≈0.3525×`markersize`). Pass `radius=` to override. A marker with no
  readable bbox still uses `markersize / 2`. `PointInteractable(ax, scatter)` is the usual
  call; it also resolves the tooltip accent from `color=`.
- Suspending a `:webgl` plot calls `forceContextLoss` before the next plot takes a
  context, so the browser cap is not crossed while the detached canvas is still live.
  A right-click that passes through to the WebGL canvas no longer has its browser menu
  cancelled by WGLMakie's `contextmenu` listener.
- `:webgl` keeps at most 8 live WebGL contexts. A plot outside the viewport is drawn when
  it scrolls into view. Past 8 on screen at once, the extras show a note instead of the
  browser blanking an arbitrary canvas. `:cairo` is unchanged.
- Hovering or focusing a legend entry no longer shows a tooltip. The label is already drawn
  in the row, and the card covered the entries around it. Pass `tooltip = masque"..."` to show
  one (fields: `label`, `group`, `targets`). Omitting `tooltip` and `tooltip = false` both
  leave the card off. A screen reader still announces the entry's label.

### Added
- `SliceInteractable`: hover samples one or more 1-D series at the cursor (piecewise linear in
  data space) and shows those values in the tooltip. `orientation` chooses the sample coordinate
  and the one hair that is drawn. `crosshair = false` keeps the filled dots and the tooltip and
  draws no hair. Dots are the series colour, ringed in the figure background. It does not enter
  hit testing, does not write `@bind`, and is not grown by `masque(fig)`. `Lines`, `Stairs`,
  `Series`, `Band`, and `Density` have a plot constructor.
  A second slice on the same axis, a non-monotonic probe, `Axis3`, `PolarAxis`, a
  non-invertible scale, or a `covers` id that is not `:polygons` or `:lines` fails at
  `masque()` time.
- `:webgl` view gestures stream live frames on the same `with_js_link` channel as `:cairo`.
  Each frame is a freshly serialized scene plus a hit manifest Julia computed for that camera,
  swapped onto the canvas the cell already holds — no new WebGL context, no cell re-run.
  `ViewInteractable` still commits nothing. In-drag frames render at `px_per_unit = 1` and the
  release frame restores the widget's own resolution, same as `:cairo`.
- Selection is client-side, and `selected=` is its starting value. Clicking a mark selects it
  in the browser immediately — no bond fed back into the widget, and it works in a static
  export, where no kernel exists to fire one. `selected=` seeds the selection rather than
  drawing a separate pre-highlight: a widget given one reports those elements from its
  `@bind` at mount instead of `nothing`, and the next click or `selects`-ROI release replaces
  the whole selection, hydration included. A remount re-seeds from `selected=` again, since an
  index only means something relative to the data that produced it. Clicking a heatmap or
  image cell selects that cell (even though `selected=` itself does not accept a `:grid`
  layer), and clicking a legend entry selects the whole series it links to. Together this
  retires the five-cell `Ref`-accumulator workaround the Selection page used to document for
  keeping a clicked element highlighted; `examples/demo.jl`'s accumulator remains the way to
  build up a *growing* set across many clicks, which a single selection is not for.
- `LegendInteractable`: a `Makie.Legend` block's entries as hit regions. Auto-extracted
  `masque(fig)` legends link each entry to the plot layer(s) it labels (including a compound
  recipe's — e.g. `scatterlines!`/`stem!` — child layers); hovering or keyboard-focusing an
  entry highlights its linked layer(s), and a click's `@bind` payload carries `(; label,
  group, targets)`. Custom legends resolve links via `plots=` (Makie's own kwarg) or an
  explicit `targets=` (a label-keyed `Dict` or one-per-entry `Vector`). New optional
  `HitLayer.links` field for cross-layer highlight targets.
- Tooltip placement is now anchored to the hovered mark instead of the cursor, for
  `circles`/`rects`/`segments`/`polyline`/`polygons`/`grid`: the box is centred above the
  mark's top edge with a 10px gap and the caret points at the anchor (mark centre for
  circles, top-centre for rects/bars, nearest point on the line for segments — the tooltip
  slides along it as the pointer moves — centroid for polygons when it's inside the shape,
  cell centre for grid). It flips below the mark when it would clip the surface's top edge,
  and shifts inside the surface (moving the caret via `--masque-caret-x`) when it would clip a
  side. Keyboard focus uses the same placement. `axis`/`threshold`/`roi`/`view` (no discrete
  mark) keep the previous cursor-relative placement. An ROI resizes from a corner grip or from
  the middle of a side (no drawn side grip; that hit still resizes only that one edge), with
  directional resize cursors (`nwse-resize`/`nesw-resize`/`ns-resize`/`ew-resize`/`move`) on
  hover, and hovering a threshold line thickens its stroke.
- The tooltip's light/dark theme now follows the figure's own background colour (CSS
  relative-colour syntax), not just the OS/browser `prefers-color-scheme` — a dark figure on
  a light Pluto page gets a dark tooltip, and vice versa. Browsers without relative-colour
  support fall back to the previous behaviour (static light, OS-driven dark) automatically.
  Element colour also now drives a 3px tooltip accent border (the tooltip text itself stays
  neutral) when Masque can resolve it — currently a `scatter!` plot's `color=`, uniform or
  colormapped/categorical; omitted (a plain 1px border) when it can't.
- Keyboard navigation for the overlay: arrow keys/Home/End move between hittable elements
  (Page Up/Down jump between layers), Enter/Space dispatches the same `@bind` value a click
  would, Escape clears focus. Screen readers get a live-region announcement per element
  (position, and the tooltip content as plain text) via a new `role="application"` +
  `aria-live` overlay structure. New optional `label` keyword on `PointInteractable`/
  `SegmentInteractable`/`RectInteractable`/`PolygonInteractable` sets the per-layer
  announcement prefix. New docs page:
  [Keyboard and screen readers](https://jowch.github.io/Masque.jl/dev/accessibility/).
- Vitest coverage for `frontend/src` uploads to Codecov (`flags: frontend`).
  Committed `assets/` bundles are ignored. One blended `codecov/project`
  number (Julia + `frontend/src`); `target: auto`, `threshold: 1%`.
- A [Documenter](https://documenter.juliadocs.org) user site at
  [jowch.github.io/Masque.jl](https://jowch.github.io/Masque.jl), built from `docs/src/`:
  Home, Getting started, Interactables, Selection, Tooltips, Custom interactions, Backends,
  Troubleshooting, Examples, API Reference, and a Development page. Deployed by
  `.github/workflows/Documentation.yml`.

- `masque(fig, interactables)` — a Pluto `@bind` widget that overlays interactivity on a
  static CairoMakie figure; its bond reports the current selection — an `InteractionEvent`
  for a click, a `Vector{InteractionEvent}` for `selected=` hydration or a `selects`-ROI, and
  `nothing` when nothing is selected.
- `AbstractBackend` seam with `CairoBackend` (PNG; SVG groundwork). DPI derived from the
  display width (≈2× Pluto's 700px column), opaque-background guarantee.
- `AbstractInteractable` interface (`hitlayers` / `validate` / `events` / `tooltip` /
  `hoverstyle`) and built-ins: `PointInteractable`, `SegmentInteractable`,
  `RectInteractable` (list + compact grid), `PolygonInteractable`, `AxisInteractable`.
- Custom-interaction paths with no JavaScript: `RegionInteractable` (declarative regions)
  and `FunctionInteractable` (closure).
- Categorical, log, and multi-axis support; payload-based linked selection.
- TypeScript browser overlay (shadow-root, hit-testing, highlights, tooltips), bundled to
  a committed `assets/overlay.js`; manifest shipped via `published_to_js` (survives static
  HTML export); typed bond value via `AbstractPlutoDingetjes.Bonds.transform_value`.
- `WebGLBackend` (`:webgl`) — a second, co-equal `AbstractBackend`: the figure renders live in
  a browser WGLMakie `<canvas>` (client GPU) with the same overlay/`@bind` contract, making
  animation, large/live data, and live 3D cheap where `:cairo` would re-rasterize —
  a substrate/cost difference; the interaction contract is identical on both. `CairoMakie`/`WGLMakie` are both weak
  dependencies gated behind package extensions; `masque(fig)` resolves whichever one is loaded
  (errors if neither is). If both are loaded, `backend=` wins and implicit `masque` defaults to
  Cairo. See the site's Backends page and `docs/dev/backend-comparison.md`.
- View manipulation via `@bind` re-render: 2D `limits` zoom/pan, 3D `azimuth`/`elevation`
  rotation, and selection persistence across view re-renders (`selected=` feedback).
  Sliders need no Masque API; **drag-to-pan / drag-to-rotate** use `ViewInteractable`
  (commit-on-release; Shift+drag arbitrates vs box-select/ROI). Demonstrated in
  `examples/view_manip.jl` (CI-run); live-verified on `:cairo` and `:webgl`.
  Live drag *preview* (high-frequency redraw) remains deferred with animation.
- `Arrows3D` auto-extraction on `Axis3`: `SegmentInteractable(:pairs)` from processed
  `startpoints`/`endpoints` (DATA space), with `{index,x,y,z,u,v,w}` payloads. Raw
  `pos→pos+dir` is intentionally not used — it misses under `lengthscale`/`align` and the
  MeshScatter children live in float32convert space (premise from #36).

### Changed
- Highlight edges and control chrome are a flat grey, and ROI grips are small transform
  handles. The color-dodge fill (`#141414` on `svg.masque-fill`) is unchanged. The edge
  stroke no longer uses `multiply` on a light figure or `screen` on a dark one:
  `svg.masque-edge` stays so the stroke paints above the fill, and it draws one chrome grey
  (`#7a7a7a` light, `#c8c8c8` dark) at 1.5px on hover and 2px when selected. The ROI
  outline, the threshold line, and the selected-open ring use that same grey instead of
  tooltip-text ink. An ROI draws four corner handles, each a 7 CSS px white square with a
  ~1.5 CSS px corner radius and a 1px chrome stroke. The sides have no grip; grabbing the
  middle of a side still resizes that edge. The hit target is still the manifest `handle`.
  An explicit `hoverstyle` stroke is still verbatim and unblended. A browser without
  `mix-blend-mode` draws the fill as that chrome grey at 0.18 opacity; the edge stroke stays
  the flat grey.
- The first pan or orbit compiles after the plot is on the page. `show` writes the mount
  image, then a few discarded frames warm the view callback, and the camera is put back.
  A drag that arrives during that warmup waits for it. Re-running the cell waits until the
  in-flight frame has restored the camera before the next `masque` on that figure.
- **`lines!`, `stairs!`, and a `scatterlines!` line are one element: the whole path.**
  A click anywhere along the line (within `tol` of an edge) binds that one line. The
  JavaScript wire index stays 0-based (`0` for a single line); the Julia
  `ElementEvent.index` is 1-based (`1`), the same as every other element kind. Hover
  and the selected ring trace the whole polyline. A `NaN` gap stays a gap inside that
  one line and does not split the plot into several interactables. `series!` is one
  `:lines` layer with one element per series: a click on the second series is wire
  index `1` and Julia index `2`, and the default payload is `(; index, label)` when
  Makie labeled that series (the default labels are `"series 1"`, `"series 2"`, …).
  `selected=` follows the same meaning — `Dict(:lines => [1])` selects the whole line,
  not its first edge. This breaks anyone who read a `lines!` `@bind` index or a
  `selected=` index as "which edge". The raw
  `SegmentInteractable(ax, vertices; mode = :polyline)` constructor stays per-segment
  (`segment_index`); pass `unit = :line` for the whole path. `unit = :line` with any
  other `mode` throws `ArgumentError`. `mode = :pairs` is unchanged, so
  `LineSegments`, Errorbars, Rangebars, HLines, VLines, Wireframe, and Arrows3D stay
  one element per piece. Auto-extracted `series!` legend entries pin `series:k` (element
  `k` of the parent `:lines` layer) so a swatch hover lights that one series; a bare
  `targets = :series` still highlights every series. `HitLayer.links` accepts that
  `id:k` pin (1-based) as well as a layer id.
- **There is one way to read a `@bind` payload now: `ev.payload.field`, for every
  interactable kind.** An element hit's payload is the exact Julia object you passed, looked
  back up in Julia rather than decoded from the browser — `payloads = [(a = 1,)]` yields
  `(a = 1,)` back from a click, `ev.payload === payloads[i]`, so a `NamedTuple` stays a
  `NamedTuple`. This applies to every click on an element kind (`circles`/`rects`/`polygons`/
  `segments`/`polyline`), not only to widgets using `selected=`, and it means the element
  hit's payload is no longer part of the upload at all — `layer` + `index` are already enough
  for Julia to recover it, so a click, a `selected=` hydration, and a `selects`-ROI item no
  longer carry one on the wire. An out-of-range index now raises `ArgumentError` rather than
  passing through.

  Kinds with no Julia-side original — an `:axis` readout, a `:grid` cell, `:roi` bounds, and
  `:view` limits, all drag/cursor state only the browser computed — are converted to a flat
  `NamedTuple` too, so `ev.payload.x` works there as well instead of the old
  `ev.payload["x"]`. `ThresholdInteractable` is the one exception: its payload is a bare
  scalar, since there's no field to name. `examples/demo.jl`'s `:axis` cell and
  `docs/dev/perf-findings.md`'s `:view` reconstruction move with this.
- **Renamed the package from `Holo` to `Masque`** (same UUID). Every public name moves with
  it: the module `Masque`, the entry function `masque`, the `masque"…"` string macro, the
  `MasqueCairoMakieExt` / `MasqueWGLMakieExt` extensions, the `window.Masque` browser global,
  the `masque-enter` / `masque-leave` DOM events, the `masque-*` CSS classes and `--masque-*`
  custom properties, the `MASQUE_*` environment variables, and the `assets/masque-webgl.js`
  bundle. Replace `using Holo` with `using Masque` and `holo(` with `masque(`.
- README slimmed from ~410 to ~65 lines (title, pitch, when-to-use-it table, install, quick
  start, a pointer to the new site) — everything else it used to cover now lives on the site.
- Maintainer/design docs moved from `docs/` to `docs/dev/` (`architecture.md`,
  `perf-findings.md`, `roadmap.md`, `backend-comparison.md`, `live-interaction-checklist.md`,
  `frontend-delivery.md`); `docs/README.md` is now a short index pointing at
  the site and at `docs/dev/`.
- `hoverstyle(::AbstractInteractable, ::Int)` narrowed to `hoverstyle(::AbstractInteractable)`
  — the manifest ships one hover style per layer, not per element; the old per-element
  signature implied styling that was never actually per-element.
- Browser TypeScript lives in one `frontend/` package with two modules: the
  shared overlay IIFE (`assets/overlay.js`) and the `:webgl` ESM shim
  (`assets/masque-webgl.js`, source `frontend/src/wgl-shim.ts`). The old
  `frontend-webgl/` package and its CI job are gone.
- `SegmentInteractable`'s `tol` keyword now controls the actual hit-test slack (see Fixed,
  below). The **effective default hit slack changes**: it was a fixed 8 image px (the
  overlay's `SEG_TOL`, ignoring `tol` entirely); it is now `tol`'s default of 6 *logical* px,
  scaled to the rendered image's DPI like `PointInteractable`'s `radius` — e.g. at the common
  2× DPI, 12 image px instead of 8. Pass `tol = 8 / scaling` to keep the old numeric slack, or
  rely on the new default (slightly more forgiving at typical DPI).
- The hover/selection outline now hugs the mark's own edge and draws a SPLIT blend highlight —
  a brightening fill plus a darkening stroke — instead of a single fixed steel-teal ring 2px
  outside it: a `color-dodge` fill (`#141414` source; measured across a 10-colour palette as the
  only fill candidate that never rotated hue more than 8° and never dimmed a mark) plus a
  `multiply`/`screen` (light/dark figure) edge stroke in fixed greys derived from the figure
  background. A single darkening layer alone made a highlighted mark read muddy on a light
  figure, which is why the highlight split into two; `colors` still doesn't feed either layer,
  only the tooltip's accent border (unchanged). The overlay now mounts THREE sibling top-level
  svgs instead of two: `svg.masque-fill` (`color-dodge`) and `svg.masque-edge`
  (`multiply`/`screen`) each draw one identical-geometry half of a closed mark's highlight;
  `svg.masque-plain` (unblended, was already there) holds ROI/threshold, the selected-seg ring,
  and an explicit `hoverstyle`'s highlight, unchanged. Firefox only honours `mix-blend-mode` on
  a top-level svg, not nested SVG content, which is why each blend mode is its own sibling svg.
  A browser without `mix-blend-mode` falls back to the plain neutral ink instead (fill layer at
  0.18 opacity, edge layer as the plain ink stroke). A circle highlight's `r` still equals the
  geometry `r` exactly (no `r + 2` halo) on both shapes. An open shape (lines/segments) draws
  the edge shape only — no fill shape, since a line has no interior; a `selects`-ROI's grid
  cell-block union rect (`"rectfill"`) draws the fill shape only, since the ROI box is already
  its outline. Because the fill is identical between hover and selected states, the edge
  stroke's width (1.5px hover, 2px selected, both fill-opacity/stroke as before) is what
  actually distinguishes them — and **hovering a mark that is already selected now draws no
  highlight at all** (both layers are already opaque from the selected wash; a 1.5px hover
  stroke over the 2px selected stroke would read as weaker, not stronger). The tooltip and
  `@bind` still fire on that hit; only the highlight is skipped. `hoverstyle`'s default `stroke`
  stays `nothing` (the overlay draws the split highlight) instead of the fixed `"#3A6F7C"`; an
  explicit `stroke` still overrides it verbatim, unblended, in `svg.masque-plain`, and the
  manifest still omits `style.stroke` unless an interactable sets one.
- `PointInteractable(ax, ::Makie.Scatter)` now derives the circle radius from the marker's
  drawn extent (≈0.35·`markersize` for the default `:circle`) instead of `markersize / 2`,
  so highlights sit flush on the marker; the overlay's own 4px hit slack keeps clicking as
  forgiving as before.

- Overlay hover skips rewriting tooltip HTML and remeasuring tip size on
  same-hit `mousemove`; extra pointer ticks coalesce to one animation frame.
  The 100 ms fade and locked wash / ring recipes are unchanged.
- Agent live-verify playbook (`docs/dev/live-interaction-checklist.md`) now requires
  **visual** fidelity as well as interaction: wash / ring / halo / overlay-pin,
  remount fade (no pulse), Pluto/OS `prefers-color-scheme` (no notebook toggle),
  and steel-teal `#3A6F7C` not `#ff3b30`. Agents run `kind_sweep.mjs` **and**
  `polish_verify.mjs` on Cairo and WGL across the interactable kinds.
- Overlay chrome uses the locked inspector ink `#3A6F7C` (JS fallback + Julia
  `hoverstyle` default) instead of iOS-alert red `#ff3b30`. Hover is stroke-only;
  selected closed geometry gets a wash fill; selected open kinds (segments /
  polylines) get a two-stroke ring. Tip show/hide and highlight mount fade in
  100 ms on state change (not remounted on every pointer frame) and honor
  `prefers-reduced-motion`. The tooltip card is edge-clamped
  with caret flip. Tooltip dark follows `prefers-color-scheme` (official Pluto's
  theme signal; there is no notebook toggle). `selected=` now accepts `segments`
  / `polyline` so the ring recipe is reachable; `grid` / `axis` / … still fail
  loud.

- Cloud sysimage bake is CairoMakie (+ Makie, Pluto, Masque workload) only — WGLMakie is
  not preloaded. Default `julia` still uses `-J` that image; `JULIA_NOSYSIMAGE=1` is the
  stock/WGL live-verify escape hatch.
- `_resolve_backend` no longer throws when both backends are loaded: honor `backend=` or
  default to Cairo. Still throws when no backend is loaded.

### Removed
- `docs/dev/releasing.md` — the release mechanics are the Release row of
  `docs/dev/frontend-delivery.md`; `docs/dev/roadmap.md` was rewritten as a list of open
  work, non-goals, and order, without milestone numbers or per-item history.
- `docs/design.md`, `docs/research-findings.md`, `docs/survey-makie-surfaces.md` — superseded
  by `docs/dev/architecture.md`/`docs/dev/roadmap.md` (kept in git history). `docs/tooltips.md`
  — its internals moved into `docs/dev/architecture.md` §10, its user-facing half into the
  site's Tooltips page.
- Dead `vector`/`mount` scaffolding: `CairoBackend(; vector=false)` and the
  `AbstractBackend` `mount` interface function (plus `WebGLBackend`'s `mount = :webgl`
  method) had zero callers — `Masque.render` always rasterizes to PNG, and `Base.show`
  hardcodes a PNG `<img>`. SVG output remains a roadmap item to build from scratch
  (`docs/dev/roadmap.md`), not groundwork already in place.

### Fixed
- Right-click and Mac ctrl-click reach the Cairo base image, so the browser's own image menu
  appears. A Mac ctrl-click leaves `@bind` unchanged.
- A `selects`-ROI over a `:grid` target (e.g. the gallery `image_widget` recipe:
  `RectInteractable(; grid=...)` + `ROIInteractable(; selects=...)`) no longer draws its own
  stroke on the enclosed cell-block rect: that rect sat beside the ROI's own outline and read
  as two overlapping boxes with parallel edges. The cell-block rect is now fill-only (a
  distinct `"rectfill"` geom tag in the overlay, vs. `"rect"`); a `selected=` pre-highlight or
  a `selects`-ROI targeting `circles` keeps its stroke — only the grid cell-block union rect
  changed.
- `SegmentInteractable`'s `tol` keyword (lines/polylines/segments hit-test slack) is now
  wired through end-to-end: it ships in the manifest as a per-`:segments`/`:polyline`-layer
  `"tol"` field (image px), and the overlay's hit test reads it instead of always using its
  own fixed `SEG_TOL`. Previously `tol` was accepted and stored but never read anywhere. Now
  that it feeds a manifest field, `tol` is validated at construction (`ArgumentError` unless
  finite and positive) instead of raising a raw `InexactError` from `round(Int, …)` (`Inf`/
  `NaN`) or silently shipping an unhittable layer (`tol <= 0`).
- `RectInteractable(ax; rects=…, grid=…)` now raises `ArgumentError` at construction when
  both `rects` and `grid` are given, or neither is — previously `grid` silently won if both
  were passed, and passing neither surfaced a raw error later instead of a clear one.
- `SegmentInteractable(...; mode=...)` now validates `mode` at construction
  (`ArgumentError` for anything but `:polyline`/`:pairs`) instead of silently treating any
  other symbol as `:pairs`.
- `RectInteractable(ax; grid=(xedges, yedges, values))` now validates `values` has shape
  `(length(xedges)-1, length(yedges)-1)` at construction, instead of surfacing a raw
  `BoundsError` inside `hitlayers`. A non-`Matrix` `values` (e.g. `nothing` or a vector)
  now raises the same `ArgumentError` instead of a bare `MethodError` from `size`.
- `RectInteractable(ax; grid=…)` now validates `xedges`/`yedges` are monotonic at
  construction, and raises `ArgumentError` from `hitlayers` if they project to a non-finite
  pixel coordinate (e.g. a log-scale axis with a non-positive bin edge). Previously such a
  grid shipped a `NaN` edge to the client and degraded silently (old: always a miss); now it
  fails loud at build time instead of relying on the client to treat it as out-of-range.
- `tooltip = true` (never meaningful) now fails at interactable construction, with the
  same error message as before, instead of only failing later at manifest build.
- `masque(fig, interactables)` finalizes the figure only after the caller has already built
  `interactables` — unlike `masque(fig)`, which finalizes first. `SegmentInteractable`/
  `RectInteractable` built from `HLines`/`VLines`/`HSpan`/`VSpan` plot objects could bake
  stale `ax.finallimits[]` into the span geometry if constructed before the figure was
  finalized. They now defer that axis-limits read to `hitlayers` time (resolved fresh
  against the finalized axis), matching `TextInteractable`'s existing
  construction-vs-hitlayers split for layout-dependent reads.
- `:webgl`'s no-server Bonito shim (`frontend/src/wgl-shim.ts`) now provides
  `Connection.send_warning`, which WGLMakie's bundled JS calls from its shader-compile-error
  path (`on_shader_error`). Previously this threw `TypeError: Bonito.Connection.send_warning
  is not a function` on top of the shader error it was trying to report.
- Anchored tooltip caret was 2px off the mark when the per-element accent border was shown.

- `selected=` now fails loud at `build_manifest` (and at overlay mount) for unsupported
  layer kinds (`segments`/`grid`/…) and out-of-range indices — same doctrine as wrong-length
  `payloads=` (`_check_payloads`). Pre-highlight remains supported for `circles`/`rects`/
  `polygons`. Mount-time `selected=` sharing `g.sel` with box-select is covered by a unit
  test (ROI commit replaces pre-highlights — one selection at a time). Closes #39.
- `selected=` pre-highlights are now genuinely persistent: they draw into the overlay's
  persistent selection group instead of the transient hover group, so they survive hovers and
  all selected indices render (previously the first hover erased them and only the last index
  showed — an M1.2 leftover from before box-select introduced the persistent group).

### Internal
- Hardened the `WGLMakie bind E2E (Pluto)` CI job (`test/e2e/bind_click.mjs`) against the
  load-induced timeout seen on PRs #57/#60/#61/#65/#66: the overlay always emitted the click
  correctly, but Pluto's kernel round-trip (`#bondout` flipping) stalled past the wait budget.
  The per-attempt wait is now 5 minutes (was 3), a stalled first attempt retries once by
  clicking a *different* scatter marker (a same-value re-click can't distinguish "kernel got it
  and is slow" from "kernel never got it" — CI evidence showed the old same-value `input`
  re-fire never once recovered the bond), and a timeout now reports whether any cell went busy
  after the click. `test/e2e/serve.jl` flushes `stdout`/`stderr` every second so `pluto.log` is a
  trustworthy artifact instead of a buffered dump. CI now uploads a screenshot, DOM dump, and the
  Pluto log on failure (`actions/upload-artifact`, `if: failure()`).
- CI runs the live kind sweep (`test/e2e/kind_sweep.mjs` + `test/e2e/polish_verify.mjs`
  against `kind_sweep_cairo.jl`/`kind_sweep_webgl.jl`) on a new `kind-sweep` job,
  `continue-on-error: true` (advisory — does not block merges), matrixed over `cairo` and
  `webgl`, with screenshot/DOM/console-log artifacts on failure. Agents still run the sweep
  locally before calling a user-facing change done; see `docs/dev/live-interaction-checklist.md`.
- `frontend/build.mjs` now sets esbuild's `mangleProps: /_$/`, shortening the frontend-internal
  property names PR #72's `overlay.ts` split introduced (`OverlayState`/`OverlayCtx`/`ROIBox`/
  `Drag`/`FocusRef`, plus `Hit`'s `geom`/`grid`/`axis`/`roiPart`) — every such field now ends in
  a trailing underscore by convention. No property that crosses the Julia/Pluto/DOM boundary
  (manifest, `@bind` payload, WGLMakie's `__obs__`/`__t__` wire tags) was renamed. See
  `docs/dev/frontend-delivery.md`'s Bundle row and `docs/dev/perf-findings.md` for the measured
  byte delta. No observable behavior change.

- Every non-public Makie/WGLMakie/Bonito internal Masque relies on (`converted`, child
  `plots`, `finallimits`, scene `viewport`, Contourf's `computed_levels`, a Colorbar's
  `computedbbox`, `string_boundingboxes`, `transform_func`/`apply_transform`/`project`,
  `update_state_before_display!`, and the WGL-only screen/serialization internals) now
  goes through one small fail-loud accessor in `src/makie_compat.jl` (WGL-only internals
  route through an equivalent block in `ext/MasqueWGLMakieExt.jl`). A future Makie/WGLMakie
  bump that moves one of these surfaces now fails with one clear message at the accessor,
  not scattered wrong-pixel/`MethodError` symptoms across the codebase. Added a canary
  testset (`test/makie_compat_tests.jl`, first in the Core group) asserting each
  accessor's actual return shape, including that a moved/renamed internal produces the
  compat error rather than a raw exception. A CompatHelper workflow (so Makie/CairoMakie/
  WGLMakie compat bumps arrive as PRs that run this canary automatically) is planned as a
  follow-up — not part of this change. Pure internal
  refactor — no manifest/payload/behavior change (parity goldens pass unchanged).
- Added a shim-completeness canary (`test/webgl_ext_tests.jl`) that reads the installed
  WGLMakie bundle, extracts every `Bonito.*`/`Connection.*` symbol it references, and
  asserts the shim provides all of them — guarding against a future WGLMakie bump adding
  another global the shim doesn't (as `send_warning`, above, did).
- `frontend/src/geometry.ts`'s `findBin` (heatmap/image `:grid` cell lookup) replaced its linear
  scan over the edge array with a binary search — O(log n) instead of O(n), and `findBin` runs
  twice per hover on every `:grid` layer. Identical output to the old linear scan over finite,
  monotonic edges (asc/desc, duplicate/zero-width bins, out-of-range, on-edge ties) — the
  precondition `RectInteractable` now enforces (see the `Fixed` entry below) — pinned by a
  property test comparing the two implementations over 500 randomized edge/point trials
  (`frontend/test/geometry.test.ts`); a NaN edge outside that precondition is a documented
  defense-in-depth fallback, not a second equivalence guarantee. Added
  `frontend/bench/hit_test.bench.ts` (`npm run bench`, committed) to directly measure `hitTest`
  latency, split into mixed (realistic hit-rate) and guaranteed-miss (worst case) queries at N up
  to 200 000 elements — see `docs/dev/perf-findings.md`'s "JS hit-test microbenchmark". Pure
  internal change — no manifest/payload/behavior change.
- `test/core_tests.jl` (1,985 lines, one `@testset "Masque"` with ~53 nested testsets) split
  by concern into `test/core/backend_tests.jl`, `axis3_polar_tests.jl`,
  `interactables_tests.jl`, `drag_tests.jl`, `introspect_tests.jl`, `markup_tests.jl`,
  `selection_tests.jl`, and `parity_tests.jl`; `test/core_tests.jl` is now a thin includer
  (canary → the eight files → parity → docstrings). Shared fixtures moved to
  `test/testutils.jl` (`ctx_for`, `drawn_near`, `default_fixture`); every testset that used
  to read the outer testset's bare `fig`/`ax`/`ctx` (each nested `@testset` wraps its body in
  a `let`, and since those names already existed as locals of the *outer* `@testset "Masque"`'s
  own `let`, a nested `fig = Figure(...)` reassigned that enclosing local instead of shadowing
  it — so a testset that only read `fig`/`ax`/`ctx` silently got whatever a previous,
  unrelated testset last left behind) now builds its own fixture. Pure test refactor — no
  manifest/payload/behavior change; verified pass counts are in the PR, not restated here.

### Notes
- Every overlay interaction path is now exercised live in a real Pluto + browser on **every
  supported backend** (today `:cairo` and `:webgl`): the `:cairo` gallery (`examples/demo.jl`)
  plus per-feature live-verifies, and a `:webgl` sweep (`test/e2e/webgl_sweep.mjs`, local tool)
  driving `examples/webgl_demo.jl`'s kitchen-sink section — template tooltips, grid `(i,j)=value`
  readout, colorbar 1-D value, polygon/region/text clicks, threshold drag, whole-axis readout,
  `selected=` pre-highlight, and `selects`-ROI box-select, all against the live canvas (12 paths,
  zero divergences).
- `Axis3` parity (WS-3D core): 3D `Scatter`/`Lines` get the same point/segment overlays with
  `{index, x, y, z}` payloads on **both** backends — static base on `:cairo`, live on `:webgl` —
  projected at build time through the shared closure (`is3d` axis transforms ship degenerate
  lims; `Axis`/`Threshold`/`ROI` interactables fail loud on a 3D axis, where a screen pixel is a
  ray). `MeshScatter` (depth-correct per-element hit radii from its data-space `markersize`, via
  the new `PointInteractable` `radius3d=` option) and `Wireframe` (rendered edge segments from
  its child) are auto-extracted too; `Arrows3D` emits start→end segments from processed
  `startpoints`/`endpoints` (not raw `pos→pos+dir` — that misses under `lengthscale`/`align`).
  `Surface` remains roadmap scope.
- `PolarAxis` discrete overlay parity: Scatter/Lines(/LineSegments/ScatterLines) hit geometry on
  both backends via the shared projection (`Makie.Polar` in `transform_func`); `ispolar`
  transforms ship degenerate lims so continuous θ/r consumers fail loud until the polar
  transform is serialized to JS. Separable-grid/rect recipes on polar warn-and-skip.
- Current `:cairo` scoping: `LScene` is rejected at `masque()` time — a Masque guard, not a
  CairoMakie limit (`LScene` disposition remains a roadmap decision item). High-frequency live
  redraw is a shared cost limit on both backends.

[Unreleased]: https://github.com/jowch/Masque.jl/commits/main
