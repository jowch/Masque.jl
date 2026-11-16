# `poly!`

`masque(fig)` makes each polygon of a `poly!` plot respond: hovering a
polygon shows which one it is, and a click selects it and sends it to
your notebook. Hover the fields below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-poly-default" data-masque-embed="plots_poly" data-masque-segment="default" title="Four fields drawn as polygons. Hover a field, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_poly"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with one field. Here the figure
passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)`, it is `sel.poly`.

| Field | What it holds |
|---|---|
| `index` | which polygon, in the order you gave them |

`crop[pick.index]` reads your own label for it.

## Show your own data

A polygon has nothing to report but its place, so give each one a
payload, one per polygon in the order you gave them. The tooltip then
shows your fields, and a click returns them:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-poly-data" data-masque-embed="plots_poly" data-masque-segment="data" title="The same fields with a tooltip naming the crop." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_poly"; segment = "data")
```

Inside a polygon's hole, the pointer reaches whatever is drawn there,
not the polygon. [Tooltips](@ref) lists what a template can do.

## Supported axes

`poly!` works on a 2D `Axis`.

## Where to go next

For shapes you did not draw with `poly!`, pass their outlines to a
[`PolygonInteractable`](@ref).
