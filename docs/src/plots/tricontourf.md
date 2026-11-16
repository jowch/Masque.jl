# `tricontourf!`

`masque(fig)` makes each filled region of a `tricontourf!` plot
respond: hovering a region shows the two levels it lies between, and a
click selects it and sends it to your notebook. Hover the regions
below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-tricontourf-default" data-masque-embed="plots_tricontourf" data-masque-segment="default" title="Lake depth measured at 150 scattered points. Hover a region, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_tricontourf"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)`, it is `sel.poly`.

| Field | What it holds |
|---|---|
| `index` | which region, in Makie's order |
| `low`, `high` | the levels the region lies between |

One level can be several regions, and each region is its own mark with
the same `low` and `high`.

## Show your own data

Makie decides how many regions there are, so give a tooltip template
rather than payloads. The template can use `low` and `high`:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-tricontourf-data" data-masque-embed="plots_tricontourf" data-masque-segment="data" title="The same depths with a tooltip giving each region's range in meters." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_tricontourf"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`tricontourf!` works on a 2D `Axis`.

## Where to go next

For data on a regular grid, see [`contourf!`](contourf.md).
