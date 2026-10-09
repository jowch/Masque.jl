# Masque.jl — Roadmap

What is left to build, grouped by topic, and what we have decided not to build. `#nn` is an
issue or PR on `jowch/Masque.jl`. The design contract is `architecture.md`, build and delivery
decisions are in `frontend-delivery.md`, and every size and latency figure is in
`perf-findings.md`. What has shipped is `CHANGELOG.md`.

## Now

What is planned has an issue, and what is committed to a release has a
[milestone](https://github.com/jowch/Masque.jl/milestones): `0.1.1` for the next patch,
`0.2.0` for the next minor. An issue that changes existing behavior carries the `breaking`
label and can only go in a minor. Julia's package manager treats `0.1.0` → `0.1.1` as
compatible and `0.1` → `0.2` as breaking, so before 1.0 a patch may add features, as long as
no existing call changes. `CHANGELOG.md` lists what each release shipped under its version
heading (`[0.1.1]`, `[0.2.0]`, …), and what has landed since the last release under
`[Unreleased]`.

## Principles

- **Explicit declaration is the contract; introspection is sugar** on top of it.
- **The frontend is a stateless view. *Authoritative* state lives in Julia via `@bind`**, as
  a value the notebook's own analysis depends on. A value the notebook never reads, such as a
  mid-drag camera or hover chrome, is not authoritative and does not go through `@bind`.
- **No parallel server.** Inspection survives static export; clicks need a kernel.
- **Fail loud, never silently wrong.** A valid input that throws deep in the stack is a bug:
  the error has to name what the user did.
- **Backends differ in cost, never in the interaction contract.** No feature ships on one
  backend that the other can never have (parity goldens in `test/fixtures/parity/`).
- **Build a surface when a real use pulls for it.**
- **Live-verify on every backend** (`live-interaction-checklist.md`) before a user-facing
  change is called done.

**Where a value lives: four questions, in order.** Can the browser answer it alone from what
the manifest already ships (→ overlay-local: an in-drag ROI box or threshold line)? Does the
notebook need it (→ `@bind`)? Must it survive static export (→ precompute and
`published_to_js`)? Neither (→ `with_js_link`, a pull channel outside Pluto's state)?
[§12.2](architecture/12-gesture-channel.md#122-the-routing-rule) carries the reasoning.

## Backlog by topic

One line per item. An issue number means it is filed; *idea* means it fits the contract but
waits for a real use, and gets an issue when one appears. Items are additive unless marked
**breaking**. The PR that closes an issue deletes its line here.

### Overlay and chrome
- #179 — wide mode: widen the Pluto cell from inside the widget.
- *idea* — pin a tooltip so its numbers can be read or copied.
- *idea* — high-contrast mode (`prefers-contrast`).
- *idea* — touch: long-press tooltip, one-finger pan, pinch zoom.
- *idea* — sparklines or thumbnails in a tooltip, from a payload column.
- *idea* — per-layer hit priority, replacing the hardcoded legend-first, view-last order.

### Interaction and selection
- *idea* — a legend click toggles series visibility (a bond round trip and re-render).
- *idea* — double-click resets the view to the figure's limits or camera.
- *idea* — modifier-click adds to the selection; box-select already returns a vector.
- *idea* — Escape aborts a drag and restores its start; clicking empty space clears the
  selection.
- *idea* — links across layers and across figures; across widgets this needs a registry.
- *idea* — range select on a colorbar; lasso select beside the box ROI.
- *idea* — nearest-mark snapping within a radius.
- *idea* — a 2D profile probe on a heatmap cell; a delta readout between two parked probes.

### Gestures and animation
- *idea* — decide the default between live preview and a single settle frame, from use of the
  shipped preview.
- *idea* — render a coarser frame during a gesture on heavy scenes
  ([§12.10](architecture/12-gesture-channel.md#1210-open-questions)).
- *idea* — animation and scrubbing: precomputed frames in a manifest `frames` slot, a JS
  scrubber, and a bond value that is the frame. Gated on per-frame payload, whose hard ceiling
  is frames × per-frame PNG (`perf-findings.md`). The container is unresolved; a static export
  must not be worse than a plain GIF, which argues for embedding by default, with a live pull of
  frame *k* over the gesture channel as an opt-in.

### Plot coverage
- #91 — tracking issue for the recipes `masque(fig)` does not extract yet. Tick it and
  update `docs/src/support.md` when `_plotbase` grows a branch.
- *idea* — informative default payloads for `density!`, `band!`, and `voronoiplot!`.
- *idea* — a legend entry that targets a `:grid` layer.
- *idea* — `heatmap!`/`image!` and `surface!` designed together as dense cell fields;
  occlusion policy is in `architecture/07-scope.md`.

### Output, hosts, and payload
- *idea* — SVG output for sparse plots, after a spike on primitive count.
- *idea* — a static `save_html(widget)` inspector, and inspection-only IJulia and Quarto,
  on top of the CairoMakie `show` that already mounts outside Pluto (#298; WebGL is #300).
- *idea* — GLMakie rendering to PNG behind `AbstractBackend`.
- *idea* — `:webgl` in-place data patching on a canvas that is still alive.
- *idea* — level-of-detail hit layers for high-N plots: a decimated layer, with exact
  membership resolved in Julia on click.
- *idea* — manifest compaction (delta or column-wise encoding), decided by re-running
  `bench/payload_envelope.jl`.
- *idea* — spatial acceleration, only if a profile shows the hit test itself is slow;
  `perf-findings.md`'s "JS hit-test microbenchmark" has the numbers.
- *idea* — Tables.jl payloads beyond the DataFrames extension.

### Tooling
- #177 — manifest-size delta on each PR.
- *idea* — golden screenshots of the overlay chrome from the kind sweep.

## Not doing

Kept so these are not proposed again without new evidence.

- **Client-side GPU camera, GPU-pick occlusion.** Julia would never hear about the camera, so
  the Julia-projected overlay desyncs, and it can only exist on `:webgl`. The symmetric
  alternative to GPU picking is a build-time CPU cull.
- **Smooth-drag guarantee via per-frame kernel round trips.** A cost limit on both backends;
  #102 measured it.
- **Per-backend features**, and **a live Bonito connection under `:webgl`**.
- **`LScene`**: refused on both backends (#172). Reopen if a user asks.
- **#83** — the double remount of a self-referencing `@bind` cell: not a sanctioned Pluto
  shape, and gestures no longer remount.
- **#84** — holding the last frame across a remount: gestures no longer remount. The two gaps
  left on purpose: the WebGL buffer clears when `px_per_unit` is restored, and a genuine cell
  re-run starts blank.
- **#86** — a resident scene with camera-only patching: a view gesture already paints on the
  canvas the current output holds, and the cost that stays is a full `serialize_scene` per frame
  ([§12.5](architecture/12-gesture-channel.md#125-backend-obligations-mechanism-independent)).
- **#167** — an outline-only highlight for large marks: the dodge fill is a mild brightening,
  not a flash, and `overlaystyle`'s `dodge_fill` (#181) sets its strength.
