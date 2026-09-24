# From a heatmap cell to its trace

A heatmap summarizes. Clicking a cell should take you back to the data
behind the summary. Here each cell is a station's mean temperature for
one day; click one and the plot below shows that day's hourly readings,
with the daily mean as a dashed line.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-ex-heatmap-trace" data-masque-embed="example_heatmap_trace" title="Heatmap of daily mean temperature by station and day; clicking a cell plots that day's hourly readings" style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("example_heatmap_trace")
```

On this page four cells are recorded as snapshots; in your own notebook,
every click redraws the day.

## How it works

[`RectInteractable`](@ref) makes each heatmap cell clickable. A click
makes `pick` a [`GridCellEvent`](@ref): `pick.i` is the column (the day)
and `pick.j` the row (the station), both 1-based, so they index the same
data the heatmap was built from, and `pick.value` is the cell's value.
The last cell uses `pick.i` and `pick.j` to recompute the detail — here
from the hourly model, in practice from your raw measurements.

## Variations

- Look the detail up instead of recomputing it: filter a table of raw
  readings by the clicked day and station.
- Show a table or summary statistics for the clicked cell instead of a
  line plot.
- Brush a block of cells with an [`ROIInteractable`](@ref) whose
  `selects` names the grid; the value is a [`GridWindowEvent`](@ref),
  and `A[win]` is that block of the matrix.

[Inspect a grid](@ref) covers hovering and clicking cells in detail.
