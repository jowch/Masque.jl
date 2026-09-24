# Custom hits

Sometimes the thing you want people to click is not a mark Makie drew:
regions of interest on a microscope image, zones on a map, the arms of a
diagram. Sometimes it is, but a click should return something richer
than an [`ElementEvent`](@ref). Masque has three levels for this, each
more work and more control than the last:

1. [`RegionInteractable`](@ref) — list circles, rectangles, and polygons
   placed in data coordinates. Enough for most cases.
2. [`FunctionInteractable`](@ref) — compute hit geometry yourself from
   the figure's layout, for shapes the first level cannot express.
3. A subtype of [`AbstractInteractable`](@ref) — also choose what a
   click returns, with an event type of your own.

None of them draws anything: the figure is still whatever Makie drew,
and a custom interactable only says where the pointer can hit and what
each hit means. Draw a visible outline with Makie if the regions should
be visible.

## Regions over a figure

Pass a list of shapes and one payload per shape. Hovering a region shows
its payload, and a click returns an [`ElementEvent`](@ref) that carries
the payload's fields (`pick.name`):

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-custom-regions" data-masque-embed="custom_regions" title="Three RegionInteractable hits over an image, overlay-only" style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("custom_regions")
```

Each region is one of

```julia
(:circle,  (cx, cy), r)            # r in logical pixels
(:rect,    (cx, cy), w, h)         # w, h in data space
(:polygon, [(x, y), ...])          # a ring in data space
```

Rectangles and polygons are in data coordinates, so they stay on the
features they outline. A circle's centre is in data coordinates too, but
its radius is in logical pixels, like a scatter marker's size: `r = 8`
is an eight-pixel target however wide the axis is. Pass the logical
size; Masque scales it for the figure's resolution itself. `payloads` is required — a region
has no data of its own — and `tooltip` works as elsewhere (see
[Tooltips](@ref)).

Masque groups the regions by shape, so one `RegionInteractable` with
`id = :cells` produces up to three layers: `:cells_c` (circles),
`:cells_r` (rectangles), and `:cells_p` (polygons). `pick.layer` reports
those ids, and `selected=` uses them.

## Compute hit geometry

When the shapes are not circles, rectangles, or polygons — a set of line
segments, say, or regions on several axes at once — build the hit layers
yourself. [`FunctionInteractable`](@ref) takes a function that receives
the figure's [`InteractionContext`](@ref) and returns a vector of
[`HitLayer`](@ref)s. [`data_to_image_px`](@ref) converts a data point on
an axis to the image pixels the overlay works in, and
`Masque.axis_id(ctx, ax)` names the axis a layer belongs to.

```julia
begin
    fig = Figure()
    ax = Axis(fig[1, 1])
    verts = [(0.0, 0.0), (2.0, 1.0), (3.0, 2.0), (5.0, 0.5)]
    linesegments!(
        ax, first.(verts), last.(verts);
        color = :firebrick, linewidth = 4,
    )

    track = FunctionInteractable() do ctx
        geom = Float64[]
        for p in verts
            q = data_to_image_px(ctx, ax, p)
            push!(geom, q[1], q[2])
        end
        nseg = length(verts) ÷ 2
        [
            HitLayer(
                :track,
                :segments,
                geom,
                [(; i = k) for k in 1:nseg],
                Masque.axis_id(ctx, ax),
                (:click, :hover),
            ),
        ]
    end
end
```

```julia
@bind pick masque(fig, track)
```

Each layer's `geometry` is in image pixels, laid out according to its
kind — a flat vector for most kinds, a vector of paths or rings for
`:lines` and `:polygons`:

| Kind | `geometry` | One element is |
|---|---|---|
| `:circles` | `[cx, cy, r, cx, cy, r, …]` | one circle |
| `:segments` | `[x0, y0, x1, y1, …]` | one segment (a pair of points) |
| `:polyline` | `[x, y, x, y, …]` (`NaN` starts a gap) | one edge between consecutive points |
| `:lines` | a vector of paths, each `[x, y, …]` | one whole path |
| `:rects` | `[cx, cy, w, h, …]` | one rectangle |
| `:polygons` | one ring `[x, y, …]` per element, or `[exterior, hole, …]` for an element with holes | one polygon |

Heatmap-style `:grid` layers use a different, edge-based layout; build
those with [`RectInteractable`](@ref)'s `grid=` keyword rather than by
hand. `payloads` has one entry per element. A click on a layer returns an
[`ElementEvent`](@ref), with the payload's fields on it. Because the
function sees the whole figure, one `FunctionInteractable` can return
layers on several axes.

## A custom interactable

To make a click return a struct of your own, subtype
[`AbstractInteractable`](@ref) and implement three methods:
[`hitlayers`](@ref) (the hit geometry, as above), [`bondtype`](@ref)
(the type a click produces), and [`transform_bond`](@ref) (build that
value from the clicked element). The event type subtypes
[`InteractionEvent`](@ref). Put the type definitions in their own cell,
so rebuilding the figure does not redefine them:

```julia
begin
    struct CityPick <: InteractionEvent
        layer::Symbol
        index::Int
        city::String
        pop::Int
    end

    struct Cities <: AbstractInteractable
        ax
        pts
        rows
        id::Symbol
    end

    Masque.bondtype(::Cities) = CityPick

    function Masque.hitlayers(i::Cities, ctx)
        geom = Float64[]
        for p in i.pts
            q = data_to_image_px(ctx, i.ax, p)
            r = 8 * ctx.scaling
            push!(geom, q[1], q[2], r)
        end
        [
            HitLayer(
                i.id,
                :circles,
                geom,
                Vector{Any}(i.rows),
                Masque.axis_id(ctx, i.ax),
                (:click, :hover),
            ),
        ]
    end

    function Masque.transform_bond(i::Cities, layer::HitLayer, index, js_payload)
        row = i.rows[index]
        CityPick(i.id, index, row.city, row.pop)
    end
end
```

```julia
begin
    fig = Figure()
    ax = Axis(fig[1, 1]; xlabel = "lon", ylabel = "lat")
    rows = [
        (; city = "Tokyo", pop = 37),
        (; city = "Delhi", pop = 32),
        (; city = "Shanghai", pop = 27),
    ]
    pts = [(139.7, 35.7), (77.2, 28.6), (121.5, 31.2)]
    scatter!(ax, first.(pts), last.(pts); markersize = 16)
    cities = Cities(ax, pts, rows, :cities)
end
```

```julia
@bind pick masque(fig, cities)
```

```julia
pick === nothing ? "click a city" : "$(pick.city), $(pick.pop) million"
```

`index` arrives at `transform_bond` already 1-based. A type that is
happy with the default [`ElementEvent`](@ref) only needs
[`hitlayers`](@ref).
