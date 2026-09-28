# Inspect a grid

Hover a heatmap or image cell and the tooltip reads `(i,j) = value`.
Click it and your notebook gets the cell's column, row, and value.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-grids-player" data-masque-embed="grids_heatmap" title="Tiny heatmap with overlay cell inspection" style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("grids_heatmap")
```

## Hover and click cells

`masque(fig)` makes every `heatmap!` and `image!` interactive. To choose
the grid yourself, pass the plot to [`RectInteractable`](@ref). You need
this to give a grid its own `id`, for example when a figure has two:

```julia
temps = RectInteractable(ax, p; id = :temps)
```

A click makes `pick` a [`GridCellEvent`](@ref). `pick.i` is the column
and `pick.j` is the row of the matrix you plotted, so `z[pick]` is the
same as `z[pick.i, pick.j]`. `pick.value` is the cell's value. The
clicked cell stays highlighted, and clicking outside the grid keeps the
current selection.

If you have edges and values instead of a plot, pass them as `grid`.
Each edge vector must be monotonic, ascending or descending. The values
form a matrix of size `(length(xedges) - 1, length(yedges) - 1)`:

```julia
cells = RectInteractable(ax; grid = (0.5:1:4.5, 0.5:1:3.5, z), id = :cells)
```

A grid does not take `payloads`. A cell always reports its `i`, `j`,
and `value`. Keep other per-cell data in Julia and look it up with
`pick`.

## Large grids

A 4000 × 4000 heatmap works without any setting. When its cells are
smaller than a screen pixel, hovering shows the cell under the pointer
and its value, and a click still reports the cell's true `i` and `j`.

A color image has no single value per cell, so hovering or clicking it
reports `i` and `j` with `value = nothing`, at any size. To read a
number, pass a [`RectInteractable`](@ref) grid with the values you want,
such as each pixel's intensity.

## Brush a block of cells

Add an [`ROIInteractable`](@ref) with `selects` naming the grid, and
pass both to `masque`:

```julia
cells = RectInteractable(ax, p; id = :cells)
box = ROIInteractable(ax; bounds = (1.0, 3.0, 1.0, 2.0), selects = :cells)
@bind win masque(fig, [cells, box])
```

When you release the box, `win` is a [`GridWindowEvent`](@ref) for the
block of cells under it, and `z[win]` is that block of the matrix.

A box that misses the grid still gives a `GridWindowEvent`, with empty
ranges (`win.i1:win.i2` is `1:0`). `z[win]` is then an empty matrix
rather than an error.

Once the box selects the grid, clicking a cell shows its tooltip but
does not change the value, which stays the box's block. See
[Brush a region](@ref).

## What grids cannot do

You cannot move between heatmap cells with the keyboard, and a cell
cannot start selected with `selected=`. Heatmaps and images on an
`Axis3` or a `PolarAxis` are skipped with a warning. To read values from
the colorbar next to a heatmap, see [Read coordinates](@ref).
