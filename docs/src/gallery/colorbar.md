# Colorbar

`masque(fig)` finds a `Colorbar` in the figure and makes it a readout.
Hover over the bar to see the data value under the pointer. The layer
kind is `:axis`.

`masque(fig)` builds the [`ColorbarInteractable`](@ref) for you. Create
one yourself when you pass your own interactables to `masque`. See
[Read coordinates](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-colorbar" data-masque-embed="gallery_colorbar" title="Colorbar" style="width:100%;height:1100px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("gallery_colorbar")
```

## Variations

In a running notebook, a click gives a [`ColorbarEvent`](@ref), and
`pick.value` is the data value under the pointer.
`ColorbarInteractable` takes the bar and `id` only, so you cannot start
it at a given value. The heatmap cells are a separate layer: hovering
over a cell shows that cell's value, not the bar's.

!!! note

    The colorbar readout is the same on `:cairo` and `:webgl`. This
    example uses CairoMakie. Hover works on this page, but a click needs a
    running notebook: a colorbar click can be any value, so it cannot be
    recorded ahead of time. A `ViewInteractable` cannot pan or orbit a
    `Colorbar`.

