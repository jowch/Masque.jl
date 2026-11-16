# Points and lines on an `Axis3`

On an `Axis3`, `masque(fig)` makes a `scatter!`, `meshscatter!` and
`lines!` respond as they do in 2D, with `z` added: hovering a marker
shows its `x`, `y` and `z`, and a click selects it and sends it to your
notebook. Hover the markers below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-points3d-default" data-masque-embed="plots_points3d" data-masque-segment="default" title="Response by dose and age in 3D. Hover a marker, or click one to see what it returns." style="width:100%;height:860px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_points3d"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the scatter as `bind`, so `pick` is that event itself;
with `@bind sel masque(fig)`, it is `sel.scatter`.

| Field | What it holds |
|---|---|
| `index` | the marker's place in your data |
| `x`, `y`, `z` | the point you plotted |

## Show your own data

Give each marker a payload, one per marker in the order of your data.
The template can use `x`, `y` and `z` next to your fields:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-points3d-data" data-masque-embed="plots_points3d" data-masque-segment="data" title="The same markers with a tooltip naming each patient and their response." style="width:100%;height:600px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_points3d"; segment = "data")
```

## Hover lines and spheres

A `lines!` responds along its whole length, with the point you plotted
nearest the pointer, and a `meshscatter!` responds over each sphere,
the one nearer the camera where two overlap:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-points3d-lines" data-masque-embed="plots_points3d" data-masque-segment="lines" title="A helix with spheres along it. Hover the line or a sphere." style="width:100%;height:460px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_points3d"; segment = "lines")
```

## Turn the view

The figures on this page stay put, because turning one has Julia draw
it again. In your notebook, [Explore a 3D figure](@ref) shows how to
orbit the view by dragging.

## Supported plots

On an `Axis3`, `scatter!`, `meshscatter!`, `lines!`, `linesegments!`,
`scatterlines!`, `text!`, `surface!`, `wireframe!` and `arrows3d!`
respond. A `scatter!` sized in data units (`markerspace = :data`) with a
`marker_offset` is skipped with a warning, and so is any other plot,
with a note that names it.

## Where to go next

For a surface, see [`surface!`](surface.md); for arrows,
[`arrows3d!`](arrows3d.md). The 2D pages, [`scatter!`](scatter.md),
[`meshscatter!`](meshscatter.md) and [`lines!`](lines.md), cover the
rest of what each plot can do.
