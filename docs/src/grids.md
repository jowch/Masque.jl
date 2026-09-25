# Inspect a grid

A heatmap or an image is a grid of cells rather than a list of marks.
Hover a cell and the card reads `(i,j) = value`; click it and your
notebook gets the cell's column, row, and value.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-grids-player" data-masque-embed="grids_heatmap" title="Tiny heatmap with overlay cell inspection" style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("grids_heatmap")
```

## Hover and click cells

`masque(fig)` picks up every `heatmap!` and `image!` on its own. To
choose the grid yourself — for example to give it an `id` when a figure
has two — pass the plot to [`RectInteractable`](@ref):

```julia
cells = RectInteractable(ax, p)
```

A click makes `pick` a [`GridCellEvent`](@ref). `pick.i` is the column
and `pick.j` the row, both 1-based, so they index the matrix you plotted:
`z[pick]` is the same as `z[pick.i, pick.j]`, and `pick.value` is the
cell's value. As with other marks, the clicked cell stays highlighted,
and a click outside the grid leaves the selection alone.

If you have edges and values rather than a plot, pass them as a grid.
Each edge vector must be monotonic (ascending or descending), and the
values form a matrix of size `(length(xedges) - 1, length(yedges) - 1)`:

```julia
cells = RectInteractable(ax; grid = (0.5:1:4.5, 0.5:1:3.5, z), id = :cells)
```

A cell's payload is always its `i`, `j`, and `value`; grids do not take
`payloads`. Keep per-cell data in Julia and look it up with `pick`.

## Large grids

A heatmap can have far more cells than the screen has pixels, and
shipping every value to the browser would make the notebook slow. When
cells are smaller than a screen pixel, Masque sends one sample per
pixel instead: hovering shows the cell under the pointer and its value,
and a click still reports the true `i` and `j`. A 4000 × 4000 heatmap
works this way without any setting.

Colour images have no single value per cell, so hovering or clicking
one reports `i` and `j` with `value = nothing`, whatever its size. To
read a number, pass a [`RectInteractable`](@ref) grid with the values
you want, such as each pixel's intensity.

## Brush a block of cells

Add an [`ROIInteractable`](@ref) with `selects` naming the grid, and a
drag returns one [`GridWindowEvent`](@ref) for the block of cells under
the box: `A[win]` is that sub-matrix. A box that misses the grid still
returns one `GridWindowEvent`, with empty ranges (`win.i1:win.i2` is
`1:0`), so `A[win]` is an empty matrix rather than an error. Once a box
brushes the grid, clicking a cell no longer commits a `GridCellEvent`:
the cells still show their tooltip, and the value stays the box's
window. See [Brush a region](@ref).

## What grids cannot do

Heatmap cells cannot be reached with the keyboard — arrowing through
thousands of cells is not useful — and they cannot start selected with
`selected=`. Heatmaps and images on an `Axis3` or a `PolarAxis` are
skipped with a warning. A colorbar next to a heatmap is a separate
readout of values; see [Read coordinates](@ref).
