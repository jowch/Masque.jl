# Bars and areas

`masque(fig)` picks up histogram bins, waterfall bars, crossbar ranges,
bar plots, and horizontal and vertical spans, with no interactable
written by hand. Hover over a bar, a band, or a range to see its values.

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
does not respond until you add an interactable for it yourself.

!!! note

    `masque(fig)` picks up these recipes the same way on `:cairo` and
    `:webgl`. This example uses CairoMakie and has no cell that uses a
    click. Use `:webgl` when the figure is large or you already work on
    WGLMakie's live canvas. On a `PolarAxis`, `masque(fig)` skips
    `barplot!` with a `@warn`.
