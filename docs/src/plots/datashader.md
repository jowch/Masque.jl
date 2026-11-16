# `datashader!`

`masque(fig)` makes each pixel of a `datashader!` plot respond: hovering
a pixel shows how many points fell in it, and a click selects it and
sends it to your notebook. Hover the ring below:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-datashader-default" data-masque-embed="plots_datashader" data-masque-segment="default" title="40,000 points drawn with datashader. Hover a pixel to see how many points fell in it." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_datashader"; segment = "default")
```

## What a click returns

In the figures on this page, hover a pixel to read it; a click works in
your notebook, where it gives a [`GridCellEvent`](@ref): with `@bind pick masque(fig; bind = ds)`,
`pick` is that event itself, and with `@bind sel masque(fig)`, it is
`sel.cells`. Its fields:

| Field | What it holds |
|---|---|
| `i`, `j` | the pixel's place in the grid datashader drew, counted from the bottom left |
| `value` | how many points fell in it |

The grid is the one in the picture, so `i` and `j` say where you
clicked, not which of your points are there. To find those, keep the
points near the click in your own data.

## Show your own data

A tooltip template can use `value`, `i` and `j`:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-datashader-data" data-masque-embed="plots_datashader" data-masque-segment="data" title="The same points with a tooltip giving the count in words." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_datashader"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`datashader!` works on a 2D `Axis`.

## Where to go next

For a few thousand points, a [`scatter!`](scatter.md) gives each point
its own mark; to bin them, see [`hexbin!`](hexbin.md).
