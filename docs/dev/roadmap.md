# Masque.jl — Roadmap

What is open, why, and in what order. The design contract is `architecture.md`; build and
delivery decisions are in `frontend-delivery.md`; every size and latency figure lives in
`perf-findings.md`. Priorities, not promises: reorder by demand. `#nn` is a GitHub issue or
PR on `jowch/Masque.jl`.

**How this file stays true.** When an item has an issue, the issue holds the design, the
acceptance criteria, and the discussion. This file holds only the item's priority, what it
depends on, and a line on why it matters. Design prose lives here only for an item that has no
issue yet. A pull request that closes an issue named here deletes or rewrites that line in the
same change. The previous revision of this file drifted because it restated issue designs:
six of the items it listed as open had already closed.

## Principles

- **Explicit declaration is the contract; introspection is sugar** on top of it.
- **The frontend is a stateless view. *Authoritative* state lives in Julia via `@bind`**, as
  a value the notebook's own analysis depends on. A value the notebook never reads, such as a
  mid-drag camera or hover chrome, is not authoritative and does not go through `@bind`. The
  four questions below sharpen this principle; they are not an exception to it.
- **No parallel server.** Inspection survives static export; clicks need a kernel.
- **Fail loud, never silently wrong** (per-capability `validate`). A valid input that throws
  deep in the stack is a bug, not a loud failure: the error has to name what the user did.
- **Backends differ in cost, never in the interaction contract.** No feature ships on one
  backend that the other can never have (parity goldens in `test/fixtures/parity/`).
- **YAGNI.** Build a surface or feature when a real use pulls for it.
- **Live-verify on every backend** (`live-interaction-checklist.md`) before a user-facing
  change is called done. Interaction and visual, across the interactable kinds.

**Where a value lives: four questions, in order.** Can the browser answer it alone from what
the manifest already ships (→ overlay-local, no channel and no Julia round trip: an in-drag ROI
box or threshold line)? Does the notebook need this value (→ `@bind`)? Must it survive static
export (→ precompute + `published_to_js`)? Neither (→ `AbstractPlutoDingetjes.Display.with_js_link`,
a pull channel outside Pluto's state management)?
[§12.2](architecture/12-gesture-channel.md#122-the-routing-rule) is the normative statement
and carries the reasoning for each branch.

## Where things stand

v0.1.0 is unreleased. The pre-registration revisions can still carry new work.
`CHANGELOG.md` `[Unreleased]` is the running record.

**Shipped.**
- `masque(fig)` auto-extraction over the recipes in the site's
  [Supported plots and axes](../src/support.md) page, which is the source of truth for that
  list. An unknown parent recipe contributes each visible child the table knows (#158), and
  the skip warning names the recipe (#157).
- Explicit constructors for every primitive.
- `Axis`, `Axis3`, and `PolarAxis` (discrete hits) on both backends.
- Tooltips: `masque"…"` templates, an auto table, a figure-aware theme, and placement
  anchored to the mark.
- Client-side click-echo selection, with `selected=` as its starting value (#103).
- Box-select through a `selects`-ROI. Threshold and ROI drags.
- `SliceInteractable`: a hover-only 1-D sample with an opt-in hair (#92).
- Display-derived subsampling of dense grids (#105).
- View gestures on the `with_js_link` gesture channel, on both backends, committing nothing
  (#102, #122, #133). This covers 2D pan, wheel zoom with a photographic slide of the last
  frame (#85), and 3D orbit (#87).
- Keyboard navigation and screen-reader announcements.
- The split highlight recipe. Right-click passthrough to the base image (#88).
- WebGL context caps (#125).
- A Documenter site with guides, worked examples, and live players.
- Nine CI jobs: Julia on two versions, the no-backend error path, the WGLMakie extension, a
  through-Pluto bind end-to-end, the fixture notebooks, the frontend and bundle, docs links,
  Runic, and an advisory live kind sweep on both backends.

**Closed without building, and why.** These are listed so they are not proposed again
without new evidence:
- #83, the double remount of a self-referencing `@bind` cell. That cell shape is not a
  sanctioned Pluto use. Both Masque-side fixes were built and rejected. Gestures route around
  the problem by never remounting.
- #84, holding the last frame across a remount. Gestures no longer remount. The remaining
  gaps are too small to build for: the WebGL buffer clears on a `px_per_unit` switch, and a
  genuine cell re-run starts blank.
- #86, a resident scene with camera-only patching. Canvas identity does not survive Pluto's
  cell replacement. The gesture path already paints on the canvas the cell holds. The
  remaining cost is a full `serialize_scene` per frame
  ([§12.10](architecture/12-gesture-channel.md#1210-open-questions)).

## Housekeeping (no design work)

- **Close #49.** It is a stale draft, and nothing in it is still wanted. Its registry
  readiness test was dropped in #55. Its `releasing.md` was deleted. Its changelog freeze
  was reversed. TagBot, the `Base64` bound, and the install line reached `main` by other
  routes.
- **Refresh #91's body.** Nothing in its table is ticked, and it predates several merged
  changes: `series!` (`:series`) and `Legend` (`:legend`) are extracted, the #158 child walk
  covers `ablines!`, `arc!`, `pie!`, `contour!` lines, `stephist!`, `ecdfplot!`,
  `streamplot!`, `qqplot!`, and `triplot!`, and #157 is done. Make `support.md` the list
  of what ships, and keep #91 for the gaps only, so the two cannot disagree.
- **Finish #81.** The site already documents the WGLMakie cell pattern. What remains is
  `test/notebooks/webgl_demo.jl`, which still displays a raw `Figure` and then binds
  `masque(fig)` in a later cell. Do this before #175: if #175 lands first, that notebook
  throws.

## Before registration

### Bugs

Ordered cheapest first. None of them changes the manifest shape.

- **#189: `masque` throws on a small RGB image.** On the branch where cells are at least one
  screen pixel, a non-real matrix goes to `Float32` and throws. Give that branch what the
  sub-pixel branch already does: edges only, with `value = nothing`. Add a small colour
  image to the kind sweep.
- **#188: an axis click or a threshold release on a categorical axis throws.** The browser
  commits the category label, and Julia expects a number. This is a bug and also a
  contract decision. One option commits the numeric position with the label beside it. The
  other rejects a categorical dimension in `validate`, as ROI and pan already do. The first
  keeps a feature that the hover card already implies works. Decide before registration,
  because the choice changes what `AxisEvent` and `ThresholdEvent` hold.
- **#165: wheel zoom can leave the inverse matrix applied after the settle frame.** This
  happens when the WebGL preview round trip outlasts the 150 ms settle. It can be reproduced
  deterministically from `photo.ts`. The result is wrong on screen until the next gesture.
  It also keeps the kind sweep from becoming a required check.
- **#171: the axis frame doubles while a pan waits for its frame.** The sliding copy is
  clipped on the spine's centre line, so half the spine moves with it. Fix #171 together with
  #165, since both are in the preview path (`mount.ts`, `photo.ts`).
- **#168: the browser's focus outline boxes the whole figure** on any widget where Masque
  draws no ring of its own (grids, readouts, drags). Draw Masque's own inset indicator
  instead of hiding the outline, so keyboard users keep a visible focus. #169 depends on this.

### Decisions that change the public surface

Registration does not freeze 0.x, but it is when people start depending on these behaviours.
Settle each one first.

- **#172: reject `LScene` on both backends.** Today `:cairo` refuses it with a message that
  points to WGLMakie, and `:webgl` renders it with no overlay. The second is the silent
  behaviour the principles forbid. The recommendation is #172 as written: `LScene` is a
  non-goal on every backend, and the issue is reopened if a user asks for it.
- **#175: throw when a WGLMakie `Figure` is displayed under Pluto.** Today that display hangs
  on a spinner, which is a real trap. The fix #175 proposes is not free: a `Base.show`
  method on Makie's `FigureLike`, plus methods on Bonito's session types, defined from
  Masque's extension. That is type piracy. Every notebook that loads Masque and WGLMakie gets
  it, including notebooks that never call `masque`, and it couples Masque to Bonito
  internals that the canary would then have to track. Before building it, weigh the
  narrower option. `masque` already has the figure, so it can refuse a figure whose WGLMakie
  screen holds a live session, and the docs cover the raw `Figure` case. If the piracy
  stays, #175 should say why the narrower guard is not enough.
- **#167: a large highlighted element washes the plot.** The fix would add a size gate to
  the locked highlight recipe: drop the fill once an element covers much of the viewport,
  and keep the stroke. This changes the locked recipe in `CLAUDE.md` and
  `live-interaction-checklist.md`, so it needs the maintainer's sign-off first. Land it
  after #180, because both change `makeHiElement`.

### Register

- **Register v0.1.0 in General** on a CI-green `main` commit once the items above are
  settled. The mechanics are the Release row in `frontend-delivery.md`.
- **After registration:** drop `Pkg.develop` from the fixture notebooks under
  `test/notebooks/`, and let Pluto's package manager take over.

## After registration

Every item in this section is additive: new keywords, new key bindings, or new recipes. None
of them breaks an existing call.

### Overlay and chrome

- **#180, then #181: themeable chrome.** #180 moves every chrome literal into CSS custom
  properties, and nothing painted changes. That includes the stroke widths and opacities in
  `highlight.ts`, `mount.ts`, and `drag/roi.ts`. #181 then adds flat `masque()` keywords,
  alongside `tooltip_*`, over those properties. The flat keywords are deliberately not
  Makie's global `Theme`. #181 does not start until #180's properties exist. Once #181
  ships, the recipe `CLAUDE.md` calls locked becomes the default, and a user can override
  it.
- **#169: arrow-key nudging for threshold, ROI, and view.** This is the WCAG 2.1.1 gap.
  Each drag layer gets one extra tab stop. The view nudge never writes `@bind`. It depends
  on #168 for the focus indicator. Its view nudge reuses the pan and settle path, so fix #165
  and #171 first. `architecture/11-keyboard.md` scopes this out today, and it has to be
  revised when #169 lands.
- **#179: wide mode.** `max_width` already sets the render width, but Pluto's column shrinks
  the result. #179 widens the cell from inside the widget using `PlutoUI.WideCell`'s
  technique, without the PlutoUI dependency. `WideCell` itself no-ops under `@bind`. A
  `max_width` change is still a full re-render, not a CSS resize.
- **Animation and scrubbing** (no issue). Precomputed frames in one manifest, a JS scrubber,
  and a bond value that is the frame or parameter. This is gated on payload:
  frames × per-frame PNG is the hard ceiling in `perf-findings.md`. The gesture channel
  offers the inverse design. Ship zero frames up front and pull frame *k* on demand. The
  cost then becomes per-request latency, and frames cache once they are seen, unlike
  orbit's continuous parameter space. The container question is unresolved: separate PNGs
  cost far more on the wire than one GIF, but a GIF hides the current frame from the
  overlay. A static export must not be worse than a plain GIF, which Pluto already
  preserves. That argues for embedding by default, with live pull as an opt-in. File an
  issue when a real use pulls for animation.

### Gesture channel

- **Live preview vs. a single settle frame as the default** (no issue). This is a
  frame-cadence question; what commits is settled, since view manipulation commits nothing.
  #102's numbers show what is possible, not what the default should be, and a heavy scene
  may need a different answer than a light one
  ([§12.10](architecture/12-gesture-channel.md#1210-open-questions)). Decide from use of the
  shipped preview, not from spike numbers.
- **Decimate what is rendered during a gesture** (no issue). A coarser frame mid-drag and full
  fidelity once the view settles. This targets Makie's own draw time on heavy scenes, such
  as an 80×80 `surface!`. Grid subsampling cannot help there, because it only reduces what
  is reported.

### Surface coverage

These are Julia-side extractors over existing primitives. #91 lists the gaps. Tick #91 and
update `support.md` whenever `_plotbase` grows a branch.

- **Informative default payloads** for `density!`, `band!` (a single polygon each, whose
  whole payload is `index = 1`), and `voronoiplot!` (where the generating point is more
  useful than a cell index) (no issue). Ship the statistics Makie already computed, following
  `architecture/03-interactables.md`'s rule: geometry from the rendered shape, values from
  Makie's computed values. This is distinct from `SliceInteractable`. The slice answers "what
  is the height at this x"; a payload answers "what is this shape".
- **Named gaps from #91**, in order of demand, not commitment: `hexbin!` (needs hex polygons
  and count payloads), `timeseries!`, `bracket!`, 2D `arrows!` (its `Poly` is pixel space),
  `tricontourf!`, `dendrogram!`, `datashader!`, `mesh!`, and `volume!`/`voxels!`. Parent
  layer ids and contour level payloads remain open on the recipes that the child walk
  already reaches.
- **#170: continuous readout on `PolarAxis`.** Serialize `Makie.Polar` into `invertAxis` for
  `AxisInteractable` only. Threshold, ROI, slice, and view stay gated on polar axes, by
  #170's own scope.
- **`TextLabel`** (no issue). It is a `Block`, not a plot, so it needs the figure-block walk
  that `Colorbar` and `Legend` use. Small.
- **Legend follow-ups** (no issue). A legend entry cannot highlight a `:grid` target.
  Makie's own `Legend(fig, polaraxis)` raises a `MethodError`. That is upstream, but confirm
  it before promising polar legends.
- **Dense cell fields: `heatmap!`/`image!` and `surface!` together** (no issue). `:grid` is
  the awkward corner of the contract. It is the only data kind that is not a list of
  elements, so it has its own hit test, its own selection result, and its own tooltip path,
  and it has no keyboard focus and cannot be a legend target. `surface!` would add
  self-occlusion and a ray hit test on `Axis3`. Design the two together so the contract does
  not grow a second corner of the same shape. The occlusion policy is already settled in
  `architecture/07-scope.md`: document and accept, with a build-time CPU cull as the upgrade
  path.

### Output and hosts

- **SVG output path** (no issue). Nothing exists. #174 documented CairoMakie's own SVG
  activation for a bare figure, which is not an overlay path. Gate this behind a viability
  spike on primitive count. SVG is for sparse plots only; dense plots stay PNG.
- **Non-Pluto fallback in `show`** (no issue). Inline the manifest and guard
  `currentScript` and `invalidation`, so that exports without a Pluto runtime mount the
  overlay. PlutoStaticHTML is one such export. Optional, since static Pluto exports already
  work.
- **Spatial acceleration.** Demand-gated, and may never be built. `perf-findings.md`
  measures the JS hit test at effectively zero cost; the wall is manifest size. Build it
  only if a profile shows the hit test itself is the bottleneck.
- **GLMakie-static backend.** GPU offscreen rendering to PNG, behind the same
  `AbstractBackend`. The projection helpers have to move off CairoMakie first. Optional.
- **`:webgl` in-place data patching** (no issue). Wrap the manual `find_plots(uuid)`
  technique in a Julia uuid accessor and a JS `updatePlotData` helper, for data updates on a
  canvas that is still alive. This is not #86's camera patch. It carries the same
  canvas-identity limit across a remount, so it only helps within one mounted cell.

### Tooling

- **Promote the `kind-sweep` job to a required check** once #99 (the WebGL hover-leave flake)
  and #165 are fixed. Until then, agents run the sweep locally.
- **#176: advisory CI against Makie's development branch.** The canaries only, on a schedule
  and not as a required check. It detects a moved internal before CompatHelper's bump PR
  does. Keep the one-minor compat pins.
- **#177: manifest-size delta on each PR**, on the model of Codecov. It needs a
  machine-readable mode in `bench/payload_envelope.jl`. It compares sizes only, since latency
  is wall-clock and would flake. It also tells a PR when a `perf-findings.md`
  reconciliation is owed.
- **#178: reconcile the `:webgl` scene sizes** in `perf-findings.md` with the bytes Pluto
  actually packs. The published figures are raw numeric-vector sums, and the packed sizes
  are several times larger. Until #178 lands, treat those rows as lower bounds.
- **Editor-lag knee.** Measure Pluto editor stutter at MB-scale output. Worth doing only if
  animation ships.

## Directions (not filed, not committed)

Ideas that fit the contract and could become issues if a use pulls for them. Kept short on
purpose: enough to recognise the idea later, not a design.

**Conventions users arrive expecting.** Each is the missing companion to something already
shipped, which is a better filter than what other libraries happen to have.
- **Legend click toggles series visibility.** Makie's own legend does this. Visibility is
  Julia state, so it is a bond round trip and a re-render, not overlay chrome.
- **Double-click resets the view** to the figure's original limits, or its azimuth and
  elevation. This is the standard companion to pan and wheel zoom.
- **Modifier-click for additive selection.** Clicks are single today, and box-select already
  returns a vector, so the contract this would extend already exists.
- **Cancel and clear.** Escape aborts a drag and restores its starting value, and clicking
  empty space clears the selection. Today Escape only clears focus.
- **Pin a tooltip** so its numbers can be read or copied.

**Linking and selection**
- **Cross-layer and cross-figure links.** Legend `links` generalise. Within one figure this
  is mostly a question of how the user declares the link. Across widgets it needs a registry
  that the private shadow roots lack today.
- **Colorbar range select.** A `selects`-style drag on the colorbar. Julia resolves which
  elements fall in the range.
- **Lasso or polygon select** beside the box ROI, under the same vector contract.
- **Selection persistence across reload** through `sessionStorage`.
- **Nearest-mark snapping.** An opt-in hover mode that picks the nearest mark within a
  radius.

**Probing and readout**
- **2D profile probe.** The slice in two dimensions: the row and column profiles of a
  heatmap cell.
- **Delta readout** between two parked probe lines.
- **Hit priority control.** A per-layer priority would replace the hardcoded ordering, in
  which legend layers come first and `:view` comes last, rather than adding a third special
  case.

**Tooltips and chrome**
- **Richer tooltip content**: sparklines or thumbnails from a payload column, within the
  template's payload budget.
- **High-contrast mode** (`prefers-contrast`). `prefers-reduced-motion` already ships.
- **Touch gestures**: long-press for a tooltip, pan with one finger, and pinch mapped onto
  the #85 zoom preview.

**Coverage and payload**
- **Level-of-detail hit layers** for high-N scatter. Ship a decimated layer and resolve exact
  membership in Julia on click.
- **Manifest compaction.** Delta or column-wise encoding before MsgPack. Decide by re-running
  `bench/payload_envelope.jl`.
- **Table-backed payloads.** `MasqueDataFramesExt` exists. Extend it to anything that
  implements the Tables.jl interface, if a user asks.

**Hosts beyond Pluto**
- **Static inspector export.** A `save_html(widget)` page with hover alive and no bond.
- **Other notebook hosts.** An inspection-only mode for IJulia and Quarto, reusing the
  non-Pluto `show` fallback.

**Testing**
- **Overlay visual regression.** Golden screenshots of the chrome from the kind sweep, once
  the sweep is a required check.

## Non-goals

- **Client-side GPU camera.** A camera that Julia never hears about desyncs the
  Julia-projected overlay, and it can only exist on `:webgl`.
- **GPU-pick occlusion.** Same reason. The symmetric alternative is a build-time CPU cull.
- **High-frequency live redraw as a smooth-drag guarantee.** Per-frame kernel round trips
  are a cost limit shared by both backends. #102 measured this limit and did not lift it: a
  light scene reaches an interactive frame rate, and a heavy one does not.
- **Per-backend feature splits.** `:cairo` ships a static base and `:webgl` a live canvas.
  The difference is cost, not features.
- **A live Bonito connection under `:webgl`.** That is a different product.
- **`LScene`**, once #172 lands.

## Order

A proposed sequence, not a decided one. The only hard dependency edges are these:
- #180 before #181.
- #168 before #169.
- #81 before #175.
- #99 and #165 before the kind sweep becomes a required check.

Registration waits for the decisions listed under "Before registration".

1. Housekeeping: close #49, refresh #91, finish #81.
2. Julia-only bugs: #189, then #188 once its contract choice is made.
3. The preview path: #165 and #171 together, then #99.
4. #168.
5. Decide and land #172, #175, and #167 (or defer #167 explicitly).
6. Register v0.1.0, then drop `Pkg.develop` from the fixture notebooks.
7. Additive work by demand: #180 → #181, #169, #179, #170. Tooling (#176, #177, #178) runs
   alongside, since none of it touches the package.
8. Coverage items as users ask (#91).
9. Payload-gated items (animation, level-of-detail layers) wait for a measured cut in
   per-frame or per-element cost. Spike-gated items (SVG output, spatial acceleration,
   GLMakie-static) wait for a real use.
