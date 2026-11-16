# `scatter!`

`masque(fig)` makes each marker respond: hovering a marker shows its
`x` and `y`, and a click selects it and sends it to your notebook.
Hover the markers below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-scatter-default" data-masque-embed="plots_scatter" data-masque-segment="default" title="Homes by size and price. Hover a marker, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_scatter"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the scatter as `bind`, so `pick` is that event itself;
with `@bind sel masque(fig)`, it is `sel.scatter`.

| Field | What it holds |
|---|---|
| `index` | the marker's place in your data, so `size_m2[pick.index]` reads it |
| `x`, `y` | the point you plotted, and `z` on an `Axis3` |

On a `PolarAxis`, `x` is the angle and `y` the radius, in the order you
passed them.

## Show your own data

Give each marker a payload, one per marker in the order of your data,
and a tooltip template that uses its fields. The template can use the
marker's own `x` and `y` next to yours:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-scatter-data" data-masque-embed="plots_scatter" data-masque-segment="data" title="The same homes with a tooltip giving each street, its rooms, its size and its price." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_scatter"; segment = "data")
```

A click also returns the payload's fields, so `pick.street` is the
street of the home you clicked. [Tooltips](@ref) lists what a template
can do.

## Select several markers

Pass `select = :many`, and each click adds a marker to the selection or
takes it out again:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-scatter-many" data-masque-embed="plots_scatter" data-masque-segment="many" title="The same homes. Click two markers to select both." style="width:100%;height:420px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_scatter"; segment = "many")
```

With `@bind sel` in front, `sel.scatter` is then a vector of events,
one per selected marker.
See [Select several marks](@ref). To select every marker inside a box
you drag, see [Brush a region](@ref).

## Supported axes

`scatter!` works on a 2D `Axis`, an `Axis3` and a `PolarAxis`. A
marker sized in data units (`markerspace = :data`) responds over its
drawn shape, but on an `Axis3` one drawn with a `marker_offset` is
skipped with a warning.

## Where to go next

To label points into classes with clicks, see [Label points into
classes](@ref). For points drawn as spheres, see
[`meshscatter!`](meshscatter.md).
