# Tooltip templates

Hover over a city to see its tooltip, then click it. The tooltip is a
`masque"..."` template: `$(city)` is a field of that point's payload,
and `$(pop:,)` formats `pop` with a
[d3-format](https://d3js.org/d3-format) spec, so `37000000` reads as
`37,000,000`. HTML you write in the template is rendered. HTML inside a
payload value is shown as plain text.

Clicking a city updates `pick`, and the last cell names it. Hovering
does not change `pick`. For the template rules, see [Tooltips](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-tooltips" data-masque-embed="gallery_tooltips" title="Tooltip templates" style="width:100%;height:1320px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("gallery_tooltips")
```

## Variations

Without `tooltip`, the tooltip is a table of the payload's fields. To
change the tooltip's style for the whole figure, pass `tooltip_*`
keywords to `masque`. [Tooltip styling](@ref) lists them all.

```julia
masque(
    fig, ints;
    tooltip_bg = :midnightblue,
    tooltip_color = :white,
    tooltip_caret = false,
    tooltip_radius = 8,
)
```

!!! note

    Tooltips work the same way on `:cairo` and `:webgl`. This example
    uses CairoMakie, and each click shows a result recorded ahead of
    time. Load only `WGLMakie` when you want the figure on a live canvas.
