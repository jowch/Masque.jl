# Polygons

`masque(fig)` also picks up filled areas: `band!`, `density!`,
`contourf!`, `violin!`, `voronoiplot!`, and `boxplot!`. Hover a region
to read its payload. Nothing here is wired with `PolygonInteractable`.

For a `poly!` you authored as a ring, see [Click marks](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-polygons" data-masque-embed="gallery_polygons" title="Polygons" style="width:100%;height:1480px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("gallery_polygons")
```

## Variations

Pass the rings yourself when the geometry did not come from one of
those recipes:

```julia
PolygonInteractable(
    ax, rings;
    id = :regions,
    payloads = [(; index = k, shape = "ring$k") for k in eachindex(rings)],
)
```

The bond is an `ElementEvent` with `index` and the payload fields.

!!! note

    These filled-area recipes extract the same way on `:cairo` and
    `:webgl`. This player is the Cairo figure. Hover is overlay-only on the
    static page. A manual `PolygonInteractable` is the same hit on both
    backends. `heatmap!` on a `PolarAxis` is skipped with `@warn`; it is not
    a polygon layer.

