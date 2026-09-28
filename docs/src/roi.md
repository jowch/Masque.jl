# Brush a region

Drag a box across a plot and release it. Your notebook gets what the box
covers: the points inside it, a block of heatmap cells, or the box's own
coordinates. Cells that use the value respond when you release the box,
not while you drag it.

Drag the box over the stations below. The table lists the ones inside:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-roi-table" data-masque-embed="roi_table" title="Stations scatter with a box. Drag the box and the table lists the stations inside." style="width:100%;height:1400px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
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
coordinates.

When you release the box, the points inside it stay highlighted, and
`picks` lists them: one [`ElementEvent`](@ref) per point, holding that
point's payload fields, such as `name` and `group`. A box with no points
inside gives an empty list.

Use `picks` to index your data: `samples[picks]` is the rows of
`samples` inside the box.

If your rows are a `DataFrame`, pass it as `payloads`, with one row per
point in the order you plotted them:

```julia
pts = PointInteractable(ax, s; id = :pts, payloads = df)
```

Then `df[picks, :]` is the rows inside the box. To show an empty table
with the same columns before the first release or when the box is empty,
use `df[1:0, :]`:

```julia
if isnothing(picks) || isempty(picks)
    df[1:0, :]
else
    df[picks, :]
end
```

Only the box sets `picks`: hovering a point still shows its tooltip,
but clicking it does not change `picks`. The exception is an
[`AxisInteractable`](@ref) in the same widget: it takes clicks anywhere
on its axis, so a click there replaces `picks` with an
[`AxisEvent`](@ref). To keep `picks` a vector, put the axis readout in a
separate `masque` call.

## Brush heatmap cells

Name a heatmap or image layer in `selects` instead, and the box returns
one [`GridWindowEvent`](@ref) for the block of cells it covers.
[Brush a block of cells](@ref) shows how to read it.

## Read the box itself

Leave out `selects` and the value is the box: a [`BoundsEvent`](@ref)
with `xmin`, `xmax`, `ymin`, and `ymax`. Use this when the region is
what you want, such as a time window, a crop, or a range to fit over.

To start one widget's box where another's was released, pass that
widget's `BoundsEvent` as `bounds`.

## Moving and resizing

Drag inside the box to move it, or drag a corner to resize it in both
directions. Dragging the middle of an edge moves only that edge, and
the pointer changes shape to show which one you are on. If the axis
also has a [`ViewInteractable`](@ref), a plain drag moves the box and
Shift+drag pans the plot. Moving the box needs a pointer; see
[Keyboard and screen readers](@ref) for what the keyboard reaches.

## Where it works

`selects` can name a layer of points, or a heatmap or image, and that
layer must be in the same `masque` call. All the boxes in one widget
must name the same layer. The box needs a 2D `Axis`; see
[Supported plots and axes](@ref) for which axes and scales.

For larger examples, [Box-select scatter](@ref) summarizes two groups
of points inside the box, and [Image ROI](@ref) brushes an image.
