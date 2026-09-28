# Brush a region

Drag a box across a plot and release it. Your notebook gets what the box
covers: the points inside it, a block of heatmap cells, or the box's own
coordinates. Cells that use the value respond when you release the box,
not while you drag it.

Drag the box over the stations below. The table lists the ones inside:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-roi-table" data-masque-embed="roi_table" title="Stations scatter with a region box and listed @bind table snapshots" style="width:100%;height:1400px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("roi_table")
```

## Pick the points inside a box

An [`ROIInteractable`](@ref) adds the box, and `selects` names the layer
whose points it collects. Give the points an `id` so the box can refer
to them, and pass both to the same `masque` call:

```julia
pts = PointInteractable(ax, s; id = :pts, payloads = samples)
roi = ROIInteractable(ax; bounds = (4.0, 6.5, 3.8, 6.5), selects = :pts)
```

```julia
@bind picks masque(fig, [pts, roi])
```

`bounds` is where the box starts, as `(xmin, xmax, ymin, ymax)` in data
coordinates. After you release the box, `picks` is a
`Vector{ElementEvent}` with one event per point inside, and those points
stay highlighted. An empty box gives an empty vector, not `nothing`, so
one `isempty` check covers it. Each event has its point's payload
(`e.name`, `e.group`), and `samples[picks]` is the rows of your data
inside the box.

If your rows are a `DataFrame`, pass it as `payloads`, with one row per
point in the order you plotted them:

```julia
pts = PointInteractable(ax, s; id = :pts, payloads = df)
```

Then `df[picks, :]` is the rows inside the box. `df[1:0, :]` is an
empty table with the same columns, for before the first release or when
the box is empty:

```julia
if isnothing(picks) || isempty(picks)
    df[1:0, :]
else
    df[picks, :]
end
```

Only the box sets `picks`. Hovering a point still shows its tooltip, but
clicking it does not change `picks`. The click goes to the layer
underneath instead, if it takes clicks, such as an
[`AxisInteractable`](@ref).

## Brush heatmap cells

Name a heatmap or image layer in `selects` instead, and the box returns
one [`GridWindowEvent`](@ref) for the block of cells it covers:
columns `win.i1:win.i2` and rows `win.j1:win.j2`. `A[win]` is that block
of the matrix. Clicking a cell shows its tooltip but does not change the
value, so the value is always a `GridWindowEvent`. See
[Inspect a grid](@ref).

## Read the box itself

Leave out `selects` and the value is the box: a [`BoundsEvent`](@ref)
with `xmin`, `xmax`, `ymin`, and `ymax`. Use this when the region is
what you want, such as a time window, a crop, or a range to fit over.

`bounds` also accepts a `BoundsEvent`, so one widget's box can set where
another's starts. Passing a widget its own box gives a cyclic reference
error in Pluto.

## Moving and resizing

Drag inside the box to move it. Drag a corner to resize it in both
directions, or the middle of an edge to move only that edge. The pointer
changes to show which. If the axis also has a
[`ViewInteractable`](@ref), a plain drag moves the box and Shift+drag
pans the plot. The box cannot be moved with the keyboard.

## Where it works

The box needs a 2D `Axis` with numeric limits and an `identity`,
`log10`, or `log` scale. On an `Axis3`, a `PolarAxis`, or a categorical
axis, `masque` raises an `ArgumentError`. `selects` can name a layer of
points or a heatmap or image, and that layer must be in the same
`masque` call. Bars and lines cannot be brushed. See
[Supported plots and axes](@ref).

For larger examples, [Box-select scatter](@ref) summarizes two groups
of points inside the box, and [Image ROI](@ref) brushes an image.
