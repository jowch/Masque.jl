# `waterfall!`

`masque(fig)` makes each bar of a waterfall respond: hovering a bar
shows its change and where it starts and ends, and a click selects it
and sends it to your notebook. Hover the bars below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-waterfall-default" data-masque-embed="plots_waterfall" data-masque-segment="default" title="A waterfall of a month's money, from the starting balance through each change. Hover a bar, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_waterfall"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the waterfall as `bind`, so `pick` is that event itself;
with `@bind sel masque(fig)`, it is `sel.waterfall`.

| Field | What it holds |
|---|---|
| `index` | the bar's place in your data, so `1` is the first change |
| `value` | the change you passed for this bar, negative for a fall |
| `low`, `high` | where the bar starts and ends on the `y` axis |

## Show your own data

To name each step and show the running total, give each bar a payload,
one per bar in the order of your data, and a tooltip template that uses
its fields:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-waterfall-data" data-masque-embed="plots_waterfall" data-masque-segment="data" title="The same waterfall with a tooltip giving each step's name, its change and the running total." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_waterfall"; segment = "data")
```

A click also returns the payload's fields, so `pick.step` is the name
of the bar you clicked. [Tooltips](@ref) lists what a template can do.

## Supported axes

`waterfall!` works on a 2D `Axis`. On an `Axis3` or a `PolarAxis`, it
is skipped with a warning.

## Where to go next

For plain bars, see [`barplot!`](barplot.md).
