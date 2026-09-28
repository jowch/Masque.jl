# Box-select scatter

Drag the box, or one of its corner handles, and release. `picks` becomes
a `Vector{ElementEvent}` with one event per point inside the box,
carrying that point's payload (`group`, `x`, `y`). An empty box gives
`[]`, not `nothing`.

The last cell counts the points in each group and averages their
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
call. `selects = :bars` raises `ArgumentError`. A corner handle resizes
the box in both directions. Dragging the middle of a side resizes it in
that one direction, though no handle is drawn there. When a
`ViewInteractable` is on the same axis, Shift+drag pans instead.

!!! note

    The box works the same way on `:cairo` and `:webgl`, on a 2D axis
    with scale `identity`, `log10`, or `log`. It raises `ArgumentError`
    on `Axis3`, `PolarAxis`, and a categorical axis. This example uses
    CairoMakie. The scatter has 12 points so that every set of points a
    box can enclose could be recorded: any box you drag shows its own
    counts, without Julia running. In a notebook, a box over any number
    of points works the same way. On this site, an example with too many
    possible boxes is shown as a video clip instead (see
    [Compare a cluster](@ref)).
