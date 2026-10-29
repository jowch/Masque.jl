# Text labels

Click a label and its event's `text` is its string. `masque(fig)` makes
`text!` and `annotation!` labels clickable, including the tilted one.
The event is an `ElementEvent` that also has the label's `index`, `x`,
and `y`.

Each `text!` call and the `annotation!` get their own field in `sel`,
named by `bind`, so the last cell reads `sel.labels`, `sel.tilted`, and
`sel.note`, and names each label that is selected. Without `bind`, the
fields are named after the plots, such as `sel.text` and `sel.text_2`,
and the markers get `sel.scatter`.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-text" data-masque-embed="gallery_text" title="Text labels" style="width:100%;height:1320px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("gallery_text")
```

## Variations

The clickable area is a box around the label that follows its `offset`
and `fontsize`, and a rotated label gets one box, aligned with the axes
and a little larger than the text. A label placed in screen space rather
than data space does not respond; `masque(fig)` skips it with a
`@warn`.

Next, [What each mark returns](@ref) covers clicking other kinds of mark.
