# Masque.jl — Architecture

> The coherent design. The original decisions, spike validation, and supporting research
> are superseded by this document (kept in git history, not in the tree).
> This document is the contract: the two interfaces (`AbstractBackend`,
> `AbstractInteractable`), the geometry primitives between them, and how custom
> interactions use the same infra as the built-ins.

## 1. The whole picture in one diagram

```
 user's Makie figure + declared interactables
                 │
   ┌─────────────▼──────────────┐
   │ AbstractBackend            │  render(fig)      → RenderResult (image bytes + dims + scaling)
   │   (CairoBackend for v1)    │  context(fig)     → InteractionContext (projection + axis transforms)
   └─────────────┬──────────────┘
                 │ ctx
   ┌─────────────▼──────────────┐
   │ AbstractInteractable[]      │  hitlayers(i, ctx) → Vector{HitLayer}   (compact, image-px geometry)
   │   Point/Segment/Rect/...    │  validate / events / tooltip / hoverstyle
   └─────────────┬──────────────┘
                 │ layers + axis transforms + image
   ┌─────────────▼──────────────┐
   │ masque           │  assembles ONE manifest, emits the @bind widget
   └─────────────┬──────────────┘
                 │ HTML (image + transparent overlay + JS)
   ┌─────────────▼──────────────┐
   │ JS overlay (stateless view) │  hit-test by kind • hover=local • click=@bind round-trip
   └────────────────────────────┘
```

Two contracts cross between layers, and only two: **`InteractionContext`** (backend → interactable)
and **`HitLayer`** (interactable → manifest/JS). Everything else is private to a layer.

## 2. The backend seam — `AbstractBackend`

The backend owns exactly two operations: *produce the displayable artifact*, and *project
data→pixels* for that artifact. Everything CairoMakie-specific lives behind it; nothing
upstream of it knows what rendered the image.

```julia
abstract type AbstractBackend end

render(::AbstractBackend, fig)::RenderResult         # finalize layout + produce artifact
context(::AbstractBackend, fig)::InteractionContext  # projection + per-axis transforms

struct RenderResult
    mime    :: String                                 # "image/png" | "image/svg+xml"
    payload :: Union{Vector{UInt8}, String}           # bytes (raster) | text (svg)
    width   :: Int                                    # output image px
    height  :: Int
    scaling :: Float64                                # device_scaling_factor (px_per_unit for PNG)
end
```

**`CairoBackend` was the only v1 implementation.** (Update: a second, co-equal implementation,
`WebGLBackend` — the `:webgl` backend, in `ext/MasqueWGLMakieExt.jl` — was added later; see the
note at the end of this section.) `CairoBackend` renders PNG only — no vector/SVG output path
exists (a `CairoBackend(vector=true)` groundwork field was removed pre-registration as dead code;
see `roadmap.md`'s SVG output path item for what an actual implementation would need). `render` =
`colorbuffer` → PNG → bytes. `context` calls
`Makie.update_state_before_display!(fig)` (mandatory, validated) then builds the projection closure
and reads each axis's transform.

**Don't corrupt the user's figure.** Makie `Figure`s can't be `deepcopy`'d (they hold module refs),
so instead the one mutation we introduce — forcing an opaque background — is **saved and restored**
(try/finally). `update_state_before_display!` is also run, but that's exactly the step Makie performs
at display/save time, so it's benign, not corruption. See also the DPI/sizing policy in `frontend-delivery.md`
(render at `2 × (max_width or 700px column)`, opaque background, package-owned wide mode).

The seam was originally scoped static-only: v1's research (Q0) found a browser-side *live*
WGLMakie rendering model server-centric and reload-fragile, at odds with the static/durable
output this project set out to provide, and framed it as a different product rather than a
deferred target. **Update:** the seam turned out to admit a live implementation cleanly after
all — `WebGLBackend` implements the same `AbstractBackend` contract (`render`/`context`)
against a browser-GPU `<canvas>` instead of a PNG, shipped as the `MasqueWGLMakieExt` weak-dep
extension. The two backends are now co-equal peers (`_resolve_backend` in `src/render.jl`
picks the loaded one, honors `backend=`, and defaults to Cairo if both are present); see
`backend-comparison.md` for the cost/regime tradeoff (the interaction
feature set is identical on both — parity is CI-enforced by the golden-manifest harness). The seam
still also admits a future GLMakie-static backend (GPU offscreen → PNG, same contract) or a
pure-image backend.

### `InteractionContext` — the backend → interactable bridge

The context is **backend-produced** so projection is not hard-wired to `Makie.project`. It carries a
projection closure (backend's implementation of data→image-px) plus the per-axis transforms (which are
*also* serialized to JS for continuous inversion).

```julia
struct InteractionContext
    project    :: Function                        # (ax, point::Point2) -> Point2f in image px
    transforms :: Dict{Symbol, AxisTransform}     # one per axis; keyed by an axis id
    width      :: Int
    height     :: Int
    scaling    :: Float64
end

# the ONE coordinate primitive interactables call — never re-derive projection
data_to_image_px(ctx::InteractionContext, ax, p) = ctx.project(ax, p)

struct AxisTransform
    id        :: Symbol
    xlims     :: Tuple{Float64,Float64}
    ylims     :: Tuple{Float64,Float64}
    xscale    :: Symbol                            # :identity | :log10 | :log | :symlog10 | :pseudolog10
    yscale    :: Symbol
    viewport  :: NTuple{4,Float64}                 # (x, y, w, h) in image px, top-left origin
    xreversed :: Bool
    yreversed :: Bool
    xcats     :: Union{Nothing, Vector{String}}    # categorical tick map (v1)
    ycats     :: Union{Nothing, Vector{String}}
    valueaxis :: Union{Nothing, Symbol}            # nothing = 2-D {x,y} readout; :x/:y = 1-D colorbar readout
end
```

For CairoMakie the projection closure is the validated spike math:
`q = Makie.project(ax.scene, p); ((q+origin)·scaling) with y-flipped to image coords`.
The `AxisTransform` is the *same information* expressed declaratively, so JS can invert pixels→data
for `AxisInteractable` and for live hover-coordinate readout (the drag/Tier-0 enabler).

**Categorical axes are v1.** When an axis uses a categorical conversion, `xcats`/`ycats` carry the
ordered tick labels so JS maps a pixel to the right category (and tooltips/readout show the category,
not the integer index). Without this, bars/boxplots on categorical axes would report wrong coordinates —
so it's shipped, not stubbed.

**Colorbar `AxisTransform` and the figure-block walk (M3).** Colorbar blocks live in `fig.content`,
not in any `Axis` scene, so `context()` runs a second walk over `fig.content` after collecting axes —
picking up every `Makie.Colorbar` and registering it under a `Symbol("cb", k)` id. Each colorbar gets
its own `AxisTransform`: the value scale (`limits[]`, `scale[]`) is mapped to the long axis (`ylims` for
vertical, `xlims` for horizontal), and `valueaxis` is set to `:y` or `:x` accordingly. The viewport is
the colorbar's laid-out pixel bbox (`computedbbox[]`), converted with the same ×scaling + y-flip used for
axes. JS reads `valueaxis` to invert the cursor pixel to a scalar payload `(; value)` — the same
`invertAxis` path `AxisInteractable` uses for its 2-D `{x,y}` readout, projected along one axis only.

## 3. The interactable seam — `AbstractInteractable`

Every interactable — built-in or user-authored — implements one contract. The framework never
special-cases built-ins; `PointInteractable` is simply the first public implementation.

```julia
abstract type AbstractInteractable end

# REQUIRED: compact, image-px hit geometry. Usually one layer; composites (ScatterLines) return more.
hitlayers(i::AbstractInteractable, ctx::InteractionContext)::Vector{HitLayer}

# OPTIONAL (defaulted):
validate(::AbstractInteractable, ::InteractionContext)::Union{Nothing,String} = nothing   # fail loud
events(::AbstractInteractable)::Tuple = (:click, :hover)   # which events the overlay wires
# tooltip content is per-LAYER, set via the `tooltip` kwarg on each interactable
# constructor (nothing → auto-table, Markup → template, false → suppress).
# The per-element `tooltip(interactable, idx, payload)` dispatch is retired (M2.3).
# See §10 Tooltips, below.
# hoverstyle is per-LAYER too — the manifest ships one `style` per layer, not per element.
# stroke=nothing (default) omits "stroke" from the manifest; the overlay then draws its own
# split highlight — a color-dodge fill (brightens) plus a multiply/screen edge stroke (darkens
# on light/dark figures) — instead of a stroke colour. `colors` no longer feeds the highlight,
# only the tooltip accent. An explicit stroke here is used verbatim (no blend, single element).
hoverstyle(::AbstractInteractable)::NamedTuple = (; stroke=nothing, width=2)
```

**`validate` is per-capability, not a global scale gate** (fixes a latent silent-coordinate bug).
Element interactables (Point/Segment/Rect/Polygon) are projected **in Julia** via `Makie.project`,
so they impose **no axis-scale restriction** — they work on any scale Makie can project (linear, log,
symlog, …). Only `AxisInteractable` and `ColorbarInteractable` rely on **client-side** pixel→data
inversion, so they alone restrict to scales the JS `invert` implements (identity, log10/log, +
categorical via the shipped category map). A blanket `_OK_SCALES` gate would be both too strict
(rejecting element types that work) and too loose (passing `AxisInteractable` on a scale the JS
inverts wrong). Default `validate` stays permissive; `AxisInteractable.validate` and
`ColorbarInteractable.validate` are the ones that gate.

### `HitLayer` — the serialized unit (per interactable, per kind)

The unit is a **layer**, not a single element, because two v1 surfaces need compact *geometry*
that a flat per-element list can't give: a 1000×1000 **heatmap grid** (ship edges, not 10⁶ rects) and
a **polyline** (ship vertices once, hit-test segments in JS). A layer is one geometry *kind* plus the
data to resolve a hit to an element index and its payload.

> **Caveat (the grid is compact in geometry, not in payload).** The grid *geometry* is O(edges),
> but to power the client-side `(i,j)=value` readout the layer also ships the full **source-resolution**
> `values[]` matrix — O(source-cells), the dominant grid term. So a routine 2000²–4000² `heatmap!`/`image!`
> ships tens of MB of values on top of a display-bounded PNG (4.78 MB measured at 1000²). This is the
> day-one-reachable face of "the manifest is the scaling wall" (§8). The committed fix ships `values[]`
> only when cells are targetable (≥~1 px on the known display) — sub-pixel grids drop it (§8).

```julia
struct HitLayer
    id       :: Symbol            # stable key for this layer (links to events/style)
    kind     :: Symbol            # :circles | :polyline | :segments | :rects | :grid | :polygons | :axis
    geometry :: Any               # compact, image-px; layout keyed by `kind` (see below)
    payloads :: Vector{Any}       # element index -> JSON-serializable payload (the linkage key)
    axis     :: Symbol            # which AxisTransform applies (for data-coord tooltips / inversion)
    events   :: Tuple             # copied from the interactable
    label    :: Union{Nothing,String}  # optional screen-reader announcement prefix (keyboard nav, §11)
    colors   :: Any                # optional per-element tooltip accent (§10.4)
    links    :: Union{Nothing,Vector{Vector{Symbol}}}  # optional per-element cross-layer highlight (LegendInteractable, M3)
end
```

Geometry layout by `kind` (all coords image-px, top-left origin):

| kind | geometry | JS hit-test | element index |
|---|---|---|---|
| `:circles` | `Float32[cx,cy,r, …]` | distance ≤ r | triple index |
| `:polyline` | `Float32[x,y, …]` (NaN = gap) | nearest segment, dist ≤ tol | segment i = (v[i],v[i+1]) |
| `:segments` | `Float32[x0,y0,x1,y1, …]` | nearest of disjoint pairs | pair index |
| `:rects` | `Float32[cx,cy,w,h, …]` | point-in-rect | quad index |
| `:grid` | `(xedges, yedges, ncols, nrows, values[])` image-px | binary-search bin → (i,j) | `j*ncols+i` (O(1) hit-test; manifest **O(source-cells)** via `values[]`, see §8) |
| `:polygons` | `Vector{Vector{Float32}}` rings | even-odd point-in-polygon | ring index |
| `:axis` | `nothing` (unbounded, `AxisInteractable`) or `Real[x,y,w,h]` bbox (bounded, `ColorbarInteractable`) | absent geometry = always-hit; bbox present = point-in-bbox; invert pixel via `AxisTransform` | `-1` (continuous); `valueaxis ≠ nothing` → 1-D `(; value)` |

`:polyline`/`:segments`' `tol` (the hit-test slack above) is an optional per-layer manifest
field, `"tol"` (image px) — present only when `hit_tol(i) !== nothing` (`SegmentInteractable`
sets it from its `tol` keyword, scaled like `radius`); absent, the overlay falls back to its
own fixed `SEG_TOL`. Every other kind's manifest is untouched by this field.

`label` (optional, per-layer, `String`) is a screen-reader announcement prefix for the
keyboard-navigation overlay (§11) — e.g. `"Scatter"` in "Scatter, element 3 of 10: …". Set via
the `label` keyword on `PointInteractable`/`SegmentInteractable`/`RectInteractable`
(list form)/`PolygonInteractable` (the kinds keyboard nav visits); absent by default, and
omitted from the manifest entirely when unset (same idiom as `selects`/`tol` above) — see
`perf-findings.md` for the measured per-layer wire cost.

This is a **closed set of six geometry kinds** (`:circles/:polyline/:segments/:rects/:grid/:polygons`)
plus the `:axis` continuous channel. The survey confirmed every retained Makie surface projects to one
of them; nothing in v1+v2 needs a seventh. (Text labels — the surface once speculated to need a new
`bbox`/degenerate-polygon primitive — turned out not to: `TextInteractable` rides plain `:rects`, with
a rotated label's box simply expanded to stay axis-aligned; see §3. That premise is retired for text.)

The three M4 drag kinds — `:view`, `:threshold`, `:roi` — sit outside this set. They are
*control* geometry: one draggable region apiece, no elements, an empty `payloads`. The closed-set
claim covers data geometry projected from a Makie surface.

### Built-in interactables (v1 + M3 + M4 drags + Phase 2 text labels)

Five v1 types, plus `ColorbarInteractable` and `LegendInteractable` (M3), the three drag
interactables (M4), and `TextInteractable` (Phase 2 text labels). Roughly one type per hit
primitive, with the exceptions noted inline: `:axis` is shared by two, `LegendInteractable` and
`TextInteractable` reuse `:rects`, and the three drags each own a kind no other type produces.

| Type | kind(s) | Makie surfaces | payload |
|---|---|---|---|
| `PointInteractable` | `:circles` | Scatter, Stem, Spy, ScatterLines·pts | `(; index, x, y)` |
| `SegmentInteractable` | `:polyline` \| `:segments` | Lines, Stairs, ScatterLines·lines (polyline); LineSegments, Errorbars, Rangebars, HLines, VLines (pairs) | `(; segment_index, p0, p1)` |
| `RectInteractable` | `:rects` \| `:grid` | BarPlot, Hist, Waterfall, CrossBar, HSpan, VSpan (list); Heatmap, Image (grid) | grid `(; i, j, value)`; BarPlot/Waterfall `(; low, high, value)`; Hist `(; value, low, high)`; CrossBar `(; midpoint, low, high)`; HSpan/VSpan `(; low, high)` |
| `PolygonInteractable` | `:polygons` | Poly, Band, Pie, Density, Contourf, Violin, Voronoiplot | Band/Density/Voronoiplot `(; index)`; Contourf `(; low, high)`; Violin `(; x)` |
| `AxisInteractable` | `:axis` (unbounded) | the Axis area itself (linear + log) | `(; x, y)` inverted client-side |
| `ColorbarInteractable` *(M3)* | `:axis` (bounded bbox) | Colorbar — auto-extracted from `fig.content` | `(; value)` inverted client-side via `AxisTransform.valueaxis` |
| `LegendInteractable` *(M3)* | `:rects` | Legend — auto-extracted from `fig.content` | `(; label, group, targets)` — `targets` also ships as `HitLayer.links` |
| `TextInteractable` *(Phase 2 text labels)* | `:rects` | Text, Annotation (via `_descendant(p, Makie.Text)`) — data-space only | `(; text, index, x, y)` |
| `ViewInteractable` *(M4)* | `:view` | the Axis/Axis3 view itself — declared, never auto-extracted | 2D pan `(; xmin, xmax, ymin, ymax)`; 3D orbit `(; azimuth, elevation)` |
| `ThresholdInteractable` *(M4)* | `:threshold` | a draggable horizontal/vertical line on an Axis — declared | a bare data scalar, not a `NamedTuple` (nothing to name) |
| `ROIInteractable` *(M4)* | `:roi` | a draggable box on an Axis — declared; an `AbstractSelector` | `(; xmin, xmax, ymin, ymax)`, or a `Vector{InteractionEvent}` of enclosed elements when `selects=` is set (§5) |

`SegmentInteractable` carries `mode ∈ {:polyline,:pairs}`; `RectInteractable` carries
`layout ∈ {:grid,:list}`. Same JS test, different Julia extractor. The three M4 drags are
declared against an axis rather than extracted from a plot, they are the only types whose
*declared* `events` is `(:drag,)` (`RegionInteractable`/`LegendInteractable`/`FunctionInteractable`
take a caller-supplied `events`, so an instance can carry it too), and their payloads are computed
in the browser and converted Julia-side
rather than looked up in the manifest (`_computed_payload`, §5). `:view` layers sort last in the
manifest so an ordinary drag wins over the catch-all pan/orbit gesture (§6, tension 2), and what
happens during any of these drags — as opposed to on release — is §12's contract.

**Text labels as click-to-pick buttons.** `TextInteractable` geometry comes from Makie's own
`Makie.string_boundingboxes(p)` — scene-local pixel space, y-up, bottom-left origin — converted
*directly* to image px (the same ×scaling + y-flip as `project`, but no `project` call: the boxes
are already pixel-space, not data-space, so there is nothing to project). A rotated label still
yields exactly one `:rects` box, expanded to stay axis-aligned (a looser hit target, not a new
geometry kind). The payload's `text`/`index` are the string and its 0-based per-label index;
`x`/`y` are the DATA-space anchor (`positions`), not the pixel box — consistent with `PointInteractable`'s
`(; index, x, y)` shape. `masque(fig)` auto-detects `text!` directly and `annotation!` by reaching
through to its child `Makie.Text` plot (`_descendant`); only **data-space** text is auto-detected
(`space === :data`) — pixel/relative-space text (decorative overlays) is skipped with a warning, not
silently dropped. `TextLabel` (a `Makie.Block`, not a plot) is **not** covered — it needs the
figure-block walk `ColorbarInteractable` uses, not the plot-scene walk — and remains deferred (see
`roadmap.md`).

**Bar payload schema (Phase 2a).** All `:rects`-list bar/span surfaces (BarPlot, Waterfall,
Hist, CrossBar, HSpan, VSpan) use a shared semantic payload — `InteractionEvent.index` carries the element index, so payloads contain only
domain values (no redundant `index` field). **Span viewport-clamp:** HSpan/VSpan hit-rects are
clipped to the owning axis's pixel viewport so a span cannot bleed into a neighboring axis in a
multi-axis figure. **Uniform payload-length validation:** `SegmentInteractable`,
`RectInteractable`, and `PolygonInteractable` all call `_check_payloads` at construction;
a `payloads=` vector of the wrong length throws `ArgumentError` immediately (fail-loud, same
guarantee as `PointInteractable` / `RegionInteractable`).

**Polygon payload schema (Phase 2b).** The six auto-extracted polygon surfaces each carry a
surface-specific semantic payload. Band, Density, and Voronoiplot use `(; index)` — the element
index is already carried by `InteractionEvent.index`, so the payload holds only the domain key.
Contourf carries `(; low, high)` — the data-value bounds of the filled contour level, read from
Makie's computed level range. Violin carries `(; x)` — the category position. BoxPlot's box body
is auto-extracted as `:rects` (un-notched) / `:polygons` (notched) with `(; q1, median, q3)`
drawn from Makie's computed-stats node. **Principle:** hit geometry comes from rendered shapes
(the actual plotted polygons or rects after Makie lays them out); payload values come from
Makie's computed values (not the raw input data).

**Declaration is the contract; plot-introspection is v2 sugar.** v1 constructors take explicit
data-space geometry (`PointInteractable(ax, points; payloads)`), which the survey confirmed is the
robust path — extracting geometry from live `Scatter`/`Heatmap`/`BarPlot` objects is the genuinely
hard part (markersize units, endpoint half-steps, dodge/stack math) and is deferred. A future
`PointInteractable(scatterplot)` will produce the *same* struct, not a different code path.

**Composites emit multiple layers.** `ScatterLines` → one `:circles` layer + one `:polyline` layer,
hit-tested points-first (within marker radius) then segment. This is the model for any composite recipe.

## 4. Custom interactions — same infra, three ergonomic tiers

The convergent lesson from Bokeh / Plotly / Vega-Lite / Observable Plot: **linkage is payload-based,
and the user should never write JavaScript.** A user's custom interaction must produce `HitLayer`s like
everything else. Three tiers, increasing power, zero escape hatches:

**Tier A — declarative regions (the 80% case, no struct).** State *what* is interactable in data space
+ payloads; the framework owns *how it reacts*. This is the Vega-Lite "interaction is just another
mark" analog.

```julia
RegionInteractable(ax;
    regions  = [(:circle, Point2f(x,y), r), (:rect, p, w, h), (:polygon, ring)],
    payloads = [pl1, pl2, pl3],          # parallel; one per region (the linkage key)
    tooltip  = masque"$(label)",           # Markup template; nothing → auto-table, false → suppress
    events   = (:click, :hover))
```

**Tier B — closure against live context.** For geometry computed from `ctx` (Makie's
`register_interaction!(f, …)` analog). Still emits `HitLayer`s.

```julia
FunctionInteractable(ax, f; id, events=(:click,:hover))   # f(ctx)::Vector{HitLayer}
```

**Tier C — full struct.** Implement `hitlayers` (+ optional `validate`/`hoverstyle`). A user
struct is *indistinguishable* from a built-in — same manifest path, same overlay, same `@bind`. Tooltip
content comes from the per-layer `Masque.tooltip_spec(interactable)` seam (built-in interactables expose it
as a `tooltip=` constructor kwarg; a custom struct overrides `Masque.tooltip_spec`). The `tooltip_*` kwargs
on `masque()` are styling only. See §10 Tooltips, below. Example:

```julia
struct CityInteractable <: AbstractInteractable
    positions::Vector{Point2f}; names::Vector{String}; radius::Float32
end
function Masque.hitlayers(c::CityInteractable, ctx)
    coords = Float32[]; for p in c.positions
        q = data_to_image_px(ctx, c.ax, p); append!(coords, (q[1], q[2], c.radius*ctx.scaling))
    end
    [HitLayer(:cities, :circles, coords, [(; name=n) for n in c.names], :main, (:click,:hover))]
end
# tooltip content: add a `tooltip` field to CityInteractable and override
# `Masque.tooltip_spec(c::CityInteractable) = c.tooltip` — see §10 Tooltips, below
```

**Linkage = shared payloads through Pluto reactivity.** Two interactables writing the same payload field
into the same `@bind` variable *are* linked brushing — the Pluto reactive graph is our
`ColumnDataSource`. No central mutable selection store is introduced; that's the whole point of the
no-server architecture.

**No tier supplies rendering.** All three declare *geometry* — where the regions are and what
payload each carries. What gets drawn belongs to Makie (the base frame) or to the overlay's fixed
chrome — highlights and the ROI box (`frontend/src/mount.ts`), tooltips (§10). An interaction
that recomputes a preview frame in Julia during a gesture (§12) needs a fourth tier supplying
rendering as well as geometry. That
tier is the extension point; no API is specified here, and nothing in §12 depends on one. See
§12.9.

## 5. The bond value

`@bind sel masque(fig, interactables)`:
- `sel === nothing` at mount, unless the widget carries `selected=`, in which case the bond is
  already hydrated to those elements before any click (see "Selected-state…", below). Clicks
  outside all layers are still a no-op — by design — and leave `sel` unchanged.
- On click: `sel` is an `InteractionEvent(layer, index, payload)`. For an element kind
  (`:circles`/`:rects`/`:polygons`/`:segments`/`:polyline`), `payload` is the exact object passed
  in `payloads=` for that element, looked up in the manifest rather than decoded from what the
  browser sent (`_bond_payload` in `render.jl`). There is no browser copy to discard: the click
  upload carries only `{layer, index}` for these kinds (#109) — `layer`/`index` are already
  enough to look the object up, so sending the payload back over the wire would be dead weight
  the receiver throws away — and the result is still `ev.payload === payloads[i]`, so a
  `NamedTuple` payload stays a `NamedTuple`. Kinds with no Julia-side original —
  `:axis`/`:grid`/`:roi`/`:view` — have nothing to look up, so the browser-computed value is
  what ships; `_bond_payload` converts it to a flat, non-recursive `NamedTuple`, per kind, so
  `ev.payload.x` reads the same way an element payload does (#110): for `AxisInteractable`,
  `index = -1` (axis hits aren't element-indexed) and `payload` is `(; x, y)` (or `(; value)`
  for a `Colorbar`, via `AxisTransform.valueaxis`), inverted from the axis transform in JS. A
  `:grid` hit carries two disjoint shapes under the one kind tag — `(; i, j)` / `(; i, j,
  value)` from a direct cell hit, or the `selects`-ROI region descriptor below — so
  `_bond_payload`'s `:grid` branch dispatches on which keys are actually present, not on the
  kind alone. `ThresholdInteractable` is the one exception to the NamedTuple conversion: its
  payload is a bare scalar (the dragged data coordinate), so there's no field to name and
  nothing to convert.
- Hover **never** sets `sel` — it is overlay-local. Only `events` containing `:click` round-trip.

A typed `InteractionEvent` is shipped via `AbstractPlutoDingetjes.Bonds.transform_value`, which
reconstructs it from the raw JS emission — a `Dict` (or, for a selector's multi-echo, a vector of
them) — rather than trusting the browser's payload for an element kind.

**M4 selector contract — Design D.** The bond value depends on whether the interactable is a
selector (a `ROIInteractable` with `selects=:layer_id` set) or not:

- **Click interactables and bounds-only `ROIInteractable`** (no `selects` kwarg) return a single
  `InteractionEvent` (or `nothing` before the first interaction) — the v1 single-event contract is
  unchanged. This is a deliberate Design-D decision: the union `single | Vector` is resolved by the
  presence or absence of `selects`, not by a per-event flag.
- **Selector ROIs** (`ROIInteractable(…; selects=:layer_id)`) implement
  `AbstractSelector <: AbstractInteractable` and return `Vector{InteractionEvent}`:
  - **Points (`:circles`) target** → N point events, one per element whose geometry falls
    within the dragged box.
  - **Grid target** (`:grid` kind) → a 1-element vector holding a **region descriptor**
    `(; i0, i1, j0, j1, xmin, xmax, ymin, ymax)` — 0-based inclusive cell indices plus
    data-space bounds — for server-side aggregate statistics. The browser never needs `values[]`
    for box-selection. This shares the `"grid"` kind tag with a direct cell hit's `(; i, j)` /
    `(; i, j, value)` (above) — the two are disjoint key sets, not a kind-level distinction, so
    `_bond_payload` tells them apart by which keys the browser actually sent.
  - **Empty box** → `InteractionEvent[]` (never `nothing`).

**`AbstractSelector`** is the selector sub-interface (`selects(sel)::Symbol` returning the target
layer id; `compatible_kinds(sel)` returning accepted geometry kinds). At manifest-build,
`compatible_kinds` is validated against the target layer's `kind` — an incompatible pairing is a
loud `ArgumentError`. The only new manifest field is `selects` (a string id) on the selector
layer; `targetKind`/`arity` fields were designed but dropped as redundant — the JS reads the
target kind from the looked-up layer, and `transform_value` detects the `{ items: [...] }` JS
return envelope shape to produce the vector (versus the flat `{layer,index,payload}` dict for
single events).

**Selected-state lives in client-side overlay state, not a `previous=` kwarg or a bond round-trip
(#103).** A click (or Enter/Space on a keyboard-focused element, or a `selects`-ROI release) sets
`OverlayState.selHits_` directly in the browser and draws the highlight from it — no bond write
drives the highlight, and Julia never sees a "mark this selected" instruction back. `selected=`
supplies only the selection's *starting* value: `build_manifest` stamps a `"selected"` index list
onto each named layer, and `mount.ts` reads it once at mount to seed both `state.selHits_` (the
highlight) and `host.value` (the bond, via `initial_value`/`_hydrated_selection` on the Julia
side) — after that seeding `selected=` plays no further role for that widget instance, and the
next click replaces the whole selection, hydration included (single-select — a growing set is
still the `Ref`-accumulator pattern in `demo.jl`). Because the overlay is wiped on every
re-render, a rebuild always restarts from `selected=`; there is no `previous=` argument and no
feedback loop writing the selection back onto the manifest for a next render — the caller
re-supplies `selected=` (typically from the prior bond value) if the same selection should
survive a rebuild.

**A view-manipulation gesture never produces a bond value.** Frames shipped to update the view
during an active drag-to-pan or orbit (§12) do not assign `sel` and do not touch this bond, and
neither does the gesture's release: a camera is operational state, not an analysis value, so it
never enters notebook state at all (§12.3). A `ThresholdInteractable` or `ROIInteractable` release
does commit, through the ordinary path above.

## 6. How it composes — the three interaction tiers

This architecture supports exactly the three tiers from the latency analysis, and the interface maps to
them cleanly:

- **Tier 0 (overlay, 60 fps, no Julia):** hover, live coordinate readout, and dragging *overlay*
  geometry. Enabled by shipping `AxisTransform` to JS. `events(i)` with only `:hover` keeps it local.
- **Tier 1 (precomputed):** `hitlayers(i, ctx)` *is* this tier — Julia computes regions once after
  `update_state_before_display!`. Animation = a precomputed frame sequence (a future `frames` slot on
  the manifest; the format is designed not to preclude it). **It is the one payload-unbounded feature**
  (total = frames × per-frame PNG): ~5.5 MB (187 KB × 30) to ~22 MB (× 120) for a typical plot, 100s of MB
  at scale. The `frames` slot must shrink per-frame cost (downscale / fewer frames) before it ships — §8.
- **Tier 2 (round-trip):** `:click` events → `@bind`. Discrete server re-render from new state is in
  scope on **both** backends for the *committed* value — a click, a keyboard commit, a slider- or
  widget-driven view change — each lands through `@bind` exactly as any other Tier 2 value,
  backend-symmetric. A view-manipulation gesture's own camera/`limits` value is **not** among
  them: camera state is operational, not analysis, and never enters notebook state
  (§12.3). Landing through `@bind` commits the value; it does not by
  itself force a server re-render — a click's own selection highlight is drawn client-side with no
  round trip (§5), so a re-render happens only if the notebook's own reactive graph feeds the
  committed value into a new cell. What differs when a re-render *does* happen is
  **cost**: `:webgl` re-serializes (~flat) while `:cairo` re-rasterizes (scales with the scene) —
  see `backend-comparison.md`. The **in-drag frames** of a view-manipulation gesture are not Tier 2
  traffic at all — they never touch `@bind`, never re-execute a cell, and the two backends
  implement them by completely different mechanisms; see §12 for the contract those frames follow.
  *Per-frame* faithful redraw (smooth-drag-as-a-guarantee) is a shared latency wall on both, not a
  `:cairo`-only exclusion.

**Named tensions (accepted, not bugs):**
1. `AxisInteractable` returns no region geometry — it rides the `:axis` channel as an unbounded
   catch-all. `ColorbarInteractable` (M3) also uses `:axis` but ships a bbox so the hit region is
   bounded to the colorbar's pixel extent. Worth the shared channel: both collapse into the
   `AxisTransform` already shipped, with no new JS primitive.
2. No general z-order/`Consume` model for overlapping custom regions — JS is first-match-wins in
   manifest order. `build_manifest` now imposes one fixed precedence on that order (not a general
   layering model): `LegendInteractable` layers sort first (a legend drawn over plot geometry
   must win the pixels under it, or it's unhoverable — M3 Legend, §"M3 Legend" below), `:view`
   layers sort last (an ordinary drag wins over the catch-all pan/orbit gesture without a
   modifier — resolves the v1 ScatterLines points-over-segments collision too), everything else
   keeps its original relative order. We adopt Makie's `events` *vocabulary* now for
   forward-compat, not its propagation machinery. A general Consume/z-order model for
   user-stacked custom regions stays YAGNI until someone actually needs to control ordering
   between two of their OWN overlapping interactables — the two cases handled by the fixed rule
   above are structural (a legend/view layer's role, not the caller's choice).

## 7. v1 scope

**In:** CairoBackend (PNG; SVG for sparse plots); `PointInteractable`, `SegmentInteractable`,
`RectInteractable` (list + grid), `PolygonInteractable`, `AxisInteractable`; `RegionInteractable` +
`FunctionInteractable`; explicit-geometry constructors; linear + log axes for `AxisInteractable`
(element types: any Makie-projectable scale); **categorical axes** (category map shipped to JS);
**multiple axes / subplots** in one figure with payload-based linked selection; **single-select**;
typed `InteractionEvent` (`transform_value`); **opaque-bg save/restore** (no figure mutation). Hover tooltips +
JS highlight; click → `@bind`. **Hit-testing is naive O(n) per pointer move** with a documented
ceiling (~few-thousand elements/segments); past that, `log()` a notice — no silent degradation. Spatial
acceleration (bucketing/quadtree) is added only if someone hits the wall — but note (§8) the wall that
bites *first* is manifest **payload size** (serialize + transfer), not hit-test CPU, so the
higher-leverage lever is wire encoding (§9), not a quadtree. Spatial acceleration stays YAGNI until a
profile shows JS hit-test *specifically* is the bottleneck.

**M4 (shipped):** `ThresholdInteractable` (draggable threshold line, Tier 0); `ROIInteractable`
(draggable + resizable box, Tier 0 bounds + M4 box-select); `AbstractSelector` /
`selects`-ROI — `Vector{InteractionEvent}` bond, Design-D contract (§5); `ViewInteractable`
(drag-to-pan / drag-to-orbit, commit-on-release); gallery recipes
(box-select scatter, image ROI per-channel stats).

**Phase 2a (shipped):** Hist, Waterfall, CrossBar, HSpan, VSpan — all extracted as `:rects`; shared bar payload schema (semantic, no `index`); span viewport-clamp; uniform `_check_payloads` validation on Segment/Rect/Polygon interactables.

**Phase 2b (shipped):** Band, Density, Contourf, Violin, Voronoiplot — extracted as `:polygons`; surface-specific payloads (Band/Density/Voronoiplot `(; index)`, Contourf `(; low, high)`, Violin `(; x)`). BoxPlot box-body auto-extracted as `:rects` (un-notched) / `:polygons` (notched) with `(; q1, median, q3)`. Tricontourf deferred; BoxPlot whiskers/outliers decorative (box-body-only).

**M3 Colorbar (shipped):** `ColorbarInteractable` — hover/click value readout for any `Colorbar` block, auto-extracted by `masque(fig)` via a figure-block walk over `fig.content`. Rides the `:axis` channel with a bounded bbox geometry; `AxisTransform.valueaxis` tags the value axis so JS inverts the cursor pixel to a scalar `(; value)`.

**M3 Legend (shipped):** `LegendInteractable` — a `Makie.Legend` block's entries as `:rects` hit regions, auto-extracted by the same figure-block walk as Colorbar. Each entry's pixel row is recovered by walking `leg.grid` (GridLayoutBase) for the 2-column shade `Box` Makie's own click-to-toggle hit-tests (`makie_compat.jl`'s `_legend_entries`/`_legend_bbox`); the entry↔plot link comes from `Makie.get_plots` on the entry's elements, the same linkage Makie's built-in legend interaction uses. This introduces `HitLayer`'s only cross-layer field, `links :: Union{Nothing, Vector{Vector{Symbol}}}` — one id-list per element, naming other layers to highlight together with the hovered/selected one (serialized as `"links"`, an array of string-id arrays). `build_manifest` validates every `links` id against the manifest's own layers and their `kind` (must be in `_SELECTED_KINDS`, §5's `selected=` list): an explicit `targets=` failing that check is a build-time `ArgumentError` (the caller's own claim); an auto-resolved (plotmap-derived) one is instead warned and dropped, since silently-unlinkable plots (e.g. a heatmap in the same legend) are a normal, not exceptional, shape. Custom legends (`LineElement`/`MarkerElement`/`PolyElement` built without `plots=`) resolve to empty links — still hittable, no highlight — unless the caller passes `targets=` explicitly.

**Phase 2 text labels (shipped):** `TextInteractable` — `text!` and `annotation!` labels as
click-to-pick buttons, auto-extracted by `masque(fig)` for data-space text. Rides `:rects`; geometry
from `Makie.string_boundingboxes` (no font-metric measurement needed — the originally-speculated
`bbox` primitive was never built). `TextLabel` (a `Block`, needs the figure-block walk rather than
the plot-scene walk) remains deferred.

**Click-echo selection (shipped, #103):** selection moved fully client-side (§5) — a click sets
`OverlayState.selHits_` and draws the highlight in the browser, with no bond feedback onto the
manifest. `selected=` now supplies only the selection's *starting* value: it seeds both the
highlight and `host.value` at mount (via `initial_value`/`_hydrated_selection`) and plays no
further role afterward, so a rebuild — the overlay being wiped every re-render — restarts from
whatever `selected=` says this time. The other half of #103: an element hit's `payload` is now
reconstructed from the widget's own manifest for every element kind, not only `selected=`
widgets (`_bond_payload`, §5) — `ev.payload === payloads[i]`. As of #109 there is no browser
copy left to discard: the upload for these kinds carries only `{layer, index}` in the first
place.

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
`MeshScatter`/wireframe/arrows are extracted today, not deferred. High-frequency live redraw is the shared cost wall above,
not a per-backend exclusion. See `backend-comparison.md` and `roadmap.md`.

## 8. Payload scaling & robustness to large inputs

Measured in the Phase 0 spike (`perf-findings.md` is the single source of every number here; cite it,
don't restate). A rendered cell ships **two** payloads — the JS→Julia click return is negligible:

| Term | Carried by | Bounded by |
|---|---|---|
| **base64 PNG** | HTML `<img>` | the **display** (DPI/`max_width` policy → output px), *not* source resolution |
| **manifest** | `published_to_js` (MsgPack) | **unbounded by display** — O(#hit-elements) + O(source-cells) for grids |

**The manifest is the scaling wall** — not the PNG, not render, not hit-test CPU. A realistic single
plot is **50–400 KB total and render-bound** (~65 ms round-trip). High element counts reach multi-MB and
flip to **payload-bound** (~553 ms total measured at a 4.78 MB manifest). Since the `values[]` cap (§8)
keeps even a 1 M-cell heatmap render-bound, the case that reaches this regime by default is now **high-N
scatter** (200k pts → 7.72 MB manifest). Nothing crashes — it degrades into the half-second range — but
tens of MB would lag the Pluto editor.

**M2.3 (tooltip wire format):** shipping per-element tooltip strings as a retired `tooltips[]` array
would have added O(N × string-bytes) — the dominant inflation term at high element counts (see
`perf-findings.md` §"Scope bounds for downstream phases" for the measured upper bounds). M2.3 avoids
this: tooltip content ships as two O(1)-per-layer fields — `template` (pre-parsed segments, present when
`tooltip` is a `Markup`) and a top-level `tipStyle` dict — leaving the per-element envelope unchanged.
See §10 Tooltips, below, for the wire shape and authoring API.

**Robustness to large inputs (assume a user *will* do this) — implemented.** We ship a tool to
Pluto/Makie users, so assume someone overlays `masque` on a 2000²–4000² `heatmap!`/`image!` *because they
can*. The PNG is safe (display-bounded), but the `:grid` `values[]` matrix is **source-bounded**, so that
routine input ships tens of MB of redundant numbers on top of the PNG that already shows them — and the
user's matrix already lives in their Julia session. `values[]` exists only to power the no-round-trip
`(i,j)=value` hover, so it is dropped when the hover can't target a cell:

**The cap criterion: compute the cell's *expected on-screen* size on the fly, and drop `values[]` when it's
sub-pixel.** A Pluto output cell is only so wide — the display is **bounded by the column** (`max_width`,
700 px default), so the on-screen size is known at manifest-build. Everything needed is already in hand:
`display_css = min(scene_width, max_width)` (the column-bounded display width), the axis viewport in image
px (we project the edges anyway), and the output image width. So
`cell_screen_px = (viewport_image_px / ncols) × (display_css / image_width)`. Under today's DPI policy the
PNG is rendered at 2× the display width (`px_per_unit = 2·min(scene, max_width)/scene`), so that ratio is
0.5 and it reduces to `cell_image_px / 2` — but compute the ratio rather than hardcode ÷2, so it tracks the
policy / wide-mode `max_width`. **Ship `values[]` only when `min(cell_screen_px) ≥ τ`** (τ ≈ 1–2 px); below
that the user *cannot* put the cursor over an individual cell, so the per-cell value is useless and is
dropped. This is an *expected* size (it assumes the default column; the overlay still hit-tests against the
true runtime scale via `getBoundingClientRect`, so the estimate only gates ship/drop). Self-tuning: for a
600-wide figure a 50² heatmap is ~12 px/cell (keep), 200² is ~3 px (keep), **1000² is ~0.6 px (drop)**,
2000²–4000² are 0.3–0.15 px (drop) — and it **subsumes the special `Image` case** (images are source-res >
display-res → sub-pixel → auto-dropped), so no separate rule is needed. When dropped, the payload falls back
to `{i,j}` (the click still localizes the region) and a one-time `@warn` fires (fail-loud). Measured size
benefit: 499× smaller at 1000² (`perf-findings.md`). M2.3 owns the `{i,j,value}` payload shape, but the cap
is decoupled and ships independently. *Implemented:* `src/interactables.jl` (`GRID_VALUES_MIN_SCREEN_PX`,
the `:grid` hitlayer) gated on `InteractionContext.display_scale` (= `display_css / image_width`, set in
`context()`); the overlay tolerates an absent `values[]` (hover shows `(i,j)` only).

## 9. Wire encoding & precision

`published_to_js` serializes the manifest as **generic MsgPack** maps/arrays (the `Dict{String,Any}` /
`Any[]` root defeats the TypedArray binary fast-path even though leaf vectors are numeric). The
encoding levers were **de-speculated by a measurement experiment** (`bench/encoding_experiment.jl` →
`perf-findings.md`), which changed the verdict from my first design guess:

- **Scalar precision — int-pixel quantization (the win, implemented).** Geometry was `Float32` *pixel*
  coordinates, overkill for ~1px hit-testing. Rounding coords to `Int` measured **58% off the geometry
  term** (5.00 → 2.10 B/coord; 732 → 307 KB at 50k circles) — and it needs **no structural change**:
  MsgPack already encodes small ints in 1–3 bytes, the frontend reads numbers either way, and ≤0.5px
  rounding is inside the hit-test tolerance. *Implemented:* `src/interactables.jl` builds per-element
  geometry vectors as `Int` via `_q(x) = round(Int, x)` (circles/segments/rects/polygons/regions + grid
  edges); on a whole realistic manifest the saving is ~17 % (geometry is one term among the payload's
  Float64 `x`/`y`). `Float16` is *not* the way down: MsgPack has no float16 (it promotes to float32 → no
  saving) and is lossy above 2048px.
- **Container structure — typed-array fast-path (rejected by the experiment).** Lifting geometry to a
  top-level typed numeric vector to engage the binary fast-path measured only **~5% beyond int-quantization**
  (2.00 vs 2.10 B/coord) — because compact ints already sit near the 2-byte binary floor. The structural
  manifest-shape change is **not worth 5%**; dropped. (It would only pay off if we kept *floats*, 5→4 B,
  which int-quantization already beats.)
- **The precision split (a real constraint).** Per-element **geometry** is quantizable to pixels, but the
  **`AxisTransform` lims/viewport must stay `Float64`**: the M4 drag path inverts pixel→data through them and
  the error amplifies — and at O(1)/axis the precision costs nothing. Only per-element geometry is quantized.

The other manifest term — heatmap/image `values[]` (§8) — is bounded not by encoding but by *not shipping
it*: capping/dropping it measured **499×** smaller (4.78 MB → 9.8 KB at 1000²). Both are now shipped (the
cap in PR #8, int-pixel coords here); they were the committed manifest-payload work — reach for them before
a quadtree (§7).

## 10. Tooltips

The `masque"..."` / `Markup` template system. Tooltips are its first consumer; the mechanism
generalises to any surface that overlays structured content on hover (labels, annotations,
panels). User-facing usage (defaults, `masque"..."` examples, styling kwargs) is on the site's
[Tooltips page](https://jowch.github.io/Masque.jl/dev/tooltips/); this section is the mechanism
and wire contract behind it.

### 10.1 Mental model

Every Masque interactable carries a `payloads` array — one JSON-serialisable value per element,
built at render time in Julia. **The payload is data; the template is layout.** When the user
hovers over an element, the browser reads that element's payload entry and interpolates it
into the template to produce the tooltip HTML — no round-trip to Julia, no live callback.

This is forced by the no-server constraint: a statically-exported Masque widget has no Julia
kernel to call. Any content the tooltip shows must already be in the manifest at render time,
either as a template (O(1) per layer) or as data in the payload (O(N) per element, the same
O(N) the interactable already ships for hit-testing). A per-element callback
(`tooltip = p -> @htl"..."`) would require either a live kernel or pre-calling it for every
element at build time — the former is unavailable offline, the latter collapses into a
per-element string array and is O(N × string-bytes) on the wire. The template approach avoids
both.

### 10.2 The `masque"..."` macro and `Markup` type

`masque"..."` is a string macro (exported; underlying function `@masque_str`) that produces a
`Masque.Markup` value. It is the only way to author a template; there is no
`masque(runtime_string)` form.

`Markup` stores the parsed template as an ordered list of segments: each segment is either a
literal `String` (emitted verbatim as HTML into the tooltip) or a
`Field(name::Symbol, spec::Union{Nothing,String})` (a placeholder resolved in the browser from
the hovered element's payload entry).

`$(field)` **does not read a Julia variable** — it is a placeholder for a browser-side payload
lookup resolved at hover time. `$(field:spec)` formats the value with a
[d3-format](https://d3js.org/d3-format) spec before escaping. There is no Julia-object
interpolation in templates.

The literal portions of `masque"..."` are treated as raw HTML; the author is responsible for
escaping `<` and `&` in literal text (same contract as `@htl`). Because `masque"..."` requires a
string literal, a runtime-computed string must travel as a field inside the payload:
pre-render it into `payloads` and reference it with `$(that_field)`.

### 10.3 Validation

Template validation happens at two distinct points. The **documented boundary** between them
is: *Julia validates structure; the browser validates meaning.*

**Phase 1 — macro-expansion (structural, no payload).** The macro parses the template string
at compile time and catches unbalanced/empty/unclosed `$(...)` delimiters, non-identifier field
names, and structurally-invalid d3-format specs. Errors surface as `TemplateValidationError`
with a caret underline pointing at the offending span, attached to the source file and line of
the `masque"..."` call — the user sees them the instant the cell parses, before `masque()` is ever
called.

**Phase 2 — build-time field check (payload-aware).** When `masque()` / `build_manifest` is
called with a `Markup` tooltip, each template's field names are resolved against the actual
payload keys. A field present in the template but absent from the payload is a build-time
`ArgumentError`, with a "did you mean?" suggestion (Levenshtein edit distance ≤ 2). This check
only runs when the layer's payloads are `NamedTuple`s (the default for the built-in
interactables); for `Dict`-valued or heterogeneous payloads, it's skipped and a missing
`$(field)` renders empty at hover instead. `:grid` (heatmap/image) layers carry no per-element
payload; a template there resolves the synthesised fields `$(i)`, `$(j)`, and `$(value)`, which
are likewise not field-validated at build.

d3-format spec *structure* (the type character and arrangement of flags) is validated in Julia
against d3's canonical grammar; the *meaning* of precision, trim, and sign modifiers is only
resolved by the browser's `format()` — a spec can pass Julia and still format unexpectedly
(check d3-format's behaviour for that type character).

A `@generated` compile-time field check (to catch typos before `build_manifest`, for
concretely-typed `NamedTuple` payloads) is deferred — it's a no-op on `Vector{Any}` /
heterogeneous payloads, so Phase 2 stays the only build-time check for now.

### 10.4 Wire format

Each entry in the manifest `layers` array carries at most one of these two optional fields:

| Field | Wire type | Present when |
|---|---|---|
| `template` | `Segment[]` | `tooltip` is a `Markup` |
| `tooltip` | `false` | suppress requested |
| *(neither present)* | — | auto-table default |

`Segment` is `string \| { f: string, spec?: string }` — a literal run or a field placeholder.
The template is **pre-parsed in Julia** at build time and shipped as structured data; the
browser never re-parses a template string.

The per-element `tooltips[]` string array that pre-M2.3 versions emitted is retired. Tooltip
content is entirely client-side, rendered on hover from the existing `payloads[i]` entry — this
keeps the tooltip wire cost O(1) per layer regardless of element count; the per-element
envelope is unchanged (see `perf-findings.md` §"Scope bounds for downstream phases" for the
measured comparison).

The top-level manifest field `tipStyle` (`Record<string,string>`, optional) is a CSS-var dict
of set `tooltip_*` kwargs, applied once to the shadow host at mount.

The top-level `background` field (CSS colour string; optional on `build_manifest` directly, but
`masque()` always sets it) is the figure's own
background colour (`fig.scene.backgroundcolor[]`) — the tooltip's light/dark theme is derived
from it client-side via CSS relative-colour syntax (`lch(from var(--masque-fig-bg) …)`, with a
static-light/OS-dark `@supports not (…)` fallback for browsers without it), not just OS
`prefers-color-scheme`, so a dark figure on a light Pluto page still gets a dark tooltip. A
per-layer `colors` field (optional; a single CSS string, or a shared palette + one index per
element) drives a 3px accent border in the hovered element's own colour — resolved only for a
`PointInteractable(ax, p::Makie.Scatter)`-derived layer whose colour is resolvable; omitted
(no accent) otherwise. Both are O(1)-per-manifest/per-layer, same cost-model rationale as
`tipStyle` above (see `perf-findings.md`'s figure-background/`colors` reconciliation entry).

`HitLayer` carries `template?: TemplateSegment[]`, `tooltip?: false`, and `colors?: string |
{palette, index}`; `Manifest` carries `tipStyle?: Record<string, string>` and `background?:
string`. See `frontend/src/types.ts`.

### 10.5 Security model

**Template markup is author-trusted.** The literal HTML in `masque"..."` is inserted as
`innerHTML` without sanitisation. The author who writes a Pluto notebook already has arbitrary
Julia code execution, so sanitising their own template structure is theater (and a
sanitisation library such as DOMPurify adds ~8–15 KB gzip for no real benefit in this context).
A `<script>` tag in a literal template segment executes — expected for authors who
intentionally embed scripts in their tooltips.

**Interpolated data is escaped by default.** Every value resolved from `$(field)` and every
cell in the auto-table is HTML-escaped with the OWASP five-character set (`& < > " '`) before
insertion.

**URL-context caveat.** HTML escaping does not neutralise scheme injection. If `$(x)` is used
as a *whole* `href` or `src` attribute value and the data contains a `javascript:` URL, the
scheme survives escaping and can execute — author responsibility if a template constructs
`<a href="$(x)">` over untrusted URL data.

### 10.6 Deferred / forward path

| Capability | Status | Forward path |
|---|---|---|
| Per-element function tier (`tooltip = p -> @htl"..."`) | **Cut** — O(N) build footgun; per-element *values* belong in the payload | Partially covered by `$(field:raw)` (below) |
| `$(field:raw)` — unescaped field interpolation | Deferred | Explicit opt-in marker (Bokeh `{safe}`-style); pre-render HTML into a payload field, inject unescaped |
| Per-layer `tooltip_*` style override | Deferred | Non-breaking kwarg on the per-layer interactable constructor |
| Compile-time field validation (`@generated`) | Deferred | No-op on heterogeneous payloads; build-time Phase 2 runs for `NamedTuple` payloads |
| Mark-anchored tooltip placement (circles/rects/segments/polyline/polygons/grid) | **Shipped** (tooltip-anchor-chrome PR) | Box centred above the mark's top edge, gap 10px; flips below on top-clip, shifts + moves the caret (`--masque-caret-x`) on side-clip. `frontend/src/geometry.ts`'s `anchorFor`/`computeAnchoredPlacement` |
| Caret edge-flipping / viewport-collision clamping (axis/threshold/ROI/view — cursor-following) | **Shipped** (first overlay polish PR) | Card stays inside the overlay; caret flips via `.flip-x` / `.flip-y` |
| Inline date formatting | Deferred (would add `d3-time-format`) | Format dates in Julia into a payload string field |
| Following a Pluto notebook theme toggle | **N/A** — official Pluto has none | OS `prefers-color-scheme` *is* Pluto's theme (Settings is help text; no class / `data-theme` / JS event). Revisit only if Pluto ships a real override with a stable signal. |

## 11. Keyboard navigation & ARIA

The overlay `surface` is a `tabindex="0"` focus stop (`role="application"` — NVDA/JAWS's default
browse mode otherwise intercepts arrow keys before a `role="group"` element sees them). Focus
moves over a flat, manifest-order list (`frontend/src/keyboard.ts`'s `buildFocusable`) restricted
to the element-indexed kinds `:circles`/`:rects`/`:polygons`/`:segments`/`:polyline`, in the same
layer-then-element order `hitTest` resolves ties in. `:grid` is excluded even though it's
element-indexed — `hitLayerByIndex` has no pre-highlight geometry for it, its `payloads[]` is
empty by design (values are resolved client-side from `(i,j)`, not positionally), and
`ncols*nrows` is unbounded (a 1000×1000 heatmap is not something to arrow through one cell at a
time). `:axis`/`:threshold`/`:roi`/`:view` are continuous or drag-only, not element-indexed.

Keys (handled only while the surface has DOM focus): →/↓ next, ←/↑ previous (both clamp at the
ends, they don't wrap), Home/End first/last, PageDown/PageUp next/previous layer, Enter/Space
dispatch the identical `commitClick` bond payload a mouse click on the same element would (only
if the layer's `events` includes `:click`), Escape clears focus and blurs. Every handled key
calls `preventDefault`/`stopPropagation`; everything else, notably Tab, passes through untouched
— the surface must never become a keyboard trap.

The focus ring reuses the existing hover highlight (`highlight.ts`'s `drawHi`/`makeHiElement`,
mode `"hover"`) — no new visual recipe. Pointer hover and keyboard focus share one ring: a
pointer hover overwrites it and a pointer miss restores it (`hover.ts`'s `restoreFocus`, reading
a cache `keyboard.ts`'s `focusTo` populates on `OverlayState`) so there is never a moment with
two rings, or a "focused but no ring" gap when the mouse merely passes over empty canvas.

**Announcements** go to a visually-hidden `aria-live="polite" aria-atomic="true"` `<div>` inside
the shadow root — not the tooltip (`aria-hidden` toggling on the tooltip is a visibility signal,
not an announcement path for assistive tech). Text is `<label prefix, if set>element <n> of
<count in that layer>: <plain-text tooltip>`, debounced 150ms so a held arrow key announces only
the element you land on. `template.ts`'s `plainTextForHit`/`stripToPlain`/`renderAutoTablePlain`
produce the plain-text body (tag-stripped + entity-unescaped for the template path, a parallel
non-HTML renderer for the auto-table path — a bare tag-strip over the auto-table's markup would
announce `"amp;"` for an escaped `&`). `aria-describedby` on the surface points at a static,
non-live usage hint in the same shadow root (ARIA idrefs don't cross shadow boundaries).

The per-layer `label` field (§3, `HitLayer`) is the only manifest-shape change here — see
`perf-findings.md` for its measured wire cost. Keyboard-driving the drag interactables
(threshold/ROI/view arrow-nudge) is explicitly out of scope: three drag state machines, each
needing the same live-verification pass across both backends, is a disproportionate v1 cost for
a feature with a full mouse/touch path already.

## 12. The gesture channel (#102)

The contract for frames shipped over `AbstractPlutoDingetjes.Display.with_js_link` while an
interaction is in progress. It governs those frames only; the committed value's path is §5 and
§6 Tier 2, unchanged.

The channel is general. Any interaction §12.2's rule routes to question 3 belongs on it,
including one a notebook author writes. Nothing here is specific to a camera — view manipulation
(#102) is the first case, not the definition. The obligations in §12.4 and §12.5, the discipline
in §12.6, and the rule in §12.7 bind every caller.

### 12.1 Gesture vs. data interaction

A **gesture** is a continuous, in-progress manipulation whose intermediate states no downstream
cell reads. A **data interaction** is a value a downstream cell reads: a click, a keyboard commit
(§11), a `selects`-ROI release, a bounds-only `ROIInteractable` release, a threshold-drag
release. A view-manipulation gesture's release is not one: it settles a camera, and a camera is
not a value the notebook reads (§12.3).

These are separate channels, not two speeds of one. A gesture's in-progress frames carry no value
the notebook can see; producing that value is what a data interaction is for.

Not every gesture rides this channel. "Gesture" is the larger set: an in-drag ROI box is a
gesture and answers question 0, so it never leaves the browser. The channel takes only those
gestures §12.2 routes to question 3.

Classification follows §12.2's rule — not the interactable that produced the state, and not what
is being manipulated. For the drag interactables that settle an analysis value — `ROIInteractable`
and `ThresholdInteractable` — release is a data interaction and commits through `@bind` exactly as
a click does (§12.3); only the in-drag behaviour differs. `ViewInteractable` settles a camera and
commits nothing.

### 12.2 The routing rule

Where an in-progress state lives is decided by four questions, in order:

0. Can the browser answer it alone from what the manifest already ships? → overlay-local, no
   channel and no Julia round trip (§6 Tier 0).
1. Does the notebook need this value? → `@bind`.
2. Must it survive static export? → precompute it and ship it via `published_to_js`.
3. Neither? → `AbstractPlutoDingetjes.Display.with_js_link` — a pull channel outside Pluto's
   state management.

Question 3 requires three noes: not answerable in the browser, read by no cell, not needed in an
export. Nothing else restricts which interaction, or whose code, uses the channel.

**Exhaust question 0 first.** It costs no round trip, no latency budget and no backpressure, and
it survives static export. The manifest already carries `AxisTransform` (so any coordinate
readout or inversion is local), per-element `payloads`, and — for a grid whose cells are at least
one screen pixel — the cell `values[]` (`GRID_VALUES_MIN_SCREEN_PX`, `src/interactables.jl`).
What blocks a question-0 answer is more often output surface than data: the overlay is three
sibling SVGs with no raster layer (`frontend/src/mount.ts`), so an effect needing per-pixel output
has nowhere to draw.

**View manipulation (#102).** Panning or orbiting changes the image, not an overlay drawn over
it, and every hit region's projection depends on the camera: question 0 is no. No cell reads the
intermediate camera state, and an export has no kernel to drive a live gesture: questions 1 and 2
are no. It routes to question 3, and because the camera moves it carries the obligations in §12.4
and §12.5's second list.

**A live threshold preview.** An image plot with a hover intensity readout, a colorbar dragged to
set a threshold, a live preview of the masked image, and the committed threshold bound as output.
Its four parts route to three places. Readout and threshold line: question 0 — the manifest
carries the transform and, at display resolution, the cell values. Committed threshold: question
1, `@bind` on release. Preview: question 3 — no cell reads the mid-drag mask, an export has no
kernel to recompute it, and the browser cannot produce it once the mask is not locally
computable.

Two conditions take the mask out of question 0: cells going sub-pixel, so Julia drops `values[]`
from the manifest (the full-resolution case), and the mask ceasing to be pointwise, since
morphology and connected components are neighbourhood-dependent. **Thresholding is question 0;
segmentation is question 3.** #105's display-derived subsampling would restore values at display
resolution and return the thresholding case to question 0.

The camera does not move in this case, so the projection and every hit region stay valid for the
whole drag: a new frame is owed, a new manifest is not, and hit-testing stays live — a hover
readout keeps working mid-drag. §12.4 and §12.5 divide on that line.

`roadmap.md` states the same four questions as its own framing note ("Where a value lives").
This section is the normative statement and carries the reasoning for each branch; the two must
not diverge.

### 12.3 What commits, and when

In-drag frames never touch the bond: no cell re-execution, no output replacement, no remount.
Producing and displaying a frame during a gesture is invisible to Pluto's reactivity.

A gesture that settles an **analysis value** — a threshold, an ROI's bounds — commits it through
`@bind` on release. For those, this channel moves the in-progress frames off `@bind` and leaves
the committed value's path unchanged.

**A view-manipulation gesture commits nothing.** `@bind` carries values the user asked for; a
camera position is operational state describing how a plot is being looked at, not a quantity the
notebook's analysis consumes. Pan, zoom and orbit therefore live entirely on this channel, with no
bond at the end. A widget carrying a `ViewInteractable` is still bindable — its bond reports the
*selection* (§5), which a view-only widget simply never updates.

**View state does not persist across a re-render.** The `with_js_link` closure is recreated when
the cell re-runs, so an upstream data edit returns the view to the figure's own limits. This is
intended. No other non-bond display state survives a cell re-run in Pluto either, and it is the
same reasoning §5 uses to drop the selection on remount: a rebuilt figure is a different figure.
The alternatives are worse — notebook state is what this rule rejects, and a Masque-side mutable
store keyed by widget is ruled out by §4. An author who wants a view to persist writes the
`Ref` + `@bind` pattern explicitly and takes on its tradeoffs, including §12.8's; that removes the
*automatic* bind, not the capability.

*Status:* this is the contract, not the current implementation. `ViewInteractable` commits
`limits`/`azimuth`+`elevation` through `@bind` today; moving it onto this channel is #102's work,
and `_computed_payload`'s `:view` branch (`src/render.jl`) retires with it.

### 12.4 Projection stays Julia-authored on every frame

No backend ships 3D or 2D coordinates to JS and reprojects them there. That holds everywhere
(§2's `InteractionContext`; the client-side-GPU-camera non-goal in §7's backend-scope note). On
this channel it holds **per frame**: a gesture that changes what Julia projected accompanies
every frame with hit geometry Julia computed for that same state.

The trigger is a change to the projection, not a change to the picture:

- A gesture that repaints without moving the camera or the limits leaves every hit region in
  place — new frame, same manifest, nothing to suspend or rebuild.
- A gesture that moves the camera invalidates every hit region at once — frame and manifest
  travel together.

A gesture that moves the camera and ships a frame without a matching manifest, or that lets JS
derive geometry from a JS-owned camera, does not conform, whatever its performance.

#87 (3D orbit preview) rests on this clause: without per-frame re-projection an orbit leaves the
overlay at a stale azimuth/elevation.

### 12.5 Backend obligations (mechanism-independent)

For every frame on this channel:

- update the displayed frame;
- do not remount;
- do not re-execute a cell;
- never leave the overlay live over a frame it no longer describes.

Additionally, when the gesture changes what Julia projected (§12.4):

- accompany the frame with hit geometry Julia computed for the same state, and swap the frame's
  hit manifest atomically with it.

The second list is the expensive one and is owed only by camera-moving gestures. Applied
unconditionally it charges the cheap case a manifest rebuild it does not need and suspends
hit-testing that could stay live.

Mechanisms differ by backend and need not converge. `:cairo` re-renders and ships a fresh PNG
plus, when owed, a fresh manifest. `:webgl` has no settled mechanism: #86 gates in-place buffer
patching on canvas identity (a WebGL context is tied to one `<canvas>`, which Pluto's cell-output
replacement destroys). #85 proposes a 2D last-frame preview — CSS-transforming frame and overlay
together, one Julia commit on release — for both backends, not as a `:webgl`-specific answer to
#86. **Backends differ in cost, never in the interaction contract:** conformance is judged
against the obligations above, never against a particular backend's mechanism.

### 12.6 Request discipline

- One in-flight request per widget.
- Coalesce intermediate pointer moves rather than queueing them — a burst collapses to the latest
  move, not a backlog to drain.
- Always await a round trip before issuing the next. Never fire-and-forget.
- Never a fixed-interval poll. `with_js_link`'s own docstring warns that polling at a fixed
  interval can make a notebook unusable.

The channel carries no backpressure of its own — `@bind` has Pluto's machinery between browser
and kernel, this has nothing — so a caller that ignores the list can saturate the kernel from one
pointer drag. A user-facing surface enforces the discipline in what Masque hands the author
rather than leaving it to the author.

**A handler on this channel runs outside Pluto's reactive graph.** It is an ordinary Julia
closure captured at render time. When the data it closed over is redefined upstream, nothing
invalidates the closure, re-runs it, or signals that its answers are stale: frames keep arriving,
computed against data the notebook no longer holds. This follows from being outside the graph and
has no framework fix.

### 12.7 Nothing carried on this channel is notebook state

`with_js_link` bypasses Pluto's state management by design: nothing it returns is recorded in the
notebook. A value that rides this channel is not recoverable, not reproducible from the saved
notebook, and invisible to every downstream cell. If it matters, it commits through `@bind`.

The rule applies per *transmission*, not per variable. The same quantity travels both channels at
different moments: mid-drag a threshold is a transient render parameter driving a preview nothing
downstream reads (§12.2); on release that same threshold commits through `@bind` (§12.3).
Previewing live *and* binding the settled value is the ordinary case, not a tension to resolve.
The question is never "does a cell read this variable?" but "does a cell read this send?" — if it
does, it is a commit and goes through `@bind`.

A camera is the case where the answer is *no send ever commits*, which is why §12.3 takes view
manipulation off `@bind` entirely rather than splitting it per transmission.

### 12.8 Relationship to #83

A channel that never remounts removes #83's double remount for gestures: there is no remount to
double. For view manipulation the claim is stronger than that — with no bond at the end of the
gesture (§12.3), the self-referencing `@bind` cell that produces #83 is never written at all.

#83 is otherwise unaffected, and is not a Pluto defect: a self-referencing `@bind` cell is not a
sanctioned Pluto use case. Every path still going through `@bind` retains #83's behaviour,
including an author who opts into the `Ref` + `@bind` pattern to persist a view.

### 12.9 Prerequisites for a user-facing surface

An internal-only use of the channel can ship without these. A surface a notebook author reaches
cannot.

**Static export degrades loudly.** A live-pull widget in a static export has a dead channel — no
kernel answers a `with_js_link` call. The widget says so and disables the gesture rather than
failing silently.

Hanging is not the failure mode to design against: Pluto swaps `pluto_actions` for
`nothing_actions` in a static export, and `request_js_link_response` is not in its `actions_to_keep`
list, so the call returns `undefined` and Pluto's own `.then` on it throws synchronously on the
first request (`frontend/common/SliderServerClient.js`, `frontend/components/CellOutput.js`). A
`with_js_link` call in an export fails fast and loudly by construction. PlutoSliderServer takes the
same branch, so it does not rescue the case. What the widget owes is catching that throw and
degrading deliberately, not a timeout.

**A dead channel is detected at use time.** A render-time capability check cannot establish that
the channel is still live. Exporting does not re-render: `generate_html` serializes existing
notebook state via `notebook_to_js` (`Pluto/src/notebook/Export.jl`,
`Pluto/src/webserver/Dynamic.jl`), so the widget's HTML — and the `is_supported_by_display`
decision baked into it — was produced in a session where the kernel was live, and carries that
decision forward to a reader who has none. The degradation above cannot rest on
`is_supported_by_display`. These two are one decision: the degradation mechanism has to work in
exactly the case the capability check cannot see.

**A rendering seam exists.** Every interactable declares geometry; none declares rendering (§3,
§4). An author supplying a preview frame needs one. §4 holds that extension point; no API is
specified.

### 12.10 Open questions

Constraints a conforming implementation must satisfy. Each is unresolved and left to whoever
picks up #102.

- **Heavy-scene mitigation beyond `px_per_unit = 1`.** A render-bound heavy scene needs further
  mitigation to hit a live-preview budget — a further downscale, a render-quality knob during the
  drag, or an accepted lower frame rate. Which one, and at what threshold, is unresolved. Issue
  #102 carries the measurements establishing that the heavy scene is render-bound.
- **`:webgl` parity.** `:webgl` has no settled mechanism for §12.5's obligations, and the gap is
  in the mechanism, not the measurement: #86 blocks in-place buffer patching on canvas identity,
  and #85's 2D last-frame preview is an alternative for both backends rather than an answer to
  #86. Whichever mechanism `:webgl` takes, what the backends share is this section's contract.
- **What commits a gesture with no release.** §12.3's commit-on-release rule is drag-shaped: pan
  and orbit are pointer drags with a pointerup to commit on. A wheel zoom has no terminal event
  and needs another commit rule — an idle debounce, an explicit affordance, something else.
  `ViewInteractable` is drag-only today (`events` is `(:drag,)`; `mode` is `"pan"` or `"orbit"`;
  `frontend/src/` has no wheel handler), so nothing is blocked now. `roadmap.md` plans wheel zoom
  as part of #85, so the rule is needed before #85 lands. #105 does not wait on it: subsampling is
  worth doing whether or not this channel ships, and the two only compound if both do.
