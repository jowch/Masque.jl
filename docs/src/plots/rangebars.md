# `rangebars!`

`masque(fig)` makes each range bar respond: hovering a bar shows where
it sits and its two ends, and a click selects it and sends it to your
notebook. Hover the bars below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-rangebars-default" data-masque-embed="plots_rangebars" data-masque-segment="default" title="Monthly low and high temperatures as range bars. Hover a bar, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_rangebars"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)`, it is `sel.rangebars`.

| Field | What it holds |
|---|---|
| `segment_index` | which bar, in the order of your data |
| `x` | where the bar sits; `y` for `direction = :x` |
| `low`, `high` | the bar's two ends |

The tooltip writes `x` the way the axis writes its ticks, so here it
reads "Jun" rather than `6`.

## Show your own data

Give each bar a payload, one per bar in the order of your data:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-rangebars-data" data-masque-embed="plots_rangebars" data-masque-segment="data" title="The same months with a tooltip giving the range in degrees." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_rangebars"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`rangebars!` works on a 2D `Axis`.

## Where to go next

For error bars around a value, see [`errorbars!`](errorbars.md). For a
shaded band across the whole axis, see [`hspan!`](hspan.md).
