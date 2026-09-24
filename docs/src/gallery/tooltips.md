# Tooltip templates

Hover a marker. The tooltip is a `masque"..."` template: `$(city)` is a
field on that point's payload, and `$(pop:,)` is a
[d3-format](https://d3js.org/d3-format) spec, so `37000000` reads as
`37,000,000`. A value that contains HTML is escaped. Markup you write in
the template is not.

Click writes `@bind`. The readout below the figure names the city. Hover
does not change the bond.

For the template rules, see [Tooltips](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-tooltips" data-masque-embed="gallery_tooltips" title="Tooltip templates" style="width:100%;height:1320px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("gallery_tooltips")
```

## Variations

Leave `tooltip` unset and the overlay draws a name/value table from the
payload. `tooltip_bg`, `tooltip_color`, `tooltip_caret`, and
`tooltip_radius` on `masque` theme that card for the whole figure:

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

    The overlay is the same code on `:cairo` and `:webgl`. This player is
    the Cairo figure: hover is drawn on the page, and the listed clicks are
    snapshots of the readout. Load `WGLMakie` alone when you want the figure
    on a live canvas. Hover, highlight, and the click readout match on both
    backends.

