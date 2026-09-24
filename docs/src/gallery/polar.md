# Polar points

Four scatter points on a `PolarAxis`. Hover for the default tooltip.
Click for an `ElementEvent`: `index` is 1-based, `x` is θ, and `y` is
r. `masque(fig)` names the layer `:scatter`.

Polar is not a WebGL-only feature. See [Click marks](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-polar" data-masque-embed="gallery_polar" title="Polar points" style="width:100%;height:1320px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("gallery_polar")
```

## Variations

Continuous θ/r readout, the way an `AxisInteractable` reports `(x, y)`,
is not shipped. A click in empty space does not produce an event.
`ViewInteractable` on a `PolarAxis` raises `ArgumentError`.

!!! note

    Discrete point hits match on `:cairo` and `:webgl`. This player is the
    Cairo figure, including the listed clicks. `heatmap!` and `barplot!` on
    a `PolarAxis` are skipped with `@warn` on both backends. Load
    `WGLMakie` alone when the polar figure should be a live canvas; the
    hits do not change.

