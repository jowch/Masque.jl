# 7. Scope

What Masque covers today, what it leaves out on purpose, and what is deferred. The per-type
detail lives in [§3](03-interactables.md); the user-facing support table is
`docs/src/support.md`; open work and its ordering is `roadmap.md`. Milestone history is in git.

## In

- **Two co-equal backends** ([§2](02-backends.md)): `CairoBackend` (static PNG) and
  `WebGLBackend` (`:webgl`, live WGLMakie canvas). PNG only on Cairo — there is no SVG output path.
  The interaction feature set is identical on both, CI-enforced by the golden-manifest parity
  harness.
- **Axes:** `Axis` (linear, log, symlog, … for element types; `identity`/`log10`/`log` for the
  types that invert client-side), **categorical axes** (category map shipped to JS), `Axis3`
  (element overlays; `ViewInteractable` orbit), `PolarAxis` (discrete element overlays),
  `Colorbar` and `Legend` blocks. **Multiple axes / subplots** in one figure, with payload-based
  linked selection.
- **Interactables:** the twelve built-in types of [§3](03-interactables.md) — the element types
  (`Point`/`Segment`/`Rect` list + grid/`Polygon`/`Text`), the readouts (`Axis`, `Colorbar`,
  `Slice`), `Legend`, and the three drags (`View`, `Threshold`, `ROI`, including the
  `selects` box-select) — plus `RegionInteractable` / `FunctionInteractable` for custom
  interactions ([§4](04-custom-interactions.md)). Every type has an explicit data-space constructor;
  `masque(fig)` introspects supported plots, including the known children of recipes it has no
  branch for.
- **Bond:** typed `InteractionEvent`s through `@bind` ([§5](05-bond-value.md)); selection
  highlight drawn client-side, seeded by `selected=`; hover never round-trips.
- **Overlay chrome:** hover/selected highlight, tooltips ([§10](10-tooltips.md)), keyboard
  navigation and ARIA ([§11](11-keyboard.md)), in-drag gesture preview on both backends with no
  commit ([§12](12-gesture-channel.md)), right-click passes through to the browser.
- **Figure hygiene:** opaque-background save/restore, no other mutation of the user's figure.
- **Large inputs:** grids ship values at screen resolution ([§8](08-scaling.md)); geometry is
  int-pixel quantized ([§9](09-wire-encoding.md)).

**Hit-testing is a naive O(n) scan per pointer move** (`frontend/src/geometry.ts`). The wall that
bites first is manifest **payload size**, not hit-test CPU ([§8](08-scaling.md)), so the
higher-leverage lever is wire encoding ([§9](09-wire-encoding.md)). Spatial acceleration
(bucketing/quadtree) stays YAGNI until a profile shows JS hit-test *specifically* is the
bottleneck.

## Deliberately out — Masque-wide non-goals

These hold on every backend, by design:

- **Client-side GPU camera** — a JS-driven camera the kernel never hears about. It would desync
  the Julia-projected overlay and could only ever exist on one backend. View gestures stream
  frames rendered by Julia instead ([§12](12-gesture-channel.md)); the camera value itself never
  enters notebook state.
- **GPU-pick occlusion.** Hit geometry stays Julia-projected on both backends; the WGL scene
  JSON scrubs non-finite floats in GPU buffers for transport only.
- **Per-frame faithful redraw as a guarantee.** High-frequency live redraw is a shared cost wall
  ([§6](06-composition.md)), not a per-backend exclusion.

**Occlusion policy (document-and-accept, backend-symmetric).** Every projected vertex is hittable,
including far-side points on solid 3D objects; first-match-wins resolves overlaps exactly as in 2D.
The upgrade path is a build-time CPU painter's cull in Julia (NDC depth), symmetric by
construction.

**3D and polar are backend-symmetric.** CairoMakie renders static 3D natively, so `Axis3` is not
a `:webgl`-only domain: both backends collect `Axis3` blocks, element interactables project
through the shared closure (3D enters only at the projection step — spike-verified on the Cairo
raster and the live canvas, recorded in `perf-findings.md`), and the `axis3` parity goldens are
byte-identical across backends. Continuous pixel→data inversion is undefined on a 3D axis (a
screen pixel is a ray), so the inverting interactables fail loud on `is3d`. `PolarAxis` discrete
overlays ship on both backends the same way (`Makie.Polar` applied via `transform_func`).

## Deferred

| Item | State | Tracking |
|---|---|---|
| Polar continuous readout | Serialize `Makie.Polar` into `invertAxis`; scoped to `AxisInteractable` only — threshold, ROI, slice, and view stay gated on `ispolar` | #170 |
| `LScene` | Cairo refuses it, `:webgl` renders it with no overlay; the proposal is to refuse on both | #172 |
| `surface!` hit-testing | Deferred on both backends alike — a hit-test-complexity gap (unbounded per-cell payload + occlusion), not a backend-capability gap. `MeshScatter`/`Wireframe`/`Arrows3D` are extracted today | `roadmap.md` |
| `TextLabel` | A `Block`, not a plot: needs the figure-block walk, not the plot-scene walk | `roadmap.md` |
| Animation frames | A manifest `frames` slot; payload-unbounded, so gated on shrinking per-frame cost ([§6](06-composition.md), [§8](08-scaling.md)) | `roadmap.md` |
| Other kinds on `Axis3` / `PolarAxis` | Only Scatter/Lines/LineSegments/MeshScatter/Wireframe/Arrows3D extract on `Axis3`, only Scatter/Lines/LineSegments/ScatterLines/Series on `PolarAxis`; others skip with a warning | `roadmap.md` |
| BoxPlot whiskers/outliers | Decorative; only the box body is a hit target | — |
