# Compare a cluster

A brush is the natural way to ask "what is different about these
points?". Drag the box over a cluster and release; the histogram under
the scatter compares that cluster's `z` with every sample. Hover any
point to read its measurements.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-ex-cluster" data-masque-embed="example_cluster" title="Scatter of 150 samples with a box; a histogram compares z inside the box with all samples" style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("example_cluster")
```

On this page the two clusters are recorded as snapshots; in your own
notebook, every release recomputes the histogram.

## How it works

Each point's payload carries its three measurements, so the tooltip
shows them without any extra code. The [`ROIInteractable`](@ref) names
the points' layer with `selects = :pts`, so releasing the box makes
`picks` a vector with one event per point inside. That vector indexes
your data directly — `zs[picks]` is the `z` of the points in the box —
and the last cell draws an ordinary Makie figure from it.

## Variations

- Keep your samples in a `DataFrame` and pass it as `payloads`; then
  `df[picks, :]` is the rows inside the box, ready for any summary.
- Replace the histogram with whatever the comparison needs: a table of
  means, a second scatter of two other columns, or a model fitted to the
  selected points only.

[Brush a region](@ref) covers the box itself; [Linked views](@ref)
covers driving other plots from a selection.
