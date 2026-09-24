# Box-select scatter

Drag the box, or a corner grip, and release. The bond is a
`Vector{ElementEvent}`, one event per enclosed point, with that point's
payload (`group`, `x`, `y`). An empty box is `[]`, not `nothing`.

The readout counts the two groups and the mean of the enclosed
coordinates. `xs[picks]` uses the events as indices. See
[Brush a region](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-boxselect" data-masque-embed="gallery_boxselect" title="Box-select scatter" style="width:100%;height:1400px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("gallery_boxselect")
```

## Variations

`selects` names a `:circles` or `:grid` layer in the same `masque`
call. `selects = :bars` raises `ArgumentError`. A corner grip resizes
both axes. The middle of a side resizes that one axis, with no grip
drawn there. Shift+drag pans instead, when a `ViewInteractable` is on
the same axis.

!!! note

    The brush is the same on `:cairo` and `:webgl` on a 2D axis with scale
    `identity`, `log10`, or `log`. It raises `ArgumentError` on `Axis3`,
    `PolarAxis`, and a categorical axis. This player is the Cairo figure.
    The listed brushes are snapshots, so the counts update without a
    kernel. A drag you perform yourself on this page moves the box in the
    overlay and does not recompute the mean.

