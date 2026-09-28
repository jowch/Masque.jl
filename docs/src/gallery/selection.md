# Selection round-trip

Click a point on the left, and the same point is highlighted on the
right. The second `masque` call passes the clicked `pick.index` as
`selected=`. `selected=` takes the same indices as `pick.index`: each
point's position in the data you plotted.

Do not pass a widget's own `@bind` value into its own `masque` call:
Pluto reports a cycle and does not run the cell. For `selected=` on one
figure, see [Selection](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-selection" data-masque-embed="gallery_selection" title="Selection round-trip" style="width:100%;height:780px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("gallery_selection")
```

## Variations

This example keeps only the last click. To collect indices across
clicks, create a `Ref` in a cell that does not use `pick`, so it is not
reset, add each click to it, and pass the collected indices as
`selected=` on the second widget. A slider that rebuilds the figure
drops the highlight unless you pass the indices again.

!!! note

    `selected=` highlights the same way on `:cairo` and `:webgl`. This
    example uses CairoMakie. In a running notebook, the right figure
    updates when you click; on this page, each result was recorded ahead
    of time. The two scatters are linked only through the indices you
    pass yourself.
