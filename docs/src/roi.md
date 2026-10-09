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
whose points it collects. Give the scatter an `id` with
[`interactables`](@ref) so the box can refer to it, and pass both to the
same `masque` call:

```julia
pts = interactables(s; id = :pts, payloads = samples)
roi = ROIInteractable(ax; bounds = (4.0, 6.5, 3.8, 6.5), selects = :pts)
```

```julia
@bind picks masque(fig, pts, roi)
```

`bounds` is where the box starts, as `(xmin, xmax, ymin, ymax)` in data
coordinates.

`picks` lists the points inside the box: one [`ElementEvent`](@ref)
per point, holding that point's payload fields, such as `name` and
`group`. It starts with the points inside `bounds`, highlighted, and
each release replaces it with the points inside the box then. A box
with no points inside gives an empty list.

Use `picks` to index your data: `samples[picks]` is the rows of
`samples` inside the box.

If your rows are a `DataFrame`, pass it as `payloads`, with one row per
point in the order you plotted them:

```julia
pts = interactables(s; id = :pts, payloads = df)
```

Then `df[picks, :]` is the rows inside the box. To show an empty table
with the same columns when the box is empty, use `df[1:0, :]`:

```julia
isempty(picks) ? df[1:0, :] : df[picks, :]
```

Only the box sets `picks`: hovering a point, or anything else in the
widget, still shows its tooltip, but clicking it does not change
`picks`. To click marks as well, put them in a separate `masque` call.

## Brush heatmap cells

Name a heatmap or image layer in `selects` instead, and the box returns
one [`GridWindowEvent`](@ref) for the block of cells it covers.
[Brush a block of cells](@ref) shows how to read it.

## Read the box itself

Leave out `selects` and the value is the box: a [`BoundsEvent`](@ref)
with `xmin`, `xmax`, `ymin`, and `ymax`. It starts at `bounds`, so
`box.xmin` works before the first drag. Use this when the region is
what you want, such as a time window, a crop, or a range to fit over.

To start one widget's box where another's was released, pass that
widget's `BoundsEvent` as `bounds`.

## Moving and resizing

Drag inside the box to move it, or drag a corner to resize it in both
directions. Dragging the middle of an edge moves only that edge, and
the pointer changes shape to show which one you are on. If the axis
also has a [`ViewInteractable`](@ref), a plain drag moves the box and
Shift+drag pans the plot. To use the keyboard, press Tab until the
box has focus: the arrow keys move it, Alt with an arrow grows the side
that arrow points to, and Alt+Shift with an arrow shrinks it. See
[Keyboard and screen readers](@ref) for the rest.

## Where it works

`selects` can name a layer of points, or a heatmap or image, and that
layer must be in the same `masque` call. A widget takes one box, and
no threshold or colorbar you pass alongside it, since each owns the
widget's value. The box needs a 2D `Axis`; see
[Supported plots and axes](@ref) for which axes and scales.

For larger examples, [Box-select scatter](@ref) summarizes two groups
of points inside the box, and [Image ROI](@ref) brushes an image.
