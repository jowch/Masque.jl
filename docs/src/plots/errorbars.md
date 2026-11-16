# `errorbars!`

`masque(fig)` makes each error bar respond: hovering a bar shows the
value it belongs to and its two ends, and a click selects it and sends
it to your notebook. Hover a bar's whiskers or ends below, since its
middle sits under a marker, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-errorbars-default" data-masque-embed="plots_errorbars" data-masque-segment="default" title="Mean response at five doses with error bars. Hover a bar, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_errorbars"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)`, it is `sel.errorbars`.

| Field | What it holds |
|---|---|
| `segment_index` | which bar, in the order of your data |
| `x`, `y` | the point the bar belongs to |
| `low`, `high` | the bar's two ends, in data units |

The markers drawn over the means are a `scatter!` of their own, so they
respond too, with their own field in the `@bind` value.

## Show your own data

Give each bar a payload, one per bar in the order of your data. A
click then returns the payload's fields, and the bar's place moves from
`segment_index` to `pick.index`:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-errorbars-data" data-masque-embed="plots_errorbars" data-masque-segment="data" title="The same error bars with a tooltip giving the dose and the mean with its error." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_errorbars"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`errorbars!` works on a 2D `Axis`.

## Where to go next

For bars from a low to a high value with no center, see
[`rangebars!`](rangebars.md). For a box around each value, see
[`crossbar!`](crossbar.md).
