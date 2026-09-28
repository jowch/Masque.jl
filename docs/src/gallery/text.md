# Text labels

`masque(fig)` makes `text!` and `annotation!` labels in data space
clickable, using a box sized from Makie's own text bounds. A rotated
label still gets one box, aligned with the axes and a little larger
than the text. Click a label, and `pick` becomes an `ElementEvent` with
`text`, `index`, `x`, and `y`.

The scatter on the same axis responds too. A marker click has no
`text` field, so the last cell checks for one.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-text" data-masque-embed="gallery_text" title="Text labels" style="width:100%;height:1320px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("gallery_text")
```

## Variations

The box follows the label's `offset` and `fontsize`. An `annotation!`
label responds the same way as `text!`. A label in screen space, rather
than data space, does not respond; `masque(fig)` skips it with a
`@warn`.

!!! note

    Labels respond the same way on `:cairo` and `:webgl`. This example
    uses CairoMakie, and every label and marker click was recorded ahead
    of time. Because `masque(fig)` also makes the scatter clickable,
    check `hasproperty(pick, :text)` in your notebook before reading the
    string.
