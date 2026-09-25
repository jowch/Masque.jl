# Brush a region

Drag a box across a plot and release it; the notebook gets what the box
covers. That can be the points inside it, a block of heatmap cells, or
just the box's coordinates. While you drag, only the box moves — Julia
runs once, when you let go.

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

An [`ROIInteractable`](@ref) draws the box; `selects` names the layer
whose marks it collects. Give the points an `id` so the box can refer to
them, and pass both to the same `masque` call:

```julia
pts = PointInteractable(ax, s; id = :pts, payloads = samples)
roi = ROIInteractable(ax; bounds = (4.0, 6.5, 3.8, 6.5), selects = :pts)
```

```julia
@bind picks masque(fig, [pts, roi])
```

`bounds` is where the box starts, as `(xmin, xmax, ymin, ymax)` in data
coordinates. After a release, `picks` is a `Vector{ElementEvent}` with
one event per enclosed point, and the points inside stay highlighted. An
empty box gives an empty vector, not `nothing`, so one `isempty` check
covers it. Each event carries its point's payload (`e.name`,
`e.group`), and the vector indexes your data directly: `samples[picks]`
is the rows inside the box.

If your rows are a `DataFrame`, pass it as `payloads` — one row per
point, in the order you plotted them — and slice it with the events:

```julia
pts = PointInteractable(ax, s; id = :pts, payloads = df)
```

```julia
picks === nothing || isempty(picks) ? df[1:0, :] : df[picks, :]
```

Clicking one of those points in the same widget also returns a vector
(with one event), so the downstream cell treats a click and a brush the
same way.

## Brush heatmap cells

Point `selects` at a heatmap or image layer instead, and the box returns
one [`GridWindowEvent`](@ref) describing the block of cells it covers:
`win.i1:win.i2` columns and `win.j1:win.j2` rows, so `A[win]` is that
sub-matrix. The box owns the value: clicking a cell outside it shows the
tooltip but leaves the value alone, so the value is always a
`GridWindowEvent`. See [Inspect a grid](@ref).

## Read the box itself

Leave out `selects` and the value is the box: a [`BoundsEvent`](@ref)
with `xmin`, `xmax`, `ymin`, and `ymax`. Use this when the region is the
result — a time window, a crop, a range to fit over. `bounds` accepts a
`BoundsEvent` too, so one widget's box can seed another's; passing a
widget its own box back would be a cyclic reference in Pluto.

## Moving and resizing

Drag inside the box to move it, a corner to resize it in both
directions, or the middle of an edge to move just that edge; the pointer
changes to show which. If the axis also has a
[`ViewInteractable`](@ref), a plain drag moves the box and Shift+drag pans
the plot. The box cannot be moved with the keyboard.

## Where it works

The box needs a 2D `Axis` with numeric limits and a scale the browser can
invert (`identity`, `log10`, or `log`); on an `Axis3`, a `PolarAxis`, or
a categorical axis it raises an `ArgumentError` when `masque` runs.
`selects` can name a layer of points or a heatmap/image, and that layer
must be in the same `masque` call; bars and lines cannot be brushed. See
[Supported plots and axes](@ref).

For a larger example, [Box-select scatter](@ref) summarizes two groups of
points inside the box, and [Image ROI](@ref) brushes an image.
