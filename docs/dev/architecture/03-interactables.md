# 3. The interactable seam — `AbstractInteractable`

Every interactable — built-in or user-authored — implements one contract. The framework never
special-cases built-ins; `PointInteractable` is the first public implementation.

```julia
abstract type AbstractInteractable end

# REQUIRED: compact, image-px hit geometry. Usually one layer; composites (ScatterLines) return more.
hitlayers(i::AbstractInteractable, ctx::InteractionContext)::Vector{HitLayer}

# OPTIONAL (defaulted; non-exported — extend as `Masque.<name>`):
validate(::AbstractInteractable, ::InteractionContext)::Union{Nothing,String} = nothing   # fail loud
events(::AbstractInteractable)::Tuple = (:click, :hover)   # which events the overlay wires
# per-LAYER tooltip: nothing → auto-table, Markup → template, false → suppress. Built-ins set it
# from the `tooltip` constructor kwarg. See §10 Tooltips.
tooltip_spec(::AbstractInteractable) = nothing
# hoverstyle is per-LAYER too — the manifest ships one `style` per layer, not per element.
# stroke=nothing (default) omits "stroke" from the manifest; the overlay then draws its own
# split highlight — a color-dodge fill (brightens) plus a flat chrome edge stroke
# (#7a7a7a light figure, #c8c8c8 dark; not blended into the mark). `colors` does not feed the
# highlight, only the tooltip accent. An explicit stroke is used verbatim (no blend, one element).
hoverstyle(::AbstractInteractable)::NamedTuple = (; stroke=nothing, width=2)
# logical-px hit slack for :segments/:polyline/:lines; nothing omits the manifest field
hit_tol(::AbstractInteractable) = nothing
```

`AbstractSelector <: AbstractInteractable` subtypes (today `ROIInteractable`) additionally
implement `selects(i)` (the target layer id or `nothing`) and `compatible_kinds(i)` (the target
`HitLayer.kind`s the selector accepts; an unlisted kind is a build-time `ArgumentError`).

**`validate` is per-capability, not a global scale gate.** Element interactables
(Point/Segment/Rect/Polygon/Text) are projected **in Julia** via `Makie.project`, so they impose
**no axis-scale restriction** — they work on any scale Makie can project (linear, log, symlog, …).
Only the types that rely on **client-side** pixel→data inversion — `AxisInteractable`,
`ColorbarInteractable`, `ThresholdInteractable`, `ROIInteractable`, `SliceInteractable`, and
`ViewInteractable`'s 2-D pan — restrict to the scales the JS `invert` implements
(`_JS_INVERTIBLE`: identity, log10, log; categorical rides the shipped category map where the type
supports it). The same `validate` methods refuse `Axis3` (`is3d`) and `PolarAxis` (`ispolar`)
where inversion is undefined or not serialized ([§2](02-backends.md)); `ViewInteractable` accepts
`Axis3` as an orbit. Default `validate` stays permissive.

## `HitLayer` — the serialized unit (per interactable, per kind)

The unit is a **layer**, not a single element, because two surfaces need compact *geometry*
that a flat per-element list can't give: a 1000×1000 **heatmap grid** (ship edges, not 10⁶ rects) and
a **polyline** (ship vertices once, hit-test segments in JS). A layer is one geometry *kind* plus the
data to resolve a hit to an element index and its payload.

> **The grid is compact in geometry.** The edges are O(source cells along one side). The values
> follow the screen: the full source matrix when a cell is at least one screen pixel, and one
> source value per screen pixel of the axis viewport when cells are smaller ([§8](08-scaling.md)).
> On either branch a matrix that is not real-valued ships edges only. A 2000²–4000²
> `heatmap!`/`image!` does not ship the source matrix.

```julia
struct HitLayer
    id       :: Symbol            # stable key for this layer (links to events/style)
    kind     :: Symbol            # :circles | :polyline | :lines | :segments | :rects | :grid | :polygons | :axis
                                  #   | :threshold | :roi | :view | :slice
    geometry :: Any               # compact, image-px; layout keyed by `kind` (see below)
    payloads :: Vector{Any}       # element index -> JSON-serializable payload (the linkage key)
    axis     :: Symbol            # which AxisTransform applies (for data-coord tooltips / inversion)
    events   :: Tuple             # copied from the interactable
    label    :: Union{Nothing,String}  # optional screen-reader announcement prefix (keyboard nav, §11)
    colors   :: Any                # optional per-element tooltip accent (§10.4)
    links    :: Union{Nothing,Vector{Vector{Symbol}}}  # optional per-element cross-layer highlight (LegendInteractable)
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
| `:polygons` | one flat ring per element, or a list of rings when that element has holes (exterior, then each hole) | even-odd across that element's rings | element index |
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

The three drag kinds — `:view`, `:threshold`, `:roi` — sit outside this set. They are
*control* geometry: one draggable region apiece, no elements, an empty `payloads`. The closed-set
claim covers data geometry projected from a Makie surface. `:slice` sits outside hit testing
too: `hitLayer` returns null. The layer carries data-space series for the client to sample,
not a region. Its `crosshair` and `orientation` fields tell the overlay whether to draw
one hair, and which arm. A plot with no slice draws none.

## Built-in interactables

Twelve built-in types, plus the two custom-interaction types of [§4](04-custom-interactions.md)
(`RegionInteractable`, `FunctionInteractable`). Roughly one type per hit primitive, with the
exceptions noted inline: `:axis` is shared by two, `LegendInteractable` and `TextInteractable`
reuse `:rects`, and the three drags each own a kind no other type produces. The "Makie surfaces"
column is what `auto_interactables` (`src/introspect.jl`) extracts; the user-facing version of
this table is `docs/src/support.md`.

| Type | kind(s) | Makie surfaces | payload |
|---|---|---|---|
| `PointInteractable` | `:circles` | Scatter, MeshScatter (3-D), Stem·pts, ScatterLines·pts | `(; index, x, y)` |
| `SegmentInteractable` | `:polyline` \| `:lines` \| `:segments` | Lines, Stairs, Series, ScatterLines·line (`:lines`, one element per path); an explicit `mode=:polyline` vertex list stays `:polyline` (per edge); LineSegments, Errorbars, Rangebars, HLines, VLines, Stem·stems, Wireframe, Arrows3D (`:pairs` → `:segments`) | `:lines` `(; index)` (a series adds `label` when Makie set one); `:polyline` / `:segments` `(; segment_index)`; Arrows3D `(; index, x, y, z, u, v, w)` |
| `RectInteractable` | `:rects` \| `:grid` | BarPlot, Hist, Waterfall, CrossBar, HSpan, VSpan, Spy, BoxPlot (un-notched) (list); Heatmap, Image (grid) | grid `(; i, j, value)`; BarPlot/Waterfall `(; low, high, value)`; Hist `(; value, low, high)`; CrossBar `(; midpoint, low, high)`; HSpan/VSpan `(; low, high)`; BoxPlot `(; q1, median, q3)`; Spy `(; index)` |
| `PolygonInteractable` | `:polygons` | Poly, Band, Density, Contourf, Violin, Voronoiplot, BoxPlot (notched) | Band/Density/Voronoiplot `(; index)`; Contourf `(; low, high)`; Violin `(; x)` |
| `AxisInteractable` | `:axis` (unbounded) | the Axis area itself (linear + log) — declared | `(; x, y)` inverted client-side |
| `ColorbarInteractable` | `:axis` (bounded bbox) | Colorbar — auto-extracted from `fig.content` | `(; value)` inverted client-side via `AxisTransform.valueaxis` |
| `LegendInteractable` | `:rects` | Legend — auto-extracted from `fig.content` | `(; label, group, targets)` — `targets` also ships as `HitLayer.links` |
| `TextInteractable` | `:rects` | Text, Annotation (via `_descendant(p, Makie.Text)`) — data-space only | `(; text, index, x, y)` |
| `ViewInteractable` | `:view` | the Axis/Axis3 view itself — declared, never auto-extracted | none — commits nothing ([§12](12-gesture-channel.md) §12.3); in-drag frames stream over the gesture channel instead (`:cairo` PNG, `:webgl` serialized scene) |
| `ThresholdInteractable` | `:threshold` | a draggable horizontal/vertical line on an Axis — declared | a bare data scalar, not a `NamedTuple` (nothing to name) |
| `ROIInteractable` | `:roi` | a draggable box on an Axis — declared; an `AbstractSelector` | `(; xmin, xmax, ymin, ymax)`, or a `Vector{ElementEvent}` of enclosed elements (`GridWindowEvent` on a grid) when `selects=` is set ([§5](05-bond-value.md)) |
| `SliceInteractable` | `:slice` (not a hit target) | declared 1-D series on an Axis, or Lines, Stairs, Series, Band, Density — declared, never auto-extracted | none — hover samples client-side; the live tooltip is the probe coordinate plus one field per series id. Bond stamp `"none"` |

Layer ids are the plot kind (`:scatter`, `:lines`, `:cells`, `:bars`, `:poly`, …, `:colorbar`,
`:legend`), suffixed `_2`, `_3`, … when a kind repeats; a composite's second layer takes a suffix
(`:stem_stems`, `:scatterlines_line`). On `Axis3` only Scatter/Lines/LineSegments/MeshScatter/
Wireframe/Arrows3D extract; on `PolarAxis` only Scatter/Lines/LineSegments/ScatterLines/Series.
Other kinds on those axes are skipped with a warning.

**Unknown recipes: the child walk.** A plot type with no branch of its own is not skipped
outright. `auto_interactables` walks its `plots` children and installs each child it knows,
stopping at the first known one so a mark becomes one layer (`rainclouds!` yields `:violin`,
`:scatter`, `:boxplot`, not also the violin's `:poly`). So `arc!` and `contour!` become `:lines`,
`ablines!` becomes `:segments`, and `pie!` becomes `:poly`, under the child's layer id. Invisible
children (`triplot!`'s ghost edges) are not layers, an empty construct (`qqplot!` with
`qqline = :none`) takes no id, and a child whose geometry is not data-space is refused
(`hexbin!`'s data-space marker Scatter, `bracket!`'s pixel-space Series). Only a parent that
yields nothing warns, and the warning names that parent.

`SegmentInteractable` carries `mode ∈ {:polyline,:pairs}`; `RectInteractable` carries
`layout ∈ {:grid,:list}`. Same JS test, different Julia extractor. The three drags are
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
figure-block walk `ColorbarInteractable` uses, not the plot-scene walk; see `roadmap.md`.

**Legend entries and `links`.** `LegendInteractable` turns a `Makie.Legend` block's entries into
`:rects` hit regions, auto-extracted by the same figure-block walk as `ColorbarInteractable`. Each
entry's pixel row is recovered by walking `leg.grid` (GridLayoutBase) for the 2-column shade `Box`
Makie's own click-to-toggle hit-tests (`makie_compat.jl`'s `_legend_entries`/`_legend_bbox`); the
entry↔plot link comes from `Makie.get_plots` on the entry's elements, the same linkage Makie's
built-in legend interaction uses. This is why `HitLayer` has its one cross-layer field, `links` —
one id-list per element, naming other layers to highlight together with the hovered/selected one
(serialized as `"links"`, an array of string-id arrays). Each spec is a layer id (every element of
that layer) or `id:k` pinning element `k` (1-based); auto-extracted `series!` legend entries use
the pin so each swatch lights one trace of the parent `:lines` layer. `build_manifest` validates
every `links` spec against the manifest's own layers: an unknown id or an out-of-range `k` is
always a build-time `ArgumentError`; a target whose `kind` cannot be highlighted (not in
`_SELECTED_KINDS`, [§5](05-bond-value.md)'s `selected=` list) is an `ArgumentError` for an explicit
`targets=` but is warned and dropped for an auto-resolved (plotmap-derived) one, since an
unlinkable plot in the same legend (a heatmap) is a normal shape. Custom legends
(`LineElement`/`MarkerElement`/`PolyElement` built without `plots=`) resolve to empty links —
still hittable, no highlight — unless the caller passes `targets=`. Legend layers sort first in the
manifest ([§6](06-composition.md), tension 2).

**Slice and crosshair.** A hairline is opt-in: `masque(fig)` does not draw one, and neither does
an axis readout, a grid cell, or empty axis interior. `SliceInteractable` is not a hit target. It
samples attached 1-D series in data space (piecewise linear, then `projectAxis`) and, when
`crosshair=true` (the default), draws the one arm named by `orientation` on `svg.masque-plain`.
`crosshair=false` keeps the filled dots and the sample tooltip and draws no hair. The tooltip is
the tracked series while the pointer is over a covered layer or empty axis interior inside the
support; a marker that is not covered keeps its own. Series vertices ship as Float64, not integer
pixels.

**Bar payload schema.** All `:rects`-list bar/span surfaces (BarPlot, Waterfall,
Hist, CrossBar, HSpan, VSpan) use a shared semantic payload — `InteractionEvent.index` carries the element index, so payloads contain only
domain values (no redundant `index` field). **Span viewport-clamp:** HSpan/VSpan hit-rects are
clipped to the owning axis's pixel viewport so a span cannot bleed into a neighboring axis in a
multi-axis figure. **Uniform payload-length validation:** `SegmentInteractable`,
`RectInteractable`, and `PolygonInteractable` all call `_check_payloads` at construction;
a `payloads=` vector of the wrong length throws `ArgumentError` immediately (fail-loud, same
guarantee as `PointInteractable` / `RegionInteractable`).

**Polygon payload schema.** The six auto-extracted polygon surfaces each carry a
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

