# 4. Custom interactions — same infra, three ergonomic tiers

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
FunctionInteractable(f; events=(:click,:hover))   # f(ctx)::Vector{HitLayer}; ids and axes are f's own
```

**Tier C — full struct.** Implement `hitlayers` (+ optional `validate`/`events`/`hoverstyle`/
`hit_tol`, and `bondtype`/`transform_bond` for a non-element commit, [§5](05-bond-value.md)). A user
struct is *indistinguishable* from a built-in — same manifest path, same overlay, same `@bind`. Tooltip
content comes from the per-layer `Masque.tooltip_spec(interactable)` seam (built-in interactables expose it
as a `tooltip=` constructor kwarg; a custom struct overrides `Masque.tooltip_spec`). The `tooltip_*` kwargs
on `masque()` are styling only. See [§10](10-tooltips.md) Tooltips. Example:

```julia
struct CityInteractable <: AbstractInteractable
    ax; positions::Vector{Point2f}; names::Vector{String}; radius::Float32
end
function Masque.hitlayers(c::CityInteractable, ctx)
    coords = Float32[]; for p in c.positions
        q = data_to_image_px(ctx, c.ax, p); append!(coords, (q[1], q[2], c.radius*ctx.scaling))
    end
    [HitLayer(:cities, :circles, coords, [(; name=n) for n in c.names],
              Masque.axis_id(ctx, c.ax), (:click,:hover))]
end
# tooltip content: add a `tooltip` field to CityInteractable and override
# `Masque.tooltip_spec(c::CityInteractable) = c.tooltip` — see §10 Tooltips
```

**Linkage = shared payloads through Pluto reactivity.** Two interactables writing the same payload field
into the same `@bind` variable *are* linked brushing — the Pluto reactive graph is our
`ColumnDataSource`. No central mutable selection store is introduced; that's the whole point of the
no-server architecture.

**No tier supplies rendering.** All three declare *geometry* — where the regions are and what
payload each carries. What gets drawn belongs to Makie (the base frame) or to the overlay's fixed
chrome — highlights and the ROI box (`frontend/src/mount.ts`), tooltips ([§10](10-tooltips.md)). An interaction
that recomputes a preview frame in Julia during a gesture ([§12](12-gesture-channel.md)) needs a fourth tier supplying
rendering as well as geometry. That
tier is the extension point; no API is specified here, and nothing in [§12](12-gesture-channel.md) depends on one. See
[§12.9](12-gesture-channel.md#129-prerequisites-for-a-user-facing-surface).

