# Polar points

Four scatter points on a `PolarAxis`. Hover over a point to see the
default tooltip, and click it to get an [`ElementEvent`](@ref): `index`
is the point's position in your data, `x` is θ, and `y` is r.
`masque(fig)` names the layer `:scatter`.

Polar axes work with CairoMakie as well as WGLMakie. See
[Click marks](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-polar" data-masque-embed="gallery_polar" title="Polar points" style="width:100%;height:1320px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("gallery_polar")
```

## Variations

A polar axis has no readout for empty space, like the `(x, y)` an
`AxisInteractable` gives on a 2D axis: a click in empty space gives no
event. `ViewInteractable` on a `PolarAxis` raises `ArgumentError`.

!!! note

    Points respond the same way on `:cairo` and `:webgl`. This example
    uses CairoMakie, and every click was recorded ahead of time.
    `masque(fig)` skips `heatmap!` and `barplot!` on a `PolarAxis` with a
    `@warn`, on both backends. Load only `WGLMakie` when the polar figure
    should be a live canvas; the points respond the same way.
