# Custom hits

You can make parts of a figure respond to hover and click where Makie
drew no mark, such as regions of interest on a microscope image, zones
on a map, or the arms of a diagram. You can also make a click return a
type of your own instead of an [`ElementEvent`](@ref). There are three
ways, each more work and more control than the last:

1. [`RegionInteractable`](@ref): list circles, rectangles, and polygons
   in data coordinates. This is enough for most cases.
2. [`FunctionInteractable`](@ref): compute the shapes yourself from the
   figure's layout, for other shapes or for regions on several axes.
3. A subtype of [`AbstractInteractable`](@ref): also choose what a click
   returns, with an event type of your own.

## Regions over a figure

Pass a list of shapes and one payload per shape. Hovering over a region
shows its payload in the tooltip. A click returns an
[`ElementEvent`](@ref) with the payload's fields, such as `pick.name`:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-custom-regions" data-masque-embed="custom_regions" title="Three named regions over an image. Hover or click one." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
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
features they outline. A circle's center is in data coordinates too, but
its radius is in pixels, like a scatter marker's size: `r = 8` is an
eight-pixel target however wide the axis is, and you do not need to
adjust `r` for the figure's resolution. A region has no data of its
own, so `payloads` is required. `tooltip` works as it does for any
other plot; see [Tooltips](@ref).

The regions are not drawn on the figure, so only the hover highlight
shows where one is. To show them all the time, draw their outlines with
Makie.

Each kind of shape gets its own layer id, which is what `pick.layer`
reports and what `selected=` takes. With `id = :cells`, circles are
`:cells_c`, rectangles are `:cells_r`, and polygons are `:cells_p`.

## Compute hit geometry

For other shapes, such as line segments, you build the layers yourself
with a [`FunctionInteractable`](@ref). It takes a function that
receives the figure's [`InteractionContext`](@ref) and returns a vector
of [`HitLayer`](@ref)s, and because that function sees the whole
figure, one `FunctionInteractable` can return layers on several axes.
A layer's shapes are in image pixels, so convert each data point with
[`data_to_image_px`](@ref), and name the axis a layer belongs to with
`Masque.axis_id(ctx, ax)`.

```julia
begin
    fig = Figure()
    ax = Axis(fig[1, 1])
    xs = [0.0, 2.0, 3.0, 5.0]
    ys = [0.0, 1.0, 2.0, 0.5]
    linesegments!(ax, xs, ys; color = :firebrick, linewidth = 4)

    track = FunctionInteractable() do ctx
        geom = Float64[]
        for k in 1:4
            q = data_to_image_px(ctx, ax, (xs[k], ys[k]))
            push!(geom, q[1], q[2])
        end
        [
            HitLayer(
                :track,
                :segments,
                geom,
                [(; segment = 1), (; segment = 2)],
                Masque.axis_id(ctx, ax),
                (:click, :hover),
            ),
        ]
    end
end
```

```julia
@bind pick masque(fig, track; auto = false)
```

`auto = false` leaves out the layer `masque` would add for the
`linesegments!` plot itself, so each segment responds once, through
`track`.

How a layer's `geometry` is laid out depends on the layer's kind: it
is a flat vector of image pixels for most kinds, and a vector of paths
or rings for `:lines` and `:polygons`:

| Kind | `geometry` | One element is |
|---|---|---|
| `:circles` | `[cx, cy, r, cx, cy, r, …]` | one circle |
| `:segments` | `[x0, y0, x1, y1, …]` | one segment (a pair of points) |
| `:polyline` | `[x, y, x, y, …]` (`NaN` starts a gap) | one edge between consecutive points |
| `:lines` | a vector of paths, each `[x, y, …]` | one whole path |
| `:rects` | `[cx, cy, w, h, …]` | one rectangle |
| `:polygons` | one ring `[x, y, …]` per element, or `[exterior, hole, …]` for an element with holes | one polygon |

Heatmap-style `:grid` layers use a different layout, based on cell
edges, so build them with [`GridInteractable`](@ref) instead.

In the kinds above, a layer's `payloads` has one entry per element, and a click
returns an [`ElementEvent`](@ref) with that entry's fields.

## A custom interactable

To make a click return a struct of your own, subtype
[`AbstractInteractable`](@ref) and implement three methods:
[`hitlayers`](@ref) (the shapes, as above), [`bondtype`](@ref) (the
type a click produces), and [`transform_bond`](@ref) (build that value
from the clicked element). Make your event type a subtype of
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
    scatter!(ax, [139.7, 77.2, 121.5], [35.7, 28.6, 31.2]; markersize = 16)
    cities = Cities(ax, pts, rows, :cities)
end
```

```julia
@bind pick masque(fig, cities; auto = false)
```

`auto = false` leaves out the layer `masque` would add for the scatter
itself, so a click on a city reaches `cities` and returns a `CityPick`.

```julia
isnothing(pick) ? "click a city" : "$(pick.city), $(pick.pop) million"
```

`ctx.scaling` is the number of image pixels per logical pixel, so in
`hitlayers`, `8 * ctx.scaling` is a radius of eight logical pixels, the
unit of a scatter's `markersize`.

In `transform_bond`, `index` is the clicked element's position in the
layer's payloads, so `i.rows[index]` is its row. If the default
[`ElementEvent`](@ref) is enough, implement only [`hitlayers`](@ref).

For the other methods a custom interactable can implement, see
[`AbstractInteractable`](@ref).
