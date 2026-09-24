# Selection round-trip

Click a point on the left. That index is passed as `selected=` on a
second `masque` call, which highlights the same mark. The two widgets
do not share an overlay. The highlight on the right is in the manifest
for that figure.

`selected=` takes 1-based indices. The readout prints `pick.index` that way.

Do not pass this widget's own bond into the same `masque` call. Pluto
reports a cycle and does not run the cell. For `selected=` on one
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

The player keeps the last click. To accumulate indices across clicks,
store them in a `Ref` in a cell that does not read this `@bind`, then
pass the growing set as `selected=` on the second widget. A slider that
rebuilds the figure drops the highlight unless you pass that set again.
See [Limits](@ref).

!!! note

    `selected=` highlights the same way on `:cairo` and `:webgl`.
    This player is the Cairo figure. A live notebook re-runs the second
    widget when the bond changes; the snapshots here are those re-runs,
    baked in. There is no same-index link between two scatters beyond the
    indices you pass yourself.

