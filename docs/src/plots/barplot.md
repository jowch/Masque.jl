# `barplot!`

`masque(fig)` makes each bar respond: hovering a bar shows its value
and where it starts and ends, and a click selects it and sends it to
your notebook. Hover the bars below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-barplot-default" data-masque-embed="plots_barplot" data-masque-segment="default" title="Crates of fruit sold, one bar per fruit. Hover a bar, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_barplot"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the bar plot as `bind`, so `pick` is that event itself;
with `@bind sel masque(fig)`, it is `sel.bars`.

| Field | What it holds |
|---|---|
| `index` | the bar's place in your data, so `1` is the first value you passed |
| `value` | the bar's height: `high` minus `low` |
| `low`, `high` | where the bar starts and ends along its value axis |

For bars drawn with `direction = :x`, `low` and `high` are measured
along `x`.

## Show your own data

To show what the axis can't, such as where each fruit is sold, give
each bar a payload, one per bar in the order of your data, and a
tooltip template that uses its fields. The template can use the bar's
own fields, such as `value`, next to yours:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-barplot-data" data-masque-embed="plots_barplot" data-masque-segment="data" title="The same bars with a tooltip giving each fruit, its crates and its stall." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_barplot"; segment = "data")
```

A click also returns the payload's fields, so `pick.fruit` is the name
of the bar you clicked. [Tooltips](@ref) lists what a template can do.

## Stacked and dodged bars

Each segment of a stacked bar, and each bar of a dodged group, is its
own mark. `index` says which segment was hovered or clicked, and `low` and
`high` say where it sits on the stack. The payloads follow the order of
your data, so one per row:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-barplot-stacked" data-masque-embed="plots_barplot" data-masque-segment="stacked" title="Stacked bars of tea and coffee sales by quarter, with a tooltip naming the product of each segment." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_barplot"; segment = "stacked")
```

## Supported axes

`barplot!` works on a 2D `Axis`. On an `Axis3` or a `PolarAxis`, it is
skipped with a warning. Bars turned with `rotate!` are skipped too; to
make rotated bars respond, draw them with `poly!`.

## Where to go next

A `hist!` draws bars from raw data; see [`hist!`](hist.md).
