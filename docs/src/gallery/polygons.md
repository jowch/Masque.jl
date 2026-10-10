# Polygons

Hover over a region to see its payload. `masque(fig)` alone makes these
filled areas respond: `band!`, `density!`, `contourf!`, `violin!`,
`voronoiplot!`, and `boxplot!`.

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

When your shapes did not come from one of those recipes, pass in their
rings yourself with a `PolygonInteractable`:

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

A click sets the `regions` field of the `@bind` value to an
`ElementEvent` with `index` and the payload fields, so its `shape` is
`"triangle"` or `"square"`.

Next, [Text labels](@ref) makes labels clickable.
