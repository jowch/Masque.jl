# `ablines!`

`masque(fig)` makes each line of an `ablines!` plot respond along its
whole length: hovering a line shows its intercept and slope, and a
click selects it and sends it to your notebook. Hover the two lines
below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-ablines-default" data-masque-embed="plots_ablines" data-masque-segment="default" title="Points with a fitted line and the line y = x. Hover a line, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_ablines"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)`, it is `sel.segments`.

| Field | What it holds |
|---|---|
| `segment_index` | which line, in the order you gave them |
| `intercept`, `slope` | the line's intercept and slope, as you passed them |

The points under the lines are a `scatter!` of their own, so they
respond too, with their own field in the `@bind` value.

## Show your own data

Give each line a payload, one per line in the order you gave them:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-ablines-data" data-masque-embed="plots_ablines" data-masque-segment="data" title="The same lines with a tooltip naming each fit." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_ablines"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`ablines!` works on a 2D `Axis`.

## Where to go next

For flat lines, see [`hlines!` and `vlines!`](hlines.md). For a line
through your own points, see [`lines!`](lines.md).
