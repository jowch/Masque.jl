# Image ROI

The figure is an RGB image. The box selects a window of cells, not a
list of pixels. On release the bond is one `GridWindowEvent`: 1-based
inclusive `i1:i2` and `j1:j2`, plus the data bounds. `R[region]` is
`R[region.i1:region.i2, region.j1:region.j2]`. The image array stays in
Julia.

The grid layer exists so the brush has cells to land on. The box is the
outline; the enclosed block is fill-only. See [Inspect a grid](@ref)
and [Brush a region](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-image" data-masque-embed="gallery_image" title="Image ROI" style="width:100%;height:1560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("gallery_image")
```

## Variations

The readout counts the pixels in the box and prints the median of each
channel. That cell runs once per committed box, not per pointer frame.
A miss is a `GridWindowEvent` whose `i1:i2` is empty, not `[]`.

!!! note

    An image brush is the same event on `:cairo` and `:webgl`, on a 2D
    axis. `Axis3` and `PolarAxis` raise `ArgumentError`. This player shows
    the Cairo figure, with sixteen recorded windows the size of the
    resting box. A box you drag shows the recorded window it overlaps
    most, and the badge reads **Nearest recorded brush** until your box
    matches one exactly; a live notebook slices the exact window.

