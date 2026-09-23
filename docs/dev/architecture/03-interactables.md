# 3. The interactable seam — `AbstractInteractable`

Every interactable — built-in or user-authored — implements one contract. The framework never
special-cases built-ins; `PointInteractable` is the first public implementation.

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
# See §10 Tooltips.
# hoverstyle is per-LAYER too — the manifest ships one `style` per layer, not per element.
# stroke=nothing (default) omits "stroke" from the manifest; the overlay then draws its own
# split highlight — a color-dodge fill (brightens) plus a flat chrome edge stroke
# (#7a7a7a light figure, #c8c8c8 dark; not blended into the mark) — instead of a stroke colour. `colors` no longer feeds the highlight,
# only the tooltip accent. An explicit stroke here is used verbatim (no blend, single element).
hoverstyle(::AbstractInteractable)::NamedTuple = (; stroke=nothing, width=2)
```

**`validate` is per-capability, not a global scale gate.** Element interactables
(Point/Segment/Rect/Polygon) are projected **in Julia** via `Makie.project`, so they impose **no
axis-scale restriction** — they work on any scale Makie can project (linear, log, symlog, …). Only
`AxisInteractable` and `ColorbarInteractable` rely on **client-side** pixel→data inversion, so they
alone restrict to scales the JS `invert` implements (identity, log10/log, + categorical via the
shipped category map). Default `validate` stays permissive; `AxisInteractable.validate` and
`ColorbarInteractable.validate` are the ones that gate.

## `HitLayer` — the serialized unit (per interactable, per kind)

The unit is a **layer**, not a single element, because two v1 surfaces need compact *geometry*
that a flat per-element list can't give: a 1000×1000 **heatmap grid** (ship edges, not 10⁶ rects) and
a **polyline** (ship vertices once, hit-test segments in JS). A layer is one geometry *kind* plus the
data to resolve a hit to an element index and its payload.

> **The grid is compact in geometry.** The edges are O(source cells along one side). The values
> follow the screen: the full source matrix when a cell is at least one screen pixel, and one
> source value per screen pixel of the axis viewport when cells are smaller ([§8](08-scaling.md)).
> On that sub-pixel branch a matrix that is not real-valued ships edges only. A 2000²–4000²
> `heatmap!`/`image!` does not ship the source matrix.

```julia
struct HitLayer
    id       :: Symbol            # stable key for this layer (links to events/style)
    kind     :: Symbol            # :circles | :polyline | :lines | :segments | :rects | :grid | :polygons | :axis | :slice
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
| `:lines` | `Vector{Real}[]` paths, one flat `[x,y,…]` per element (NaN = a gap inside that path) | nearest edge of any path, dist ≤ tol | path index — one element per plotted line |
| `:segments` | `Float32[x0,y0,x1,y1, …]` | nearest of disjoint pairs | pair index |
| `:rects` | `Float32[cx,cy,w,h, …]` | point-in-rect | quad index |
| `:grid` | `(xedges, yedges, ncols, nrows)` plus `values[]` **or** `sample` (screen pixels; [§8](08-scaling.md)) | source bin, or the screen pixel then the cell at its center | `j*ncols+i` |
| `:polygons` | `Vector{Vector{Float32}}` rings | even-odd point-in-polygon | ring index |
| `:axis` | `nothing` (unbounded, `AxisInteractable`) or `Real[x,y,w,h]` bbox (bounded, `ColorbarInteractable`) | absent geometry = always-hit; bbox present = point-in-bbox; invert pixel via `AxisTransform` | `-1` (continuous); `valueaxis ≠ nothing` → 1-D `(; value)` |

`:polyline`/`:lines`/`:segments`' `tol` (the hit-test slack above) is an optional per-layer manifest
field, `"tol"` (image px) — present only when `hit_tol(i) !== nothing` (`SegmentInteractable`
sets it from its `tol` keyword, scaled like `radius`); absent, the overlay falls back to its
own fixed `SEG_TOL`. Every other kind's manifest is untouched by this field.

`label` (optional, per-layer, `String`) is a screen-reader announcement prefix for the
keyboard-navigation overlay ([§11](11-keyboard.md)) — e.g. `"Scatter"` in "Scatter, element 3 of 10: …". Set via
the `label` keyword on `PointInteractable`/`SegmentInteractable`/`RectInteractable`
(list form)/`PolygonInteractable` (the kinds keyboard nav visits); absent by default, and
omitted from the manifest entirely when unset (same idiom as `selects`/`tol` above) — see
`perf-findings.md` for the measured per-layer wire cost.

This is a **closed set of seven data geometry kinds**
(`:circles/:polyline/:lines/:segments/:rects/:grid/:polygons`)
plus the `:axis` continuous channel. `:lines` is the whole-path form of a polyline: the pointer
still has to land within `tol` of an edge, but the element is the path, and a `NaN` gap stays
inside that path. Every retained Makie surface projects to one of them; text labels
(`TextInteractable`) ride plain `:rects`.

The three M4 drag kinds — `:view`, `:threshold`, `:roi` — sit outside this set. They are
*control* geometry: one draggable region apiece, no elements, an empty `payloads`. The closed-set
claim covers data geometry projected from a Makie surface. `:slice` sits outside hit testing
too: `hitLayer` returns null. The layer carries data-space series for the client to sample,
not a region. Its `crosshair` and `orientation` fields tell the overlay whether to draw
one hair, and which arm. A plot with no slice draws none.

## Built-in interactables (v1 + M3 + M4 drags + Phase 2 text labels)

Five v1 types, plus `ColorbarInteractable` and `LegendInteractable` (M3), the three drag
interactables (M4), and `TextInteractable` (Phase 2 text labels). Roughly one type per hit
primitive, with the exceptions noted inline: `:axis` is shared by two, `LegendInteractable` and
`TextInteractable` reuse `:rects`, and the three drags each own a kind no other type produces.

| Type | kind(s) | Makie surfaces | payload |
|---|---|---|---|
| `PointInteractable` | `:circles` | Scatter, Stem, Spy, ScatterLines·pts | `(; index, x, y)` |
| `SegmentInteractable` | `:polyline` \| `:lines` \| `:segments` | Lines, Stairs, Series, ScatterLines·lines (`:lines`, one element per path); an explicit `mode=:polyline` vertex list stays `:polyline` (per edge); LineSegments, Errorbars, Rangebars, HLines, VLines (`:pairs`) | `:lines` `(; index)` (a series adds `label` when Makie set one); `:polyline` / `:segments` `(; segment_index)` |
| `RectInteractable` | `:rects` \| `:grid` | BarPlot, Hist, Waterfall, CrossBar, HSpan, VSpan (list); Heatmap, Image (grid) | grid `(; i, j, value)`; BarPlot/Waterfall `(; low, high, value)`; Hist `(; value, low, high)`; CrossBar `(; midpoint, low, high)`; HSpan/VSpan `(; low, high)` |
| `PolygonInteractable` | `:polygons` | Poly, Band, Pie, Density, Contourf, Violin, Voronoiplot | Band/Density/Voronoiplot `(; index)`; Contourf `(; low, high)`; Violin `(; x)` |
| `AxisInteractable` | `:axis` (unbounded) | the Axis area itself (linear + log) | `(; x, y)` inverted client-side |
| `ColorbarInteractable` *(M3)* | `:axis` (bounded bbox) | Colorbar — auto-extracted from `fig.content` | `(; value)` inverted client-side via `AxisTransform.valueaxis` |
| `LegendInteractable` *(M3)* | `:rects` | Legend — auto-extracted from `fig.content` | `(; label, group, targets)` — `targets` also ships as `HitLayer.links` |
| `TextInteractable` *(Phase 2 text labels)* | `:rects` | Text, Annotation (via `_descendant(p, Makie.Text)`) — data-space only | `(; text, index, x, y)` |
| `ViewInteractable` *(M4)* | `:view` | the Axis/Axis3 view itself — declared, never auto-extracted | none — commits nothing ([§12](12-gesture-channel.md) §12.3); in-drag frames stream over the gesture channel instead (`:cairo` PNG, `:webgl` serialized scene; #102/#133) |
| `ThresholdInteractable` *(M4)* | `:threshold` | a draggable horizontal/vertical line on an Axis — declared | a bare data scalar, not a `NamedTuple` (nothing to name) |
| `ROIInteractable` *(M4)* | `:roi` | a draggable box on an Axis — declared; an `AbstractSelector` | `(; xmin, xmax, ymin, ymax)`, or a `Vector{InteractionEvent}` of enclosed elements when `selects=` is set ([§5](05-bond-value.md)) |
| `SliceInteractable` | `:slice` (not a hit target) | declared 1-D series on an Axis, or Lines, Stairs, Series, Band, Density | none — hover samples client-side; the live tooltip is the probe coordinate plus one field per series id. Bond stamp `"none"` |

`SegmentInteractable` carries `mode ∈ {:polyline,:pairs}`; `RectInteractable` carries
`layout ∈ {:grid,:list}`. Same JS test, different Julia extractor. The three M4 drags are
declared against an axis rather than extracted from a plot, they are the only types whose
*declared* `events` is `(:drag,)` (`RegionInteractable`/`LegendInteractable`/`FunctionInteractable`
take a caller-supplied `events`, so an instance can carry it too). `ThresholdInteractable`/
`ROIInteractable` (which commit) have their release payload computed in the browser and converted
Julia-side rather than looked up in the manifest (`_computed_payload`, [§5](05-bond-value.md));
`ViewInteractable` never reaches that path at all, since it never commits. `:view` layers sort
last in the manifest so an ordinary drag wins over the catch-all pan/orbit gesture
([§6](06-composition.md), tension 2), and what
happens during any of these drags — as opposed to on release — is [§12](12-gesture-channel.md)'s contract.

**Text labels as click-to-pick buttons.** `TextInteractable` geometry comes from Makie's own
`Makie.string_boundingboxes(p)` — scene-local pixel space, y-up, bottom-left origin — converted
*directly* to image px (the same ×scaling + y-flip as `project`, but no `project` call: the boxes
are already pixel-space, not data-space, so there is nothing to project). A rotated label still
yields exactly one `:rects` box, expanded to stay axis-aligned (a looser hit target, not a new
geometry kind). The payload's `text`/`index` are the string and its 1-based per-label index;
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

**Declaration is the contract; plot-introspection is sugar on top of it.** Every interactable has
an explicit, data-space constructor (`PointInteractable(ax, points; payloads)`) — the contract every
subtype implements. `src/introspect.jl` adds one introspection constructor per supported Makie plot
type (`PointInteractable(ax, p::Makie.Scatter)`, `RectInteractable(ax, p::Makie.BarPlot)`), extracting
geometry and payload from the live plot object and delegating to the same explicit constructor — the
same struct, not a different code path. `PointInteractable(ax, p::Makie.Scatter)` is the usual
call: it derives the circle radius from the marker's drawn extent. The points constructor does
the same lookup when `radius` is omitted and exactly one `Scatter` on `ax` has those positions
(a recipe child counts). No match, or more than one, assumes Makie's default `:circle` at the
theme `markersize` instead of a fixed radius of 9.

**Composites emit multiple layers.** `ScatterLines` → one `:circles` layer + one `:lines` layer,
hit-tested points-first (within marker radius) then the whole line. This is the model for any composite recipe.

