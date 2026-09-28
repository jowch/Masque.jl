# Image ROI

Drag the box over the image and release. `region` becomes a
[`GridWindowEvent`](@ref): the pixel ranges `i1:i2` and `j1:j2` inside
the box, both ends included, plus the box's data bounds.
`R[region]` is `R[region.i1:region.i2, region.j1:region.j2]`. The event
holds indices, not pixel values, so you index your own arrays with it.

A `RectInteractable` grid over the image gives the box cells to select.
The box draws the outline, and the pixels inside it are highlighted. See
[Inspect a grid](@ref) and [Brush a region](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-image" data-masque-embed="gallery_image" title="Image ROI" style="width:100%;height:1560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("gallery_image")
```

## Variations

The last cell counts the pixels in the box and prints the median of
each channel. It updates when you release the box, not while you drag.
A box that covers no cells gives a `GridWindowEvent` whose `i1:i2` is
empty, not `[]`.

!!! note

    An image box gives the same event on `:cairo` and `:webgl`, on a 2D
    axis. `Axis3` and `PolarAxis` raise `ArgumentError`. This example
    uses CairoMakie. The image is 8 × 6 cells so that every window a box
    can cover, all 756 of them, could be recorded: any box you drag shows
    its own result. A real image works the same way in a notebook.
