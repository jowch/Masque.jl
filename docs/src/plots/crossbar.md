# `crossbar!`

`masque(fig)` makes each crossbar respond: hovering one shows its
middle line and its ends, and a click selects it and sends it to your
notebook. Hover the crossbars below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-crossbar-default" data-masque-embed="plots_crossbar" data-masque-segment="default" title="Crossbars of the response at four doses. Hover a crossbar, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_crossbar"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the crossbar plot as `bind`, so `pick` is that event
itself; with `@bind sel masque(fig)`, it is `sel.crossbar`.

| Field | What it holds |
|---|---|
| `index` | the crossbar's place in your data, so `1` is the first |
| `midpoint` | where its middle line sits |
| `low`, `high` | its lower and upper ends |

For crossbars drawn with `orientation = :horizontal`, these are
measured along `x`.

## Show your own data

To name each crossbar and add what the axis can't show, give each one a
payload, one per crossbar in the order of your data, and a tooltip
template that uses its fields:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-crossbar-data" data-masque-embed="plots_crossbar" data-masque-segment="data" title="The same crossbars with a tooltip giving each dose, its mean and its number of patients." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_crossbar"; segment = "data")
```

A click also returns the payload's fields, so `pick.dose` is the dose
you clicked. [Tooltips](@ref) lists what a template can do.

## Supported axes

`crossbar!` works on a 2D `Axis`. On an `Axis3` or a `PolarAxis`, it is
skipped with a warning.

## Where to go next

For the spread of the data itself, see [`boxplot!`](boxplot.md) and
[`violin!`](violin.md).
