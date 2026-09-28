# Limits

The axis has `limits = (0, 6, 0, 40)`. Every marker inside those limits
responds to hover and clicks, including the point on the right edge.
Hover over or click a marker.

To move the view by dragging, without rebuilding the widget, see
[Drag to pan](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-limits" data-masque-embed="gallery_limits" title="Limits slider" style="width:100%;height:1100px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("gallery_limits")
```

## Variations

To change the limits from a slider, rebuild the figure with the new
limits, or with a new `azimuth` and `elevation` on an `Axis3`. The hit
areas follow the new view. To keep a selection across the rebuild, pass
it as `selected=` in the new `masque` call, and keep the indices in a
`Ref` in a cell that does not use the slider. `selected=` holds
selected marks, not a camera position.

!!! note

    Hit areas follow new limits the same way on `:cairo` and `:webgl`.
    This notebook has no slider. To move the view while you drag, see
    [Drag to pan](@ref) and [Drag to orbit](@ref).
