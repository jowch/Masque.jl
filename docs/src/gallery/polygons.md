# Polygons

`masque(fig)` also picks up filled areas: `band!`, `density!`,
`contourf!`, `violin!`, `voronoiplot!`, and `boxplot!`, with no
`PolygonInteractable` written by hand. Hover over a region to see its
payload.

For a `poly!` you made from rings, see [Click marks](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-polygons" data-masque-embed="gallery_polygons" title="Polygons" style="width:100%;height:1480px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("gallery_polygons")
```

## Variations

Pass the rings yourself when the shapes did not come from one of those
recipes:

```julia
rings = [
    [(0.0, 0.0), (1.0, 0.0), (0.5, 1.0)],
    [(2.0, 0.0), (3.0, 0.0), (3.0, 1.0), (2.0, 1.0)],
]
PolygonInteractable(
    ax, rings;
    id = :regions,
    payloads = [(shape = "triangle",), (shape = "square",)],
)
```

A click gives an `ElementEvent` with `index` and the payload fields.

!!! note

    `masque(fig)` picks up these filled areas the same way on `:cairo`
    and `:webgl`, and a `PolygonInteractable` you write yourself responds
    the same way on both. This example uses CairoMakie and has no cell
    that uses a click. On a `PolarAxis`, `masque(fig)` skips these
    filled areas with a warning.
