# From a heatmap cell to its trace

Click a heatmap cell to see the data behind it. Each cell is a
station's mean temperature for one day of a week, and clicking one
plots that day's hourly readings below, with the daily mean as a dashed
line.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-ex-heatmap-trace" data-masque-embed="example_heatmap_trace" title="Heatmap of daily mean temperature by station and day. Clicking a cell plots that day's hourly readings." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("example_heatmap_trace")
```

## How it works

`masque` makes each heatmap cell clickable, and `bind = hm` makes
`pick` the heatmap's value, so a click makes `pick` a
[`GridCellEvent`](@ref): `daily[pick.i, pick.j]`
is the clicked cell of the matrix you plotted, and `pick.value` is its
value. The last cell recomputes the detail from `pick.i` and `pick.j`,
here from the hourly model and in practice from your raw
measurements.

## Variations

- Look the detail up instead of recomputing it: filter a table of raw
  readings by the clicked day and station.
- Show a table or summary statistics for the clicked cell instead of a
  line plot.
- Brush a block of cells with an [`ROIInteractable`](@ref) whose
  `selects` names the grid; the value is a [`GridWindowEvent`](@ref),
  and `A[win]` is that block of the matrix.

Next, [Inspect a grid](@ref) covers hovering over and clicking cells in
detail.
