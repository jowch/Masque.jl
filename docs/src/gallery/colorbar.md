# Colorbar

`masque(fig)` finds a `Colorbar` in the figure layout and adds a
readout. Hover the bar for the data value under the pointer. A click in
a live notebook round-trips a `ColorbarEvent` with `value`. The layer
kind is `:axis`.

`masque(fig)` builds that [`ColorbarInteractable`](@ref) for you. Write
one yourself when you are not using `masque(fig)`. See
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

A click is a [`ColorbarEvent`](@ref). `pick.value` is the data value
under the pointer. `ColorbarInteractable` takes the bar and `id` only,
so there is no `value=` to reopen a position. The heatmap cells are a
separate layer. Hovering a cell is the grid readout, not the bar.

!!! note

    The colorbar readout is the same on `:cairo` and `:webgl`. This player
    is the Cairo figure. Hover works here; the click bond is a live
    notebook, because a colorbar click is a value rather than a listed
    mark. `Colorbar` is not a pan or orbit target.

