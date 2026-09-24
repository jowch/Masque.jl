# Bars and areas

`masque(fig)` walks the figure and picks up histogram bins, waterfall
bars, crossbar ranges, bar plots, and horizontal and vertical spans. No
interactable is written by hand. Hover a bar, a band, or a range.

The four panels are one widget. For a single `barplot!`, see
[Click marks](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-bars" data-masque-embed="gallery_bars" title="Bars and areas" style="width:100%;height:1480px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("gallery_bars")
```

## Variations

The same call also covers the other bar-like recipes in
[Recipes masque(fig) extracts](@ref). A recipe that is not in that table
is not a hit target until you add an interactable yourself.

!!! note

    Auto-extraction of these recipes is the same on `:cairo` and `:webgl`.
    This player is the Cairo figure, and hover stays in the overlay: the
    page does not re-run Julia on a click. Reach for `:webgl` when the
    figure is large or you are already on the live canvas. `barplot!` on a
    `PolarAxis` is not this figure; that call is skipped with `@warn`.

