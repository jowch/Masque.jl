# Custom hits

Declare hit regions Makie did not plot as marks: a circle, a rect, and a
polygon over an image. Hold the pointer over a region to read its name.

**On this site:** overlay-only. For overlay versus `@bind` versus the
docs player, see [Overlay, Julia, and the host](@ref). For constructor
signatures, see [Constructors](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-custom-regions" title="Three RegionInteractable hits over an image, overlay-only"
        style="width:100%;height:480px;border:0;background:transparent;overflow:hidden;"
        scrolling="no" loading="lazy"></iframe>
</div>
<script>
(function () {
  var pretty = /\/$/.test(location.pathname) || /\/index\.html$/.test(location.pathname);
  var el = document.getElementById("masque-custom-regions");
  if (!el) return;
  function isDocDark() {
    var c = document.documentElement.className || "";
    if (!c) return false;
    if (/(^|\s)theme--(documenter-light|catppuccin-latte)(\s|$)/.test(c)) return false;
    return /(^|\s)theme--/.test(c);
  }
  function pushTheme() {
    var doc = el.contentDocument;
    if (!doc) return;
    doc.documentElement.classList.toggle("pluto-dark", isDocDark());
  }
  el.addEventListener("load", pushTheme);
  new MutationObserver(pushTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  el.src = (pretty ? "../embeds/" : "embeds/") + "custom_regions.html";
})();
</script>
```

## Draw regions Makie did not plot

[`RegionInteractable`](@ref) takes mixed shapes in one call. Each region is
one of:

```julia
(:circle,  (cx, cy), r)            # r is logical px × DPI
(:rect,    (cx, cy), w, h)         # w, h in data space
(:polygon, [(x, y), ...])          # a ring in data space
```

A triangle is a `:polygon`. Do not reach for
[`FunctionInteractable`](@ref) to hit a triangle.

Circle `r` is logical pixels times the figure scale (`r * ctx.scaling`),
the same formula as [`PointInteractable`](@ref)'s `radius`. It is not a
projected data-space radius. `r = 8` is eight logical pixels, not eight
data units on a wide axis. Rect `w`, `h` and polygon rings **are** data
space: Masque projects their corners.

`payloads` is required and must match `regions` 1:1. There is no
auto-generated default. `tooltip` takes the same three forms as other
element constructors (`nothing` / `masque"..."` / `false`). For more
information, see [Tooltips](@ref).

Masque groups regions by kind. Base `id = :cells` becomes `:cells_c`
(circles), `:cells_r` (rects), and `:cells_p` (polygons). Key
`selected=` on those suffixed ids, not on `:cells`.

Prerequisites: [Install](@ref) and [Getting started](@ref) cells in your
notebook.

```julia
begin
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "y")
    img = [Float32(sin(i / 12) * cos(j / 10)) for i in 1:100, j in 1:100]
    image!(ax, img)

    regions = [
        (:circle, (20.0, 20.0), 14.0),
        (:rect, (60.0, 60.0), 20.0, 14.0),
        (:polygon, [(30.0, 70.0), (50.0, 90.0), (20.0, 90.0)]),
    ]
    payloads = [
        (; name = "cell A"),
        (; name = "cell B"),
        (; name = "cell C"),
    ]
    cells = RegionInteractable(
        ax; regions, payloads, id = :cells,
        tooltip = masque"<b>$(name)</b>",
    )
end
```

```julia
@bind pick masque(fig, cells)
```

Do not pass `selected = Dict(:cells => [1])`. Use `:cells_c`, `:cells_r`,
or `:cells_p` for the kind you hydrated. Each split layer commits an
[`ElementEvent`](@ref).

## FunctionInteractable

Use this after [Constructors](@ref), when [`RegionInteractable`](@ref)
cannot express the geometry (`:segments`, `:grid`, or layers on more
than one axis). The constructor is `FunctionInteractable(f;
events = (:click, :hover))`. There is no `ax` and no `id`. `f` receives
the figure's [`InteractionContext`](@ref) and must return
`Vector{HitLayer}`. Layer ids live on those [`HitLayer`](@ref)s.

Do not copy `FunctionInteractable(ax, f; id)` — that signature is not
shipped.

Replace the previous `fig` and `@bind pick` cells.

Project data-space points with [`data_to_image_px`](@ref). Look up an
axis transform with `Masque.axis_id(ctx, ax)` (not exported — qualify
it). `:segments` geometry is a flat `[x1, y1, x2, y2, …]` vertex list in
image pixels, disjoint pairs, one payload per pair.

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

`f` can emit one `HitLayer` per axis because `ctx` covers the whole
figure. Each layer uses the bond type of its kind; the default is
[`ElementEvent`](@ref). Prefer [`RegionInteractable`](@ref) when the
shape is a circle, rect, or polygon. For the `HitLayer` field list, see
[API](@ref).

## A custom interactable

Subtype [`AbstractInteractable`](@ref) to own the hits and the bond type.
[`FunctionInteractable`](@ref) maps each layer's kind onto a built-in
event. A commit that is not one of those types is a struct of your own,
subtyping [`InteractionEvent`](@ref).

Every subtype implements [`hitlayers`](@ref). The default
[`bondtype`](@ref) is [`ElementEvent`](@ref); a type that only wants
that event writes `hitlayers` and inherits the rest. Implement
`bondtype` and [`transform_bond`](@ref) when the commit is another type.

This example hits a scatter of cities and commits a `CityPick`. `index`
arriving at `transform_bond` is already 1-based for `:circles`. `layer`
is a [`HitLayer`](@ref); annotate it so this method is not ambiguous
with the default. `js_payload` is unused: the event is built from the
struct. Names on that struct are how you read the pick. Field forwarding
applies only to [`ElementEvent`](@ref) and [`LegendEvent`](@ref).

Define the types in their own cell so a figure rebuild does not
redefine them.

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

Replace the previous `fig` and `@bind pick` cells.

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

Circle `r` is logical pixels times the figure scale (`8 * ctx.scaling`),
the same formula as [`PointInteractable`](@ref)'s `radius`. Project
data-space points with [`data_to_image_px`](@ref). Look up an axis
transform with `Masque.axis_id(ctx, ax)` (not exported — qualify it).
Extend the methods as `Masque.hitlayers`, `Masque.bondtype`, and
`Masque.transform_bond`.
