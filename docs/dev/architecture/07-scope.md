# 7. v1 scope

**In:** CairoBackend (PNG; SVG for sparse plots); `PointInteractable`, `SegmentInteractable`,
`RectInteractable` (list + grid), `PolygonInteractable`, `AxisInteractable`; `RegionInteractable` +
`FunctionInteractable`; explicit-geometry constructors; linear + log axes for `AxisInteractable`
(element types: any Makie-projectable scale); **categorical axes** (category map shipped to JS);
**multiple axes / subplots** in one figure with payload-based linked selection; **single-select**;
typed `InteractionEvent` (`transform_value`); **opaque-bg save/restore** (no figure mutation). Hover tooltips +
JS highlight; click → `@bind`. **Hit-testing is naive O(n) per pointer move** with a documented
ceiling (~few-thousand elements/segments); past that, `log()` a notice — no silent degradation. Spatial
acceleration (bucketing/quadtree) is added only if someone hits the wall — but note ([§8](08-scaling.md)) the wall that
bites *first* is manifest **payload size** (serialize + transfer), not hit-test CPU, so the
higher-leverage lever is wire encoding ([§9](09-wire-encoding.md)), not a quadtree. Spatial acceleration stays YAGNI until a
profile shows JS hit-test *specifically* is the bottleneck.

**M4 (shipped):** `ThresholdInteractable` (draggable threshold line, Tier 0); `ROIInteractable`
(draggable + resizable box, Tier 0 bounds + M4 box-select); `AbstractSelector` /
`selects`-ROI — `Vector{InteractionEvent}` bond, Design-D contract ([§5](05-bond-value.md)); `ViewInteractable`
(drag-to-pan / drag-to-orbit — commits nothing as of #102/§12.3; a live gesture-channel preview
ships on `:cairo`); gallery recipes
(box-select scatter, image ROI per-channel stats).

**Phase 2a (shipped):** Hist, Waterfall, CrossBar, HSpan, VSpan — all extracted as `:rects`; shared bar payload schema (semantic, no `index`); span viewport-clamp; uniform `_check_payloads` validation on Segment/Rect/Polygon interactables.

**Phase 2b (shipped):** Band, Density, Contourf, Violin, Voronoiplot — extracted as `:polygons`; surface-specific payloads (Band/Density/Voronoiplot `(; index)`, Contourf `(; low, high)`, Violin `(; x)`). BoxPlot box-body auto-extracted as `:rects` (un-notched) / `:polygons` (notched) with `(; q1, median, q3)`. Tricontourf deferred; BoxPlot whiskers/outliers decorative (box-body-only).

**M3 Colorbar (shipped):** `ColorbarInteractable` — hover/click value readout for any `Colorbar` block, auto-extracted by `masque(fig)` via a figure-block walk over `fig.content`. Rides the `:axis` channel with a bounded bbox geometry; `AxisTransform.valueaxis` tags the value axis so JS inverts the cursor pixel to a scalar `(; value)`.

**M3 Legend (shipped):** `LegendInteractable` — a `Makie.Legend` block's entries as `:rects` hit regions, auto-extracted by the same figure-block walk as Colorbar. Each entry's pixel row is recovered by walking `leg.grid` (GridLayoutBase) for the 2-column shade `Box` Makie's own click-to-toggle hit-tests (`makie_compat.jl`'s `_legend_entries`/`_legend_bbox`); the entry↔plot link comes from `Makie.get_plots` on the entry's elements, the same linkage Makie's built-in legend interaction uses. This introduces `HitLayer`'s only cross-layer field, `links :: Union{Nothing, Vector{Vector{Symbol}}}` — one id-list per element, naming other layers to highlight together with the hovered/selected one (serialized as `"links"`, an array of string-id arrays). `build_manifest` validates every `links` id against the manifest's own layers and their `kind` (must be in `_SELECTED_KINDS`, [§5](05-bond-value.md)'s `selected=` list): an explicit `targets=` failing that check is a build-time `ArgumentError` (the caller's own claim); an auto-resolved (plotmap-derived) one is instead warned and dropped, since silently-unlinkable plots (e.g. a heatmap in the same legend) are a normal, not exceptional, shape. Custom legends (`LineElement`/`MarkerElement`/`PolyElement` built without `plots=`) resolve to empty links — still hittable, no highlight — unless the caller passes `targets=` explicitly.

**Phase 2 text labels (shipped):** `TextInteractable` — `text!` and `annotation!` labels as
click-to-pick buttons, auto-extracted by `masque(fig)` for data-space text. Rides `:rects`; geometry
from `Makie.string_boundingboxes` (no font-metric measurement needed — the originally-speculated
`bbox` primitive was never built). `TextLabel` (a `Block`, needs the figure-block walk rather than
the plot-scene walk) remains deferred.

**Click-echo selection (shipped, #103):** selection moved fully client-side ([§5](05-bond-value.md)) — a click sets
`OverlayState.selHits_` and draws the highlight in the browser, with no bond feedback onto the
manifest. `selected=` now supplies only the selection's *starting* value: it seeds both the
highlight and `host.value` at mount (via `initial_value`/`initial_bond`) and plays no
further role afterward, so a rebuild — the overlay being wiped every re-render — restarts from
whatever `selected=` says this time. The other half of #103: an element hit is reconstructed
from the widget's own manifest for every element kind, not only `selected=` widgets
(`bond_from_js`, [§5](05-bond-value.md)) — `ev.payload === payloads[i]` with `i` 1-based. As of
#109 there is no browser copy left to discard: the upload for these kinds carries only
`{layer, index}` in the first place.

**v2:** plot-object introspection constructors; ABLines/Arc,
`TextLabel` (Block) support, animation frames, SVG-overlay annotations, spatial hit-test acceleration.

**Backend scope — corrected (2026-07-02), core shipped (WS-3D).** The earlier framing here
("3D … is the `:webgl` backend's domain") was wrong about *why*: CairoMakie renders **static 3D
natively**. The `Axis3` guard has since **lifted**: both backends collect `Axis3` blocks, element
interactables project through the shared closure (3D enters only at the projection step —
spike-verified exact on the Cairo raster *and* on the live `:webgl` canvas, static and
after an `azimuth`/`elevation` change; figures in `perf-findings.md` §"Axis3 projection hinge
spike"), and the `axis3` parity goldens are byte-identical across backends. Continuous pixel→data
inversion is undefined on a 3D axis (a screen pixel is a ray), so `is3d` transforms ship
degenerate lims and `Axis`/`Threshold`/`ROI` interactables fail loud. **`PolarAxis` discrete
overlays ship on both backends** (shared projection applies `Makie.Polar` via `transform_func`;
`ispolar` transforms + the same continuous-consumer gates; Scatter/Lines/LineSegments/
ScatterLines auto-extract). WGL scene JSON scrubs non-finite floats in GPU buffers for
transport only — Masque hit geometry stays Julia-projected. Continuous θ/r readout still needs
the polar transform serialized to JS — deferred. `LScene` remains guarded (own camera/scoping look). The **Masque-wide** non-goals (every backend, by design) are the
**client-side GPU camera** — a JS-driven camera the kernel never hears about, which would desync
the Julia-projected overlay and can only ever exist on one backend — and **GPU-pick occlusion**.
**Occlusion policy (document-and-accept, backend-symmetric):** every projected vertex is
hittable, including far-side points on solid objects — first-match-wins resolves overlaps exactly
as in 2D; the upgrade path is a build-time CPU painter's cull in Julia (NDC depth), symmetric by
construction. `Surface` hit-testing is deferred on both alike (a hit-test-complexity gap —
unbounded per-cell payload + occlusion — not a backend-capability gap);
`MeshScatter`/wireframe/arrows are extracted today, not deferred. High-frequency live redraw is
the shared cost wall (see
[§6](06-composition.md)), not a per-backend
exclusion. See `backend-comparison.md` and `roadmap.md`.

