# Image ROI

Drag the box over the image. When you release, the last cell reports
the number of pixels inside the box and the median of each color
channel.

`region` is a [`GridWindowEvent`](@ref) that holds the pixel ranges
inside the box, not the pixel values, so you index your own arrays with
it: `R[region]` is the block of `R` under the box. A
[`GridInteractable`](@ref) over the image gives the box pixels to
select, and `selects = :img` ties the box to it. See
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

- Pass another array of the same size as the image, such as a mask or a
  second channel, and index it with the same event: `mask[region]`.
- Read `region.i1:region.i2` and `region.j1:region.j2` when you need the
  ranges themselves, for example to crop the image with `rgb[region]`
  and plot the crop in another cell.

A box that covers no pixels gives an event whose ranges are empty, so
`R[region]` is an empty matrix rather than an error.

Next, [Box-select scatter](@ref) uses the same box on points.
