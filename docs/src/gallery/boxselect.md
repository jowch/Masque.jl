# Box-select scatter

Drag the box, or one of its corner handles, and release. The last cell
counts the points inside by group and averages their coordinates.

`picks` is a `Vector{ElementEvent}` with one event per point inside the
box, carrying that point's payload (`group`, `x`, `y`), so
`count(e -> e.group == "A", picks)` counts one group. The events also
work as indices into your data, so `xs[picks]` is the `x` of the points
in the box. An empty box gives `[]` rather than `nothing`. See
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

- Dragging the middle of a side resizes the box in that one direction.
- A box can also select heatmap or image cells: name a grid layer in
  `selects`, as in [Image ROI](@ref).
- To compare the selected points with the rest, plot a histogram from
  them, as in [Compare a cluster](@ref).

`selects` must name a point or grid layer; `selects = :bars` raises
`ArgumentError`. With a [`ViewInteractable`](@ref) on the same axis,
Shift+drag pans instead of moving the box; see [Pan and orbit](@ref).
For the axes a box works on, see [Supported plots and axes](@ref).
