# Selection round-trip

Click a point on the left, and the same sample is highlighted on the
right, where it is plotted against another column. The second `masque`
call passes the clicked `pick.index` as `selected=`. Both use each
point's position in the data you plotted, so the index matches as long
as both plots list the samples in the same order.

Nothing links the two plots except your code: the second `masque` call
reads `pick.index`.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gal-selection" data-masque-embed="gallery_selection" title="Selection round-trip" style="width:100%;height:780px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("gallery_selection")
```

## Variations

- This example keeps only the last click. To collect indices across
  clicks, create a `Ref` in a cell that does not use `pick`, so it is
  not reset, add each click to it, and pass the collected indices as
  `selected=` on the second widget.
- A slider that rebuilds the figure drops the highlight unless you pass
  the indices again.
- Passing a widget's own `pick` back into the same `masque` call does
  not work; see [Selection](@ref) for highlighting on one figure.

Next, [Linked views](@ref) updates other plots from a selection.
