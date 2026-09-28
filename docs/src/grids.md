# Inspect a grid

Hover a heatmap or image cell and the tooltip reads `(i,j) = value`.
Click it and your notebook gets the cell's indices and value.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-grids-player" data-masque-embed="grids_heatmap" title="Small heatmap. Hover a cell to see its value, or click it." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("grids_heatmap")
```

## Hover and click cells

`masque(fig)` makes every `heatmap!` and `image!` interactive. To choose
the grid yourself, pass the plot to [`RectInteractable`](@ref). Give it
an `id` so a `selects` box can name it and `pick.layer` tells it apart,
for example when a figure has two grids:

```julia
temps = RectInteractable(ax, p; id = :temps)
```

A click makes `pick` a [`GridCellEvent`](@ref). `pick.i` is the cell's
first index in the matrix you plotted and `pick.j` its second, so
`z[pick]` is the same as `z[pick.i, pick.j]`. Makie draws the first
index along x and the second along y. `pick.value` is the cell's value,
and the clicked cell stays highlighted.

A grid does not take `payloads`, so a cell always reports just its
`i`, `j`, and `value`. To use other per-cell data, keep it in Julia and
look it up with `pick`.

## Make a grid from edges and values

If you have edges and values instead of a plot, pass them as `grid`.
Each edge vector must be monotonic, either ascending or descending, and
the values form a matrix of size
`(length(xedges) - 1, length(yedges) - 1)`:

```julia
cells = RectInteractable(ax; grid = (0.5:1:4.5, 0.5:1:3.5, z), id = :cells)
```

## Large grids

A 4000 × 4000 heatmap works without any setting. When its cells are
smaller than a screen pixel, hovering shows the cell under the pointer
and its value, and a click still reports the cell's true `i` and `j`.

A color image has no single value per cell, so hovering or clicking it
reports `i` and `j` with `value = nothing`, at any size. To read a
number instead, pass a [`RectInteractable`](@ref) a grid of the values
you want, such as each pixel's intensity.

## Brush a block of cells

To select a block of cells by dragging a box over them, add an
[`ROIInteractable`](@ref) with `selects` naming the grid, and pass both
to `masque`:

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

While the box selects the grid, clicking a cell does not change `win`;
see [Brush a region](@ref).

## Where to go next

- [Read coordinates](@ref): read values from the colorbar next to a
  heatmap
- [Supported plots and axes](@ref): which axes a heatmap works on
- [Keyboard and screen readers](@ref accessibility-limitations): what
  the keyboard reaches
