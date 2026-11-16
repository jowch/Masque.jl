# `hist!`

`masque(fig)` makes each bin respond: hovering a bin shows how tall it
is and the range it covers, and a click selects it and sends it to your
notebook. Hover the bins below, then click one, and the cell under the
readout lists the heights in that bin:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-hist-default" data-masque-embed="plots_hist" data-masque-segment="default" title="A histogram of 300 heights. Click a bin to list the heights in it." style="width:100%;height:900px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_hist"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the histogram as `bind`, so `pick` is that event itself;
with `@bind sel masque(fig)`, it is `sel.hist`.

| Field | What it holds |
|---|---|
| `index` | the bin's place from left to right, so `1` is the leftmost |
| `value` | the bin's height: a count with the default `normalization = :none`, a density or a fraction with the others |
| `low`, `high` | the bin's edges |

The cell under the readout uses `pick.low` and `pick.high` to find the
heights in the clicked bin.

## Show your own data

Give the histogram a tooltip template to word the bin in your own
terms. The template uses the bin's own fields:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-hist-data" data-masque-embed="plots_hist" data-masque-segment="data" title="The same histogram with a tooltip giving the number of people and the range of heights." style="width:100%;height:520px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_hist"; segment = "data")
```

[Tooltips](@ref) lists what a template can do, such as the `:.0f` that
rounds a number.

## Supported axes

`hist!` works on a 2D `Axis`. On an `Axis3` or a `PolarAxis`, it is
skipped with a warning.

## Where to go next

To draw bars from values you already have, see [`barplot!`](barplot.md).
